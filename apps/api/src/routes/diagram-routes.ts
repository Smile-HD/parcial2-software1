/**
 * Rutas REST Fastify para CRUD de Diagramas (POST, GET, PUT).
 * Aplica concurrencia optimista y auto-recuperación de blobs Yjs.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { DiagramSchema, type Diagram } from '@app/core';
import {
  CreateDiagramBodySchema,
  UpdateDiagramBodySchema,
  CreateDiagramBodyJsonSchema,
  UpdateDiagramBodyJsonSchema,
  DiagramResponseJsonSchema,
  ErrorResponseJsonSchema,
  ConflictResponseJsonSchema,
  mapRowToResponse,
  preparePersistence,
  loadDiagramFromRow,
} from './persistence.js';

export function registerDiagramRoutes(app: FastifyInstance, pool: Pool): void {
  // POST /diagrams — crea un nuevo diagrama
  app.post<{ Body: z.infer<typeof CreateDiagramBodySchema> }>(
    '/diagrams',
    { schema: { body: CreateDiagramBodyJsonSchema, response: { 201: DiagramResponseJsonSchema } } },
    async (request, reply) => {
      const { name, diagram: diagramData } = request.body;

      const diagramId = diagramData.id ?? uuidv7();
      const validatedDiagram = DiagramSchema.parse({ ...diagramData, id: diagramId });

      let persisted: { doc: Diagram; yjsState: Buffer; version: number };
      try {
        persisted = preparePersistence(validatedDiagram, request.body.yjsState);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Invalid yjsState')) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
      const { doc, yjsState, version } = persisted;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO diagrams (id, name, doc, yjs_state, version)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, doc, yjs_state, version, created_at, updated_at`,
          [diagramId, name, JSON.stringify(doc), yjsState, version]
        );
        await client.query('COMMIT');

        const row = result.rows[0];
        return reply.status(201).send(mapRowToResponse({
          ...row,
          doc: row.doc,
          yjs_state: row.yjs_state,
        }));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  );

  // GET /diagrams/:id — carga el diagrama con auto-recuperación (self-healing)
  app.get<{ Params: { id: string } }>(
    '/diagrams/:id',
    { schema: { response: { 200: DiagramResponseJsonSchema, 404: ErrorResponseJsonSchema } } },
    async (request, reply) => {
      const { id } = request.params;

      const result = await pool.query(
        'SELECT id, name, doc, yjs_state, version, created_at, updated_at FROM diagrams WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Diagram not found' });
      }

      const row = result.rows[0];

      try {
        const { diagram, version } = await loadDiagramFromRow({
          id: row.id,
          name: row.name,
          doc: row.doc,
          yjs_state: row.yjs_state,
          version: row.version,
        });

        return reply.send(mapRowToResponse({
          id: row.id,
          name: row.name,
          doc: diagram,
          yjs_state: row.yjs_state,
          version,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : 'Diagram load failed' });
      }
    }
  );

  // PUT /diagrams/:id — actualiza con concurrencia optimista
  app.put<{ Params: { id: string }; Body: z.infer<typeof UpdateDiagramBodySchema> }>(
    '/diagrams/:id',
    { schema: { body: UpdateDiagramBodyJsonSchema, response: { 200: DiagramResponseJsonSchema, 404: ErrorResponseJsonSchema, 409: ConflictResponseJsonSchema } } },
    async (request, reply) => {
      const { id } = request.params;
      const { name, diagram: diagramData, version: expectedVersion } = request.body;

      const validatedDiagram = DiagramSchema.parse({ ...diagramData, id });

      let persisted: { doc: Diagram; yjsState: Buffer; version: number };
      try {
        persisted = preparePersistence(validatedDiagram, request.body.yjsState);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Invalid yjsState')) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
      const { doc, yjsState } = persisted;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE diagrams
           SET name = COALESCE($2, name),
               doc = $3,
               yjs_state = $4,
               version = version + 1,
               updated_at = now()
           WHERE id = $1 AND version = $5
           RETURNING id, name, doc, yjs_state, version, created_at, updated_at`,
          [id, name ?? null, JSON.stringify(doc), yjsState, expectedVersion]
        );
        await client.query('COMMIT');

        if (result.rows.length === 0) {
          const check = await client.query('SELECT version FROM diagrams WHERE id = $1', [id]);
          if (check.rows.length === 0) {
            return reply.status(404).send({ error: 'Diagram not found' });
          }
          return reply.status(409).send({
            error: 'Version conflict: diagram was modified by another request',
            currentVersion: check.rows[0].version,
          });
        }

        const row = result.rows[0];
        return reply.send(mapRowToResponse({
          ...row,
          doc: row.doc,
          yjs_state: row.yjs_state,
        }));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  );
}
