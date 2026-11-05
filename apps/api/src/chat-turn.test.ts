import { describe, expect, it, vi } from 'vitest';
import {
  processUnifiedAmongusTurn,
  breakDegenerativeLoops,
  isChimeraClassName,
  pruneSuggestionsToMax3,
} from './chat.js';

describe('processUnifiedAmongusTurn', () => {
  it('returns connected presence list and count when asked in Spanish', async () => {
    const result = await processUnifiedAmongusTurn(
      '¿Cuántas personas hay conectadas en la sala?',
      'Carlos',
      'es',
      'diag-1',
      undefined,
      undefined,
      undefined,
      undefined,
      ['Carlos', 'Ana', 'Lucía']
    );

    expect(result.replyContent).toContain('3 personas');
    expect(result.replyContent).toContain('Carlos, Ana, Lucía');
    expect(result.replyContent).toContain('Vos estás conectado como Carlos');
  });

  it('returns singular presence when only the sender is in the room', async () => {
    const result = await processUnifiedAmongusTurn(
      '¿Quién está conectado?',
      'Carlos',
      'es',
      'diag-1',
      undefined,
      undefined,
      undefined,
      undefined,
      ['Carlos']
    );

    expect(result.replyContent).toContain('sos el único conectado');
    expect(result.replyContent).toContain('Carlos');
  });

  it('returns connected presence list in English', async () => {
    const result = await processUnifiedAmongusTurn(
      'How many people are online in this room?',
      'Alice',
      'en',
      'diag-1',
      undefined,
      undefined,
      undefined,
      undefined,
      ['Alice', 'Bob']
    );

    expect(result.replyContent).toContain('2 people');
    expect(result.replyContent).toContain('Alice, Bob');
  });

  it('asks for clarification when the request is ambiguous', async () => {
    const result = await processUnifiedAmongusTurn(
      'agregá cosas',
      'Carlos',
      'es',
      'diag-1'
    );

    expect(result.replyContent).toContain('¿Qué entidades o dominio te gustaría modelar');
    expect(result.batchDelta).toBeUndefined();
  });

  it('answers tool questions without trying to create a JSON model', async () => {
    const result = await processUnifiedAmongusTurn(
      '¿Cómo funciona el /layout en el editor?',
      'Carlos',
      'es',
      'diag-1'
    );

    expect(result.replyContent).toContain('/layout');
    expect(result.replyContent).toContain('solapamientos');
    expect(result.batchDelta).toBeUndefined();
  });

  it('rejects unvalidated noise symbols and bare numbers immediately', async () => {
    const resSymbols = await processUnifiedAmongusTurn(
      '###@@@!!!',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(resSymbols.replyContent).toContain('No entendí tu mensaje');
    expect(resSymbols.batchDelta).toBeUndefined();

    const resNumbers = await processUnifiedAmongusTurn(
      '1234567890',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(resNumbers.replyContent).toContain('No entendí tu mensaje');
    expect(resNumbers.batchDelta).toBeUndefined();
  });

  it('handles out-of-domain philosophical questions cleanly without looping or creating classes', async () => {
    const res = await processUnifiedAmongusTurn(
      '¿qué es la vida?',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(res.replyContent).toContain('Como tutor de arquitectura y diseño UML');
    expect(res.batchDelta).toBeUndefined();
  });

  it('informs truthfully when deleting a non-existent class', async () => {
    const mockDiagram = {
      id: 'diag-1',
      name: 'Test',
      classes: [{ id: 'c1', name: 'Libro' }, { id: 'c2', name: 'Autor' }],
      associations: [],
    };

    const res = await processUnifiedAmongusTurn(
      'borra la calse Pago que no existe',
      'Carlos',
      'es',
      'diag-1',
      undefined,
      mockDiagram
    );
    expect(res.replyContent).toContain('La clase "Pago" no existe en el diagrama actual');
    expect(res.replyContent).toContain('"Libro", "Autor"');
    expect(res.batchDelta).toBeUndefined();
  });

  it('handles paradoxical requests like "borra la clase que no existe" without treating "que" as class name', async () => {
    const mockDiagram = {
      id: 'diag-1',
      classes: [{ id: 'c1', name: 'Libro' }],
      associations: [],
    };

    const res = await processUnifiedAmongusTurn(
      'borra la clase que no existe y duplica todas las demas',
      'Carlos',
      'es',
      'diag-1',
      undefined,
      mockDiagram
    );
    expect(res.replyContent).toContain('No se especificó ninguna clase válida para eliminar');
    expect(res.replyContent).not.toContain('La clase "que" no existe');
    expect(res.batchDelta).toBeUndefined();
  });

  it('answers theoretical questions about aggregation vs composition with pedagogical OOAD criteria', async () => {
    const res = await processUnifiedAmongusTurn(
      '¿Qué diferencia hay entre agregación y composición y cuándo usar cada una?',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(res.replyContent).toContain('Composición (Rombo relleno');
    expect(res.replyContent).toContain('Agregación (Rombo hueco');
    expect(res.replyContent).toContain('Dependencia de ciclo de vida');
    expect(res.batchDelta).toBeUndefined();
  });

  it('handles explicit reflexive self-association on existing class without hallucinating classes', async () => {
    const mockDiagram = {
      id: 'diag-1',
      version: 1,
      classes: [{ id: 'user-123', name: 'Usuario' }],
      associations: [],
    };

    const res = await processUnifiedAmongusTurn(
      'con la clase Usuario que ya existe, agregale una relacion reflexiva de amistad consigo misma con cardinalidad muchos a muchos',
      'Carlos',
      'es',
      'diag-1',
      undefined,
      mockDiagram
    );

    expect(res.replyContent).toContain('relación reflexiva sobre la clase "Usuario"');
    expect(res.batchDelta).toBeDefined();
    expect(res.batchDelta?.deltas).toHaveLength(1);
    const assoc = res.batchDelta?.deltas[0] as any;
    expect(assoc.kind).toBe('association');
    expect(assoc.sourceClassId).toBe('user-123');
    expect(assoc.targetClassId).toBe('user-123');
    expect(assoc.name).toBe('amistad');
    expect(assoc.sourceMultiplicity).toBe('0..*');
    expect(assoc.targetMultiplicity).toBe('0..*');
  });

  it('breakDegenerativeLoops collapses repeated lines and removes fake URLs', () => {
    const loopText = `Clase Libro con id y titulo\nClase Libro con id y titulo\nClase Libro con id y titulo\nClase Autor con nombre\nAquí está el diagrama: http://i.imgur.com/fake-diagram.png`;
    const cleaned = breakDegenerativeLoops(loopText);
    expect(cleaned).not.toContain('imgur.com');
    expect(cleaned.split('\n').filter((l) => l.includes('Clase Libro')).length).toBeLessThanOrEqual(2);
  });

  it('detects contradictory requests like creating and deleting the same class (S4)', async () => {
    const res = await processUnifiedAmongusTurn(
      'creá la clase Factura y borrá la clase Factura',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(res.replyContent).toContain('Detecté una solicitud contradictoria');
    expect(res.replyContent).toContain('Factura');
    expect(res.batchDelta).toBeUndefined();
  });

  it('intercepts unknown slash commands with closest suggestion (S7)', async () => {
    const res = await processUnifiedAmongusTurn(
      '/auditt',
      'Carlos',
      'es',
      'diag-1'
    );
    expect(res.replyContent).toContain('Comando "/auditt" no reconocido');
    expect(res.replyContent).toContain('¿Quisiste decir /audit?');
    expect(res.batchDelta).toBeUndefined();
  });

  it('guards against false-positive proposal text when no batchDelta is produced (S1)', async () => {
    const mockLlm = {
      chat: async () => '¡Listo! Preparé la propuesta para este cambio con los elementos solicitados.',
    };
    const res = await processUnifiedAmongusTurn(
      'hola Amongus, como andas',
      'Carlos',
      'es',
      'diag-1',
      mockLlm
    );
    expect(res.replyContent).not.toContain('Preparé la propuesta');
    expect(res.replyContent).toContain('No pude interpretar los cambios para generar la propuesta');
    expect(res.batchDelta).toBeUndefined();
  });

  describe('isChimeraClassName & pruneSuggestionsToMax3', () => {
    it('detects chimeric compound names made of existing classes', () => {
      const existing = ['Factura', 'Item', 'Pago', 'Cliente'];
      expect(isChimeraClassName('FacturaItemCancelada', existing)).toBe(true);
      expect(isChimeraClassName('PagoFactura', existing)).toBe(true);
      expect(isChimeraClassName('ClienteFactura', existing)).toBe(true);

      // Standalone atomic domain nouns should not be flagged
      expect(isChimeraClassName('Auditoria', existing)).toBe(false);
      expect(isChimeraClassName('Comprobante', existing)).toBe(false);
      expect(isChimeraClassName('Reclamo', existing)).toBe(false);
      expect(isChimeraClassName('Factura', existing)).toBe(false); // Exact match is not a combination of 2
    });

    it('prunes suggestions strictly to at most 3 items and drops items >= 4', () => {
      const verboseSuggestions = [
        '1. **Auditoria**: Registra logs de operaciones del sistema.',
        '2. **Reclamo**: Permite a los clientes asentar quejas.',
        '3. **Sucursal**: Punto físico donde se realizan las operaciones.',
        '4. **FacturaItem**: Detalle de items de factura.',
        '5. **FacturaItemCanceladaEstado**: Entidad de prueba.',
      ].join('\n');

      const pruned = pruneSuggestionsToMax3(verboseSuggestions, ['Factura', 'Item']);
      expect(pruned).toContain('1. **Auditoria**');
      expect(pruned).toContain('2. **Reclamo**');
      expect(pruned).toContain('3. **Sucursal**');
      expect(pruned).not.toContain('4. **FacturaItem**');
      expect(pruned).not.toContain('5. **FacturaItemCanceladaEstado**');
    });

    it('filters out chimeric classes even within the top 3 items', () => {
      const chimeraTop3 = [
        '1. **Auditoria**: Registra logs.',
        '2. **FacturaItem**: Combinación chimera.',
        '3. **Sucursal**: Punto de venta.',
      ].join('\n');

      const pruned = pruneSuggestionsToMax3(chimeraTop3, ['Factura', 'Item']);
      expect(pruned).toContain('1. **Auditoria**');
      expect(pruned).not.toContain('FacturaItem');
      expect(pruned).toContain('3. **Sucursal**');
    });
  });

  describe('/suggest streaming valve and options', () => {
    it('configures stop tokens and repeat penalty on llm.chat call', async () => {
      let capturedOptions: any = null;
      const mockLlm = {
        chat: vi.fn().mockImplementation(async (_messages: any, options: any) => {
          capturedOptions = options;
          return '1. **Auditoria**: Registra auditorias.\n2. **Reclamo**: Registra reclamos.\n3. **Turno**: Gestiona turnos.';
        }),
      };

      const mockDiagram = {
        id: 'diag-1',
        classes: [{ id: 'c1', name: 'Factura' }, { id: 'c2', name: 'Cliente' }],
        associations: [],
      };

      const res = await processUnifiedAmongusTurn(
        '/suggest',
        'Carlos',
        'es',
        'diag-1',
        mockLlm,
        mockDiagram
      );

      expect(mockLlm.chat).toHaveBeenCalledTimes(1);
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.stop).toEqual(['\n4.', '\n4 ', '4. ', '4.-', '<|im_end|>']);
      expect(capturedOptions.repeatPenalty).toBe(1.15);
      expect(capturedOptions.repeatLastN).toBe(128);
      expect(res.replyContent).toContain('1. **Auditoria**');
    });

    it('streams chunks in real-time to the client for /suggest and halts stream at item 4', async () => {
      const streamedToClient: string[] = [];
      const clientOnChunk = (chunk: string) => {
        streamedToClient.push(chunk);
      };

      let capturedOptions: any = null;
      const mockLlm = {
        chat: vi.fn().mockImplementation(async (_messages: any, options: any) => {
          capturedOptions = options;
          if (typeof options?.onChunk === 'function') {
            options.onChunk('1. **Auditoria**: Registra logs.\n');
            options.onChunk('2. **Reclamo**: Gestiona quejas.\n');
            options.onChunk('3. **Sucursal**: Punto físico.\n');
            options.onChunk('\n4. **FacturaItem**: Slop.');
          }
          return '1. **Auditoria**: Registra logs.\n2. **Reclamo**: Gestiona quejas.\n3. **Sucursal**: Punto físico.\n\n4. **FacturaItem**: Slop.';
        }),
      };

      const mockDiagram = {
        id: 'diag-1',
        classes: [{ id: 'c1', name: 'Factura' }, { id: 'c2', name: 'Cliente' }],
        associations: [],
      };

      const res = await processUnifiedAmongusTurn(
        '/suggest',
        'Carlos',
        'es',
        'diag-1',
        mockLlm,
        mockDiagram,
        undefined,
        clientOnChunk
      );

      // onChunk is passed to stream tokens in real-time to the UI
      expect(typeof capturedOptions.onChunk).toBe('function');
      expect(streamedToClient.join('')).toContain('1. **Auditoria**');
      expect(streamedToClient.join('')).toContain('2. **Reclamo**');
      expect(streamedToClient.join('')).toContain('3. **Sucursal**');
      // The 4th item was halted by the streaming valve
      expect(streamedToClient.join('')).not.toContain('FacturaItem');

      // Final reply must still be pruned to at most 3 items and no chimeras
      expect(res.replyContent).toContain('1. **Auditoria**');
      expect(res.replyContent).toContain('2. **Reclamo**');
      expect(res.replyContent).toContain('3. **Sucursal**');
      expect(res.replyContent).not.toContain('4. **FacturaItem**');
    });

    it('applies suggested entities when user sends /apply right after /suggest', async () => {
      const mockLlm = {
        chat: vi.fn().mockResolvedValue(JSON.stringify({
          action: 'modify',
          classes: [
            { name: 'Auditoria', attributes: [{ name: 'id', type: 'string' }] },
            { name: 'Reclamo', attributes: [{ name: 'motivo', type: 'string' }] },
          ],
          associations: [
            { source: 'Factura', target: 'Auditoria' },
          ],
        })),
      };

      const mockDiagram = {
        id: 'diag-1',
        classes: [{ id: 'c1', name: 'Factura' }],
        associations: [],
      };

      const chatHistory = [
        { role: 'user' as const, content: '/suggest' },
        {
          role: 'assistant' as const,
          content: '1. **Auditoria**: Registra logs del sistema.\n2. **Reclamo**: Gestiona reclamos de clientes.',
        },
      ];

      const res = await processUnifiedAmongusTurn(
        '/apply',
        'Carlos',
        'es',
        'diag-1',
        mockLlm,
        mockDiagram,
        chatHistory
      );

      expect(res.batchDelta).toBeDefined();
      expect(res.replyContent).toContain('Preparé la propuesta en el lienzo');
      const classNames = (res.batchDelta?.deltas || [])
        .filter((d: any) => d.kind === 'class' && d.op === 'create')
        .map((d: any) => d.name);
      expect(classNames).toContain('Auditoria');
    });
  });

  describe('5-class ceiling & timeout rescue', () => {
    it('caps generated proposal to at most 5 classes when LLM returns more than 5 classes', async () => {
      const tenClassesJson = JSON.stringify({
        action: 'modify',
        classes: [
          { name: 'C1', attributes: [{ name: 'a1', type: 'string' }] },
          { name: 'C2', attributes: [{ name: 'a2', type: 'string' }] },
          { name: 'C3', attributes: [{ name: 'a3', type: 'string' }] },
          { name: 'C4', attributes: [{ name: 'a4', type: 'string' }] },
          { name: 'C5', attributes: [{ name: 'a5', type: 'string' }] },
          { name: 'C6', attributes: [{ name: 'a6', type: 'string' }] },
          { name: 'C7', attributes: [{ name: 'a7', type: 'string' }] },
          { name: 'C8', attributes: [{ name: 'a8', type: 'string' }] },
          { name: 'C9', attributes: [{ name: 'a9', type: 'string' }] },
          { name: 'C10', attributes: [{ name: 'a10', type: 'string' }] },
        ],
        associations: [
          { source: 'C1', target: 'C2' },
          { source: 'C2', target: 'C3' },
          { source: 'C3', target: 'C4' },
          { source: 'C4', target: 'C5' },
          { source: 'C5', target: 'C6' },
        ],
      });

      const mockLlm = {
        chat: vi.fn().mockResolvedValue(`\`\`\`json\n${tenClassesJson}\n\`\`\``),
      };

      const res = await processUnifiedAmongusTurn(
        'crea un sistema de gestión escolar',
        'Carlos',
        'es',
        'diag-1',
        mockLlm as any
      );

      expect(res.batchDelta).toBeDefined();
      const createdClasses = (res.batchDelta?.deltas || []).filter((d: any) => d.kind === 'class' && d.op === 'create');
      expect(createdClasses.length).toBeLessThanOrEqual(5);
    });

    it('rescues partial JSON generated before timeout on CPU', async () => {
      const partialJson = '{"action": "modify", "classes": [{"name": "Aerolinea", "attributes": [{"name": "nombre", "type": "string"}]}, {"name": "Vuelo", "attributes": [{"name": "codigo", "type": "string"}]}';

      const mockLlm = {
        chat: vi.fn().mockImplementation(async (_messages: any, options: any) => {
          options.onChunk(partialJson);
          const err: any = new Error('The operation was aborted due to timeout');
          err.name = 'AbortError';
          throw err;
        }),
      };

      const res = await processUnifiedAmongusTurn(
        'diseña un sistema para aerolinea',
        'Carlos',
        'es',
        'diag-1',
        mockLlm as any
      );

      expect(res.batchDelta).toBeDefined();
      expect(res.replyContent).toContain('rescaté las entidades');
      const classNames = (res.batchDelta?.deltas || [])
        .filter((d: any) => d.kind === 'class' && d.op === 'create')
        .map((d: any) => d.name);
      expect(classNames).toContain('Aerolinea');
      expect(classNames).toContain('Vuelo');
    });

    it('falls back to domain catalog when timeout occurs before any chunk is produced', async () => {
      const mockLlm = {
        chat: vi.fn().mockImplementation(async () => {
          const err: any = new Error('Timeout');
          err.name = 'AbortError';
          throw err;
        }),
      };

      const res = await processUnifiedAmongusTurn(
        'diseña el sistema para un hotel',
        'Carlos',
        'es',
        'diag-1',
        mockLlm as any
      );

      expect(res.batchDelta).toBeDefined();
      expect(res.replyContent).toContain('catálogo');
      const classNames = (res.batchDelta?.deltas || [])
        .filter((d: any) => d.kind === 'class' && d.op === 'create')
        .map((d: any) => d.name);
      expect(classNames.length).toBeGreaterThanOrEqual(2);
      expect(classNames.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Relationship mutation parity & Contextual diagram explanation', () => {
    it('mutates an existing association to composition when user requests it', async () => {
      const mockDiagram = {
        id: 'diag-shoes',
        classes: [
          { id: 'c1', name: 'Zapato' },
          { id: 'c2', name: 'Material' },
        ],
        associations: [
          {
            id: 'a1',
            sourceClassId: 'c1',
            targetClassId: 'c2',
            aggregation: 'none',
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
          },
        ],
      };

      // Simular que el LLM devolvió texto plano conversacional como en la captura
      const mockLlm = {
        chat: vi.fn().mockResolvedValue(
          'Claro, aquí tienes la nueva asociación: - Relación entre "Zapato" y "Material" (composición, multiplicidad: 1 a 1).'
        ),
      };

      const res = await processUnifiedAmongusTurn(
        'cambia el tipo de relacion, que sea una de composicion y no de asociacion',
        'Carlos',
        'es',
        'diag-shoes',
        mockLlm as any,
        mockDiagram
      );

      expect(res.batchDelta).toBeDefined();
      expect(res.batchDelta?.deltas.length).toBeGreaterThan(0);
      const assocDelta = res.batchDelta?.deltas.find((d: any) => d.kind === 'association');
      expect(assocDelta).toBeDefined();
      expect(assocDelta.op).toBe('updateMultiplicity');
      expect(assocDelta.associationId).toBe('a1');
      expect(assocDelta.aggregation).toBe('composite');
    });

    it('explains diagram context and key classes when asked in natural language', async () => {
      const mockDiagram = {
        id: 'diag-shoes',
        classes: [
          { id: 'c1', name: 'Zapato', attributes: [{ name: 'modelo', type: 'string' }] },
          { id: 'c2', name: 'Material', attributes: [{ name: 'tipo', type: 'string' }] },
          { id: 'c3', name: 'Color', attributes: [{ name: 'nombre', type: 'string' }] },
        ],
        associations: [],
      };

      const res = await processUnifiedAmongusTurn(
        'explicame el contexto del diagrama actual',
        'Carlos',
        'es',
        'diag-shoes',
        undefined, // Sin LLM para probar el fallback determinista contextual
        mockDiagram
      );

      expect(res.replyContent).toContain('El diagrama actual modela la arquitectura');
      expect(res.replyContent).toContain('Zapato');
      expect(res.replyContent).toContain('Material');
      expect(res.replyContent).toContain('Color');
    });

    it('enriches /context command with domain entities list', async () => {
      const mockDiagram = {
        id: 'diag-shoes',
        classes: [
          { id: 'c1', name: 'Zapato' },
          { id: 'c2', name: 'Material' },
        ],
        associations: [],
      };

      const res = await processUnifiedAmongusTurn(
        '/context',
        'Carlos',
        'es',
        'diag-shoes',
        undefined,
        mockDiagram
      );

      expect(res.replyContent).toContain('Estado del Contexto Real');
      expect(res.replyContent).toContain('Entidades del Dominio en el Lienzo (2): Zapato, Material');
    });

    it('handles enclitic "cambiame" and assigns aggregationEnd to whole class Lector', async () => {
      const mockDiagram = {
        id: 'diag-library',
        version: 1,
        classes: [
          { id: 'c_lector', name: 'Lector' },
          { id: 'c_prestamo', name: 'Prestamo' },
        ],
        associations: [
          {
            id: 'a_lp',
            sourceClassId: 'c_lector',
            targetClassId: 'c_prestamo',
            aggregation: 'none',
            aggregationEnd: 'source',
            sourceMultiplicity: '1',
            targetMultiplicity: '0..*',
          },
        ],
      };

      const res = await processUnifiedAmongusTurn(
        'cambiame la relacion entre lector y prestamolector a una de agregacion donde la clase todo es el lector',
        'Carlos',
        'es',
        'diag-library',
        undefined,
        mockDiagram
      );

      expect(res.batchDelta).toBeDefined();
      const assocDelta = res.batchDelta?.deltas.find((d: any) => d.kind === 'association');
      expect(assocDelta).toBeDefined();
      expect(assocDelta.op).toBe('updateMultiplicity');
      expect(assocDelta.associationId).toBe('a_lp');
      expect(assocDelta.aggregation).toBe('shared');
      expect(assocDelta.aggregationEnd).toBe('source');
    });

    it('handles English relationship mutation with whole-class specification', async () => {
      const mockDiagram = {
        id: 'diag-library',
        version: 1,
        classes: [
          { id: 'c_reader', name: 'Reader' },
          { id: 'c_loan', name: 'Loan' },
        ],
        associations: [
          {
            id: 'a_rl',
            sourceClassId: 'c_loan',
            targetClassId: 'c_reader',
            aggregation: 'none',
            aggregationEnd: 'source',
            sourceMultiplicity: '0..*',
            targetMultiplicity: '1',
          },
        ],
      };

      const res = await processUnifiedAmongusTurn(
        'change relationship between reader and loan to composition where the whole is reader',
        'John',
        'en',
        'diag-library',
        undefined,
        mockDiagram
      );

      expect(res.batchDelta).toBeDefined();
      const assocDelta = res.batchDelta?.deltas.find((d: any) => d.kind === 'association');
      expect(assocDelta).toBeDefined();
      expect(assocDelta.op).toBe('updateMultiplicity');
      expect(assocDelta.associationId).toBe('a_rl');
      expect(assocDelta.aggregation).toBe('composite');
      // En este diagrama, Reader es targetClassId, así que aggregationEnd debe ser 'target'
      expect(assocDelta.aggregationEnd).toBe('target');
    });

    it('handles English class modifications and renames', async () => {
      const mockDiagram = {
        id: 'diag-store',
        version: 1,
        classes: [
          { id: 'c1', name: 'Product', attributes: [{ name: 'sku', type: 'string' }] },
        ],
        associations: [],
      };

      const resAbstract = await processUnifiedAmongusTurn(
        'make class Product abstract',
        'John',
        'en',
        'diag-store',
        undefined,
        mockDiagram
      );
      expect(resAbstract.batchDelta).toBeDefined();
      const classDelta = resAbstract.batchDelta?.deltas.find((d: any) => d.kind === 'class');
      expect(classDelta).toBeDefined();
      expect(classDelta.op).toBe('update');
      expect(classDelta.isAbstract).toBe(true);

      const resRename = await processUnifiedAmongusTurn(
        'rename class Product to Item',
        'John',
        'en',
        'diag-store',
        undefined,
        mockDiagram
      );
      expect(resRename.batchDelta).toBeDefined();
      const renameDelta = resRename.batchDelta?.deltas.find((d: any) => d.kind === 'class');
      expect(renameDelta).toBeDefined();
      expect(renameDelta.op).toBe('rename');
      expect(renameDelta.newName).toBe('Item');
    });

    it('agnostically deletes classes, associations, and attributes without hardcoded domain knowledge', async () => {
      const mockDiagram = {
        classes: [
          { id: 'c1', name: 'Sensor', attributes: [{ id: 'a1', name: 'frecuencia', type: 'float' }] },
          { id: 'c2', name: 'Actuador', attributes: [{ id: 'a2', name: 'voltaje', type: 'float' }] },
        ],
        associations: [
          {
            id: 'r1',
            sourceClassId: 'c1',
            targetClassId: 'c2',
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
            aggregation: 'none',
          },
        ],
      };

      // 1. Borrado agnóstico de relación entre dos entidades arbitrarias
      const resDelAssoc = await processUnifiedAmongusTurn(
        'elimina la relacion entre Sensor y Actuador',
        'Zovako',
        'es',
        'diag-iot',
        undefined,
        mockDiagram
      );
      expect(resDelAssoc.batchDelta).toBeDefined();
      const assocDeleteDelta = resDelAssoc.batchDelta?.deltas.find((d: any) => d.kind === 'association');
      expect(assocDeleteDelta).toBeDefined();
      expect(assocDeleteDelta.op).toBe('delete');
      expect(assocDeleteDelta.associationId).toBe('r1');

      // 2. Borrado agnóstico de atributo
      const resDelAttr = await processUnifiedAmongusTurn(
        'elimina el atributo frecuencia de Sensor',
        'Zovako',
        'es',
        'diag-iot',
        undefined,
        mockDiagram
      );
      expect(resDelAttr.batchDelta).toBeDefined();
      const attrDeleteDelta = resDelAttr.batchDelta?.deltas.find((d: any) => d.kind === 'member');
      expect(attrDeleteDelta).toBeDefined();
      expect(attrDeleteDelta.op).toBe('deleteAttribute');
      expect(attrDeleteDelta.classId).toBe('c1');
      expect(attrDeleteDelta.memberId).toBe('a1');

      // 3. Borrado agnóstico de clase
      const resDelClass = await processUnifiedAmongusTurn(
        'delete class Actuador',
        'Zovako',
        'en',
        'diag-iot',
        undefined,
        mockDiagram
      );
      expect(resDelClass.batchDelta).toBeDefined();
      const classDeleteDelta = resDelClass.batchDelta?.deltas.find((d: any) => d.kind === 'class');
      expect(classDeleteDelta).toBeDefined();
      expect(classDeleteDelta.op).toBe('delete');
      expect(classDeleteDelta.classId).toBe('c2');
    });
  });
});

