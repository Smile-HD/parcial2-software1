/**
 * Endpoint de voz a texto y posterior interpretación (/diagrams/:id/voice).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { LlmClient, SttClient } from '@app/adapters-ai';
import { LlmUnavailableError } from '@app/adapters-ai';
import type { PendingDeltaStore } from '../pending-deltas.js';
import { loadDiagramFromRow } from './persistence.js';
import { interpretCommand } from '../interpreter.js';
import type { Diagram } from '@app/core';

export function registerVoiceRoute(
  app: FastifyInstance,
  pool: Pool,
  stt: SttClient,
  llm: LlmClient,
  pendingDeltas: PendingDeltaStore
) {
  app.post<{ Params: { id: string }; Body: { audio?: string; mimeType?: string; transcribeOnly?: boolean } }>(
    '/diagrams/:id/voice',
    async (request, reply) => {
      const { id } = request.params;
      const audioBase64 = request.body?.audio;
      if (typeof audioBase64 !== 'string' || audioBase64.trim().length === 0) {
        return reply.status(400).send({ error: 'audio (base64) is required' });
      }

      const result = await pool.query(
        'SELECT id, name, doc, yjs_state, version, created_at, updated_at FROM diagrams WHERE id = $1',
        [id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Diagram not found' });
      }
      const row = result.rows[0];

      let transcript: string;
      try {
        const audio = new Uint8Array(Buffer.from(audioBase64, 'base64'));
        transcript = await stt.transcribe(audio, request.body?.mimeType ?? 'audio/webm');
      } catch (error) {
        const cause = error instanceof Error ? error.message : 'unknown error';
        return reply.status(502).send({
          error: `Speech-to-text unavailable: ${cause}. Use the text command input instead.`,
        });
      }

      if (request.body?.transcribeOnly) {
        return reply.send({ transcript, status: 'ok' });
      }

      let currentIr: Diagram;
      try {
        currentIr = (
          await loadDiagramFromRow({
            id: row.id,
            name: row.name,
            doc: row.doc,
            yjs_state: row.yjs_state,
            version: row.version,
          })
        ).diagram;
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : 'Diagram load failed' });
      }

      try {
        const outcome = await interpretCommand(transcript, llm, currentIr, pendingDeltas);
        if (outcome.status === 'error') {
          return reply.status(422).send({ transcript, status: 'error', message: outcome.message });
        }
        return reply.send({ transcript, ...outcome });
      } catch (error) {
        if (error instanceof LlmUnavailableError) {
          return reply.status(502).send({ error: `LLM unavailable: ${error.message}` });
        }
        throw error;
      }
    }
  );
}
