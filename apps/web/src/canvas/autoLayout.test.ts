import { describe, it, expect } from 'vitest';
import type { Diagram } from '@app/core';
import { computeAutoLayout, estimateClassDimensions } from './autoLayout';

describe('computeAutoLayout — UML Graph & Hierarchy Layout', () => {
  it('returns empty dictionary for diagram with no classes', () => {
    const emptyDiagram: Diagram = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      name: 'Empty',
      classes: [],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };
    expect(computeAutoLayout(emptyDiagram)).toEqual({});
  });

  it('estimates dimensions dynamically based on attributes and methods', () => {
    const smallClass = {
      id: 'c1',
      name: 'User',
      attributes: [],
      methods: [],
      position: { x: 0, y: 0 },
    };
    const largeClass = {
      id: 'c2',
      name: 'FlightReservationTransactionSystem',
      attributes: [
        { id: 'a1', name: 'id', type: 'int' },
        { id: 'a2', name: 'reservationCode', type: 'string' },
        { id: 'a3', name: 'departureDate', type: 'date' },
        { id: 'a4', name: 'totalAmount', type: 'float' },
      ],
      methods: [
        { id: 'm1', name: 'confirmBooking', returnType: 'boolean' },
        { id: 'm2', name: 'cancelBooking', returnType: 'void' },
      ],
      position: { x: 0, y: 0 },
    };

    const smallDim = estimateClassDimensions(smallClass);
    const largeDim = estimateClassDimensions(largeClass);

    expect(smallDim.width).toBeGreaterThanOrEqual(280);
    expect(largeDim.width).toBeGreaterThan(smallDim.width);
    expect(largeDim.height).toBeGreaterThan(smallDim.height);
  });

  it('places superclass above subclass in generalization hierarchy', () => {
    const diagram: Diagram = {
      id: 'd1',
      name: 'Inheritance Diagram',
      classes: [
        { id: 'dog', name: 'Dog', attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'animal', name: 'Animal', attributes: [], methods: [], position: { x: 0, y: 0 } },
      ],
      associations: [],
      generalizations: [
        { id: 'g1', subClassId: 'dog', superClassId: 'animal' },
      ],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const positions = computeAutoLayout(diagram);
    expect(positions['animal']).toBeDefined();
    expect(positions['dog']).toBeDefined();

    // Animal (superclase) debe estar en una coordenada Y menor que Dog (subclase)
    expect(positions['animal'].y).toBeLessThan(positions['dog'].y);
    // Debe haber separación vertical adecuada
    expect(positions['dog'].y - positions['animal'].y).toBeGreaterThanOrEqual(300);
  });

  it('lays out airline domain model with zero overlapping boxes and generous spacing', () => {
    const classes = [
      { id: 'vuelo', name: 'Vuelo', attributes: [{ id: '1', name: 'codigo', type: 'string' }, { id: '2', name: 'capacidad', type: 'int' }], methods: [], position: { x: 0, y: 0 } },
      { id: 'pasajero', name: 'Pasajero', attributes: [{ id: '3', name: 'nombre', type: 'string' }, { id: '4', name: 'email', type: 'string' }], methods: [], position: { x: 0, y: 0 } },
      { id: 'aeropuerto', name: 'Aeropuerto', attributes: [{ id: '5', name: 'ciudad', type: 'string' }], methods: [], position: { x: 0, y: 0 } },
      { id: 'reserva', name: 'Reserva', attributes: [{ id: '6', name: 'id', type: 'int' }, { id: '7', name: 'estado', type: 'string' }], methods: [], position: { x: 0, y: 0 } },
      { id: 'factura', name: 'Factura', attributes: [{ id: '8', name: 'total', type: 'float' }], methods: [], position: { x: 0, y: 0 } },
    ];

    const associations = [
      { id: 'a1', sourceClassId: 'vuelo', targetClassId: 'aeropuerto', directed: false, aggregation: 'none' as const, aggregationEnd: 'source' as const },
      { id: 'a2', sourceClassId: 'reserva', targetClassId: 'vuelo', directed: false, aggregation: 'none' as const, aggregationEnd: 'source' as const },
      { id: 'a3', sourceClassId: 'reserva', targetClassId: 'pasajero', directed: false, aggregation: 'none' as const, aggregationEnd: 'source' as const },
      { id: 'a4', sourceClassId: 'factura', targetClassId: 'reserva', directed: false, aggregation: 'none' as const, aggregationEnd: 'source' as const },
    ];

    const diagram: Diagram = {
      id: 'd-airline',
      name: 'Airline System',
      classes,
      associations,
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const positions = computeAutoLayout(diagram);

    // Verificar que todas las clases tengan posiciones asignadas
    classes.forEach((c) => {
      expect(positions[c.id]).toBeDefined();
    });

    // Verificar que NINGUNA clase colisione ni se superponga con otra
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const idA = classes[i].id;
        const idB = classes[j].id;
        const posA = positions[idA];
        const posB = positions[idB];
        const szA = estimateClassDimensions(classes[i]);
        const szB = estimateClassDimensions(classes[j]);

        const aLeft = posA.x;
        const aRight = posA.x + szA.width;
        const aTop = posA.y;
        const aBottom = posA.y + szA.height;

        const bLeft = posB.x;
        const bRight = posB.x + szB.width;
        const bTop = posB.y;
        const bBottom = posB.y + szB.height;

        const overlaps = !(
          aRight + 40 <= bLeft ||
          bRight + 40 <= aLeft ||
          aBottom + 40 <= bTop ||
          bBottom + 40 <= aTop
        );

        expect(overlaps, `Clases ${classes[i].name} y ${classes[j].name} colisionan visualmente`).toBe(false);
      }
    }
  });
});
