import { describe, expect, it } from 'vitest';
import { processUnifiedAmongusTurn, breakDegenerativeLoops } from './chat.js';

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

  it('breakDegenerativeLoops collapses repeated lines and removes fake URLs', () => {
    const loopText = `Clase Libro con id y titulo\nClase Libro con id y titulo\nClase Libro con id y titulo\nClase Autor con nombre\nAquí está el diagrama: http://i.imgur.com/fake-diagram.png`;
    const cleaned = breakDegenerativeLoops(loopText);
    expect(cleaned).not.toContain('imgur.com');
    expect(cleaned.split('\n').filter((l) => l.includes('Clase Libro')).length).toBeLessThanOrEqual(2);
  });
});
