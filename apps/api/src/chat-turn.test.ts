import { describe, expect, it } from 'vitest';
import { processUnifiedAmongusTurn } from './chat.js';

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
});
