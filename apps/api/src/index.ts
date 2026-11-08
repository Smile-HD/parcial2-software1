/**
 * @app/api — API REST Fastify para persistencia de diagramas y asistente UML Amongus.
 * Servidor modular delgado (<150 líneas) con plugins para diagramas, IA, jobs y formatos de intercambio.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LlmPort, SttPort, VisionPort } from '@app/core';
import { FakeLlm, OpenAiLlm, FakeStt, WhisperStt, RetryRepairingLlmPort, FakeVision, OpenAiVision } from '@app/adapters-ai';
import { PendingDeltaStore } from './interpreter.js';
import { registerXmiImportRoutes } from './xmi-import.js';
import { registerXmiExportRoutes } from './xmi-export.js';
import { registerPhotoImportRoutes } from './photo-import.js';
import { registerDiagramRoutes } from './routes/diagram-routes.js';
import { registerAiRoutes } from './routes/ai-routes.js';
import { registerJobRoutes } from './routes/job-routes.js';
import { loadDiagramById, DiagramNotFoundError } from './routes/persistence.js';

// Carga .env de múltiples ubicaciones candidatas
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(process.cwd(), 'deploy/.env'),
  resolve(import.meta.dirname ?? '.', '../.env'),
  resolve(import.meta.dirname ?? '.', '../../.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {}
  }
}

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/ai_uml';
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool, loadDiagramById, DiagramNotFoundError };

export interface AppOptions {
  logger?: boolean;
  llm?: LlmPort;
  stt?: SttPort;
  vision?: VisionPort;
  pool?: Pool;
}

export const pendingDeltas = new PendingDeltaStore();

function readMaxAttemptsFromEnv(): number {
  const raw = process.env.OPENAI_LLM_MAX_ATTEMPTS;
  if (raw === undefined || raw === '') return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  if (n < 1) return 1;
  if (n > 3) return 3;
  return Math.floor(n);
}

export function buildApp(options?: AppOptions): FastifyInstance {
  const dbPool = options?.pool ?? pool;
  const app = Fastify({
    logger: options?.logger ?? true,
    bodyLimit: 25 * 1024 * 1024,
  });

  const baseLlm: LlmPort = options?.llm ?? OpenAiLlm.fromEnv() ?? new FakeLlm();
  const llm: LlmPort = baseLlm instanceof OpenAiLlm
    ? new RetryRepairingLlmPort(baseLlm, { maxAttempts: readMaxAttemptsFromEnv() })
    : baseLlm;
  const stt: SttPort = options?.stt ?? WhisperStt.fromEnv() ?? new FakeStt();
  const vision: VisionPort = options?.vision ?? OpenAiVision.fromEnv() ?? new FakeVision();

  void app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT'] });

  // Comprobación de estado (health check)
  app.get('/health', async (_request, reply) => {
    let dbStatus = 'ok';
    try {
      await dbPool.query('SELECT 1');
    } catch {
      dbStatus = 'unavailable';
    }

    let llmStatus = 'ok';
    let llmDetail: string | undefined;
    if (llm && typeof (llm as any).checkHealth === 'function') {
      try {
        const h = await (llm as any).checkHealth(2500);
        if (!h.ok) {
          llmStatus = 'unavailable';
          llmDetail = h.message;
        }
      } catch (e: any) {
        llmStatus = 'unavailable';
        llmDetail = e?.message;
      }
    }

    const isHealthy = dbStatus === 'ok';
    const overallStatus = !isHealthy ? 'error' : (llmStatus === 'ok' ? 'ok' : 'degraded');
    const statusCode = !isHealthy ? 503 : 200;

    return reply.status(statusCode).send({
      status: overallStatus,
      services: {
        database: { status: dbStatus },
        llm: { status: llmStatus, detail: llmDetail },
      },
    });
  });

  // Registro modular de grupos de rutas
  registerDiagramRoutes(app, dbPool);
  registerJobRoutes(app);
  registerAiRoutes(app, { pool: dbPool, llm, stt, pendingDeltas });
  registerXmiImportRoutes(app);
  registerXmiExportRoutes(app);
  registerPhotoImportRoutes(app, vision);

  return app;
}

async function startServer() {
  const app = buildApp();
  const shutdown = async () => {
    console.log('Shutting down...');
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API server listening on http://0.0.0.0:${port}`);
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
