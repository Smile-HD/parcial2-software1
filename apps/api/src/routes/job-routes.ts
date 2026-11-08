/**
 * Rutas y tareas asíncronas de generación de código Spring Boot (jobs over HTTP).
 */
import type { FastifyInstance } from 'fastify';
import { generate, createHandlebarsRenderer, DEFAULT_TEMPLATES_DIR, type GeneratedFile } from '@app/codegen';
import * as yazl from 'yazl';
import { jobRegistry } from '../jobs.js';
import { loadDiagramById, DiagramNotFoundError } from './persistence.js';

export function buildZipFromFiles(files: GeneratedFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const file of files) {
      zip.addBuffer(Buffer.from(file.content, 'utf8'), file.path);
    }
    zip.end();
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

export async function runGeneration(jobId: string, diagramId: string): Promise<void> {
  try {
    jobRegistry.setRunning(jobId);
    const { diagram } = await loadDiagramById(diagramId);
    const outputRoot = process.cwd() + '/generated';
    const render = createHandlebarsRenderer(DEFAULT_TEMPLATES_DIR);
    const result = generate(diagram, { outputRoot, basePackage: 'com.example.generated', render });
    const zipBuffer = await buildZipFromFiles(result.files);
    jobRegistry.setSucceeded(jobId, zipBuffer);
  } catch (error) {
    jobRegistry.setFailed(jobId, error instanceof Error ? error.message : 'Generation failed');
  }
}

export function registerJobRoutes(app: FastifyInstance): void {
  // POST /diagrams/:id/generate — inicia generación asíncrona, retorna jobId
  app.post<{ Params: { id: string } }>(
    '/diagrams/:id/generate',
    async (request, reply) => {
      const { id } = request.params;
      try {
        await loadDiagramById(id);
      } catch (error) {
        if (error instanceof DiagramNotFoundError) {
          return reply.status(404).send({ error: 'Diagram not found' });
        }
        return reply
          .status(500)
          .send({ error: error instanceof Error ? error.message : 'Diagram load failed' });
      }

      const existing = jobRegistry.findActiveByDiagramId(id);
      if (existing) {
        return reply.status(409).send({
          error: 'Job already in progress for this diagram',
          jobId: existing.id,
        });
      }
      const job = jobRegistry.create(id);
      setImmediate(() => void runGeneration(job.id, id));
      return reply.status(202).send({ jobId: job.id });
    }
  );

  // GET /jobs/:id — obtiene el estado del trabajo
  app.get<{ Params: { id: string } }>(
    '/jobs/:id',
    async (request, reply) => {
      const job = jobRegistry.get(request.params.id);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      return {
        id: job.id,
        status: job.status,
        diagramId: job.diagramId,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        error: job.error ?? null,
        artifactReady: job.status === 'succeeded',
      };
    }
  );

  // GET /jobs/:id/artifact — descarga el zip generado
  app.get<{ Params: { id: string } }>(
    '/jobs/:id/artifact',
    async (request, reply) => {
      const job = jobRegistry.get(request.params.id);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      if (job.status === 'failed') {
        return reply.status(500).send({ error: `Generation failed: ${job.error ?? 'unknown error'}` });
      }
      if (job.status !== 'succeeded' || !job.artifact) {
        return reply.status(409).send({ error: 'Artifact not ready yet' });
      }
      const safeName = String(job.diagramId).replace(/[^a-zA-Z0-9-]/g, '_');
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="generated-${safeName}.zip"`)
        .send(job.artifact);
    }
  );
}
