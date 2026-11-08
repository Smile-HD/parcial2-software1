import type { VisionPort, BatchDelta } from '@app/core';
import { VisionExtractionError, type FakeVisionOptions } from './types.js';

/**
 * Fake determinista para pruebas y desarrollo sin conexión. Retorna un lote delta
 * de referencia de 3 clases por defecto; configurable para fallar o retornar cero elementos.
 */
export class FakeVision implements VisionPort {
  private readonly forceInvalid: boolean;
  private readonly zeroElements: boolean;
  private readonly fixture: BatchDelta;

  constructor(options: FakeVisionOptions = {}) {
    this.forceInvalid = options.forceInvalid ?? false;
    this.zeroElements = options.zeroElements ?? false;

    // Construye el fixture de referencia una sola vez con UUIDs válidos al instanciar.
    const batchId = crypto.randomUUID();
    const diagramId = crypto.randomUUID();
    const ts = '2026-01-01T00:00:00.000Z';
    this.fixture = {
      kind: 'batch',
      id: batchId,
      diagramId,
      timestamp: ts,
      deltas: this.zeroElements ? [] : [
        {
          kind: 'class', op: 'create',
          id: crypto.randomUUID(), diagramId, timestamp: ts,
          classId: crypto.randomUUID(), name: 'Customer', position: { x: 100, y: 100 },
        },
        {
          kind: 'class', op: 'create',
          id: crypto.randomUUID(), diagramId, timestamp: ts,
          classId: crypto.randomUUID(), name: 'Order', position: { x: 250, y: 100 },
        },
        {
          kind: 'class', op: 'create',
          id: crypto.randomUUID(), diagramId, timestamp: ts,
          classId: crypto.randomUUID(), name: 'Product', position: { x: 400, y: 100 },
        },
      ],
    };
  }

  async extract(_image: Uint8Array, _mimeType: string): Promise<BatchDelta> {
    if (this.forceInvalid) {
      throw new VisionExtractionError('Simulated vision failure');
    }
    return structuredClone(this.fixture);
  }
}
