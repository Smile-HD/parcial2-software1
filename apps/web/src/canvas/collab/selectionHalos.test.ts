import { describe, expect, it } from 'vitest';
import { getRemoteNodeSelections } from './selectionHalos';

describe('Halos de selección remota (realtime:R6)', () => {
  it('devuelve mapa vacío si no hay pares remotos', () => {
    const selections = getRemoteNodeSelections([]);
    expect(selections.size).toBe(0);
  });

  it('mapea IDs de nodos seleccionados al usuario correspondiente', () => {
    const peers = [
      {
        clientId: 1,
        name: 'Ana',
        color: '#0284c7',
        selectedNodeIds: ['class-1', 'class-2'],
      },
      {
        clientId: 2,
        name: 'Carlos',
        color: '#059669',
        selectedNodeIds: ['class-3'],
      },
    ];

    const selections = getRemoteNodeSelections(peers);

    expect(selections.get('class-1')).toEqual({ name: 'Ana', color: '#0284c7' });
    expect(selections.get('class-2')).toEqual({ name: 'Ana', color: '#0284c7' });
    expect(selections.get('class-3')).toEqual({ name: 'Carlos', color: '#059669' });
    expect(selections.get('class-inexistente')).toBeUndefined();
  });

  it('ignora pares sin nodos seleccionados', () => {
    const peers = [
      {
        clientId: 1,
        name: 'Ana',
        color: '#0284c7',
        selectedNodeIds: [],
      },
    ];
    const selections = getRemoteNodeSelections(peers);
    expect(selections.size).toBe(0);
  });
});
