/**
 * Utilidades de persistencia y serialización Yjs/PostgreSQL para diagramas.
 */
import { Pool } from 'pg';
import * as Y from 'yjs';
import { z } from 'zod';
import {
  type Diagram,
  DiagramSchema,
  buildYDocFromDiagram,
  encodeYDoc,
  loadYDocFromUpdate,
  validateYDocProjection,
} from '@app/core';

export const CreateDiagramBodySchema = z.object({
  name: z.string().min(1),
  diagram: DiagramSchema,
  yjsState: z.string().min(1).optional(),
}).strict();

export const UpdateDiagramBodySchema = z.object({
  name: z.string().min(1).optional(),
  diagram: DiagramSchema,
  version: z.number().int().positive(),
  yjsState: z.string().min(1).optional(),
}).strict();

export const DiagramResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  diagram: DiagramSchema,
  yjsState: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ErrorResponseSchema = z.object({ error: z.string() });
export const ConflictResponseSchema = z.object({ error: z.string(), currentVersion: z.number() });

export const CreateDiagramBodyJsonSchema = z.toJSONSchema(CreateDiagramBodySchema, { target: 'draft-7' });
export const UpdateDiagramBodyJsonSchema = z.toJSONSchema(UpdateDiagramBodySchema, { target: 'draft-7' });
export const DiagramResponseJsonSchema = z.toJSONSchema(DiagramResponseSchema, { target: 'draft-7' });
export const ErrorResponseJsonSchema = z.toJSONSchema(ErrorResponseSchema, { target: 'draft-7' });
export const ConflictResponseJsonSchema = z.toJSONSchema(ConflictResponseSchema, { target: 'draft-7' });

export function mapRowToResponse(row: {
  id: string;
  name: string;
  doc: Diagram;
  yjs_state: Buffer;
  version: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    diagram: row.doc,
    yjsState: row.yjs_state.toString('base64'),
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function preparePersistence(
  diagram: Diagram,
  yjsStateBase64?: string,
): { doc: Diagram; yjsState: Buffer; version: number } {
  if (yjsStateBase64 !== undefined) {
    let update: Uint8Array;
    try {
      if (!BASE64_PATTERN.test(yjsStateBase64)) {
        throw new Error('not base64');
      }
      update = new Uint8Array(Buffer.from(yjsStateBase64, 'base64'));
      const decoded = validateYDocProjection(loadYDocFromUpdate(update));
      if (!decoded.ok) {
        throw new Error('projection failed schema validation');
      }
      return { doc: decoded.diagram, yjsState: Buffer.from(update), version: 1 };
    } catch (error) {
      const reason = error instanceof Error && error.message !== 'not base64' ? error.message : 'cannot decode Y.Doc';
      throw new Error(`Invalid yjsState blob: ${reason}`);
    }
  }

  const yDoc = buildYDocFromDiagram(diagram);
  const update = encodeYDoc(yDoc);
  const yjsState = Buffer.from(update);
  const validation = validateYDocProjection(yDoc);
  if (!validation.ok) {
    throw new Error('Y.Doc projection validation failed after build');
  }
  return { doc: validation.diagram, yjsState, version: 1 };
}

export async function loadDiagramFromRow(row: {
  id: string;
  name: string;
  doc: unknown;
  yjs_state: Buffer;
  version: number;
}): Promise<{ diagram: Diagram; yjsState: Buffer; version: number }> {
  let yDoc: Y.Doc;
  try {
    yDoc = loadYDocFromUpdate(new Uint8Array(row.yjs_state));
  } catch {
    throw new Error('Corrupt yjs_state blob: cannot decode Y.Doc');
  }

  const validation = validateYDocProjection(yDoc);
  if (validation.ok) {
    return { diagram: validation.diagram, yjsState: row.yjs_state, version: row.version };
  }

  try {
    const storedDoc = DiagramSchema.parse(row.doc);
    const rebuiltYDoc = buildYDocFromDiagram(storedDoc);
    const rebuiltUpdate = encodeYDoc(rebuiltYDoc);
    if (Buffer.compare(Buffer.from(rebuiltUpdate), row.yjs_state) !== 0) {
      throw new Error('yjs_state blob corrupt and does not match stored doc');
    }
    return { diagram: storedDoc, yjsState: row.yjs_state, version: row.version };
  } catch {
    throw new Error('Diagram load failed: corrupt yjs_state blob and invalid stored doc');
  }
}

export class DiagramNotFoundError extends Error {
  override readonly name = 'DiagramNotFoundError';
  constructor(id: string) {
    super(`Diagram not found: ${id}`);
  }
}

export async function loadDiagramById(
  id: string,
  poolInstance?: Pool
): Promise<{ row: any; diagram: Diagram; version: number }> {
  const p = poolInstance ?? (await import('../index.js')).pool;
  const result = await p.query(
    'SELECT id, name, doc, yjs_state, version, created_at, updated_at FROM diagrams WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) {
    throw new DiagramNotFoundError(id);
  }
  const row = result.rows[0];
  const { diagram, version } = await loadDiagramFromRow({
    id: row.id,
    name: row.name,
    doc: row.doc,
    yjs_state: row.yjs_state,
    version: row.version,
  });
  return { row, diagram, version };
}
