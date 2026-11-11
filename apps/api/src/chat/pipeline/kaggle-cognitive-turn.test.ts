import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeKaggleCognitiveTurn } from './kaggle-cognitive-turn.js';

describe('executeKaggleCognitiveTurn', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns null when KAGGLE_BASE_URL is not set', async () => {
    delete process.env.KAGGLE_BASE_URL;
    delete process.env.KAGGLE_OPENAI_BASE_URL;

    const res = await executeKaggleCognitiveTurn({
      userContent: 'hola',
      senderName: 'Carlos',
      language: 'es',
      diagramId: 'diag-1',
      diagramContext: '',
    });

    expect(res).toBeNull();
  });

  it('returns conversational reply when model responds with pedagogical text (no JSON)', async () => {
    process.env.KAGGLE_BASE_URL = 'https://fake-kaggle.trycloudflare.com';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '¿A qué te referís con "conecta eso"? Tenés la clase Factura y Cliente en el lienzo. ¿Querés asociar un Cliente a múltiples Facturas?',
            },
          },
        ],
      }),
    } as any);

    const res = await executeKaggleCognitiveTurn({
      userContent: 'conecta eso',
      senderName: 'Carlos',
      language: 'es',
      diagramId: 'diag-1',
      diagramContext: 'Clases: Factura, Cliente',
    });

    expect(res).not.toBeNull();
    expect(res?.replyContent).toContain('¿A qué te referís con "conecta eso"?');
    expect(res?.batchDelta).toBeNull();
  });

  it('parses bimodal reply and extracts batchDelta when model returns JSON', async () => {
    process.env.KAGGLE_BASE_URL = 'https://fake-kaggle.trycloudflare.com/v1';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                'Diseñé la entidad Producto con nombre y precio para el catálogo.',
                '```json',
                '{',
                '  "action": "modify",',
                '  "classes": [{ "name": "Producto", "attributes": [{ "name": "nombre", "type": "string" }, { "name": "precio", "type": "Double" }] }]',
                '}',
                '```',
              ].join('\n'),
            },
          },
        ],
      }),
    } as any);

    const res = await executeKaggleCognitiveTurn({
      userContent: 'agrega Producto con nombre string y precio Double',
      senderName: 'Carlos',
      language: 'es',
      diagramId: 'diag-1',
      diagramContext: '',
    });

    expect(res).not.toBeNull();
    expect(res?.replyContent).toContain('Diseñé la entidad Producto');
    expect(res?.replyContent).not.toContain('```json');
    expect(res?.batchDelta).toBeDefined();
    expect(res?.batchDelta?.deltas.length).toBeGreaterThan(0);
  });

  it('strips single-backtick or truncated JSON from replyContent cleanly', async () => {
    process.env.KAGGLE_BASE_URL = 'https://fake-kaggle.trycloudflare.com/v1';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                'Aquí está la propuesta corregida:',
                '`json',
                '{',
                '  "action": "modify",',
                '  "classes": [{ "name": "Producto", "attributes": [{ "name": "idProducto", "type": "int" }] }]',
                '}',
                '`',
                '### Criterio Arquitectónico:',
                '- Producto: Representa los productos disponibles.',
              ].join('\n'),
            },
          },
        ],
      }),
    } as any);

    const res = await executeKaggleCognitiveTurn({
      userContent: 'corrige producto',
      senderName: 'Carlos',
      language: 'es',
      diagramId: 'diag-1',
      diagramContext: '',
    });

    expect(res).not.toBeNull();
    expect(res?.replyContent).not.toContain('`json');
    expect(res?.replyContent).not.toContain('"action": "modify"');
    expect(res?.replyContent).toContain('- Producto: Representa los productos disponibles.');
    expect(res?.batchDelta).not.toBeNull();
  });

  it('returns null gracefully when fetch throws or times out', async () => {
    process.env.KAGGLE_BASE_URL = 'https://fake-kaggle.trycloudflare.com';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout or connection refused'));

    const res = await executeKaggleCognitiveTurn({
      userContent: 'crea clase Foo',
      senderName: 'Carlos',
      language: 'es',
      diagramId: 'diag-1',
      diagramContext: '',
    });

    expect(res).toBeNull();
  });
});

