import { describe, expect, it } from 'vitest';
import { resolveDiagramFactualQuery } from './diagram-query-resolver.js';

describe('Diagram Factual Query Resolver (Deterministic Diagram State)', () => {
  const fixtureDiagram = {
    classes: [
      {
        id: 'cls-aerolinea',
        name: 'Aerolinea',
        attributes: [
          { id: 'a1', name: 'codigoIATA', type: 'string' },
          { id: 'a2', name: 'nombre', type: 'string' },
        ],
        methods: [],
      },
      {
        id: 'cls-sucursal',
        name: 'Sucursal',
        attributes: [
          { id: 'a3', name: 'ciudad', type: 'string' },
          { id: 'a4', name: 'direccion', type: 'string' },
        ],
        methods: [],
      },
      {
        id: 'cls-pasajero',
        name: 'Pasajero',
        attributes: [
          { id: 'a5', name: 'dni', type: 'string' },
          { id: 'a6', name: 'nombreCompleto', type: 'string' },
          { id: 'a7', name: 'email', type: 'string' },
        ],
        methods: [],
      },
      {
        id: 'cls-viaje',
        name: 'Viaje',
        attributes: [
          { id: 'a8', name: 'fechaSalida', type: 'date' },
          { id: 'a9', name: 'fechaLlegada', type: 'date' },
          { id: 'a10', name: 'duracion', type: 'int' },
          { id: 'a11', name: 'precioTotal', type: 'float' },
        ],
        methods: [],
      },
    ],
    associations: [
      {
        id: 'assoc-1',
        sourceClassId: 'cls-viaje',
        targetClassId: 'cls-pasajero',
        aggregation: 'composite',
        aggregationEnd: 'source',
        sourceMultiplicity: '*',
        targetMultiplicity: '0..*',
      },
      {
        id: 'assoc-2',
        sourceClassId: 'cls-aerolinea',
        targetClassId: 'cls-sucursal',
        aggregation: 'composite',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ],
    generalizations: [],
    realizations: [],
    dependencies: [],
  };

  it('Prueba 1: counts and lists classes correctly', () => {
    const res = resolveDiagramFactualQuery(
      'Cuantas clases tiene el diagrama y como se llaman?',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('4 clases');
    expect(res).toContain('"Aerolinea"');
    expect(res).toContain('"Sucursal"');
    expect(res).toContain('"Pasajero"');
    expect(res).toContain('"Viaje"');
  });

  it('Prueba 2: returns truthful non-existence for missing class (Zero Hallucination)', () => {
    const res = resolveDiagramFactualQuery(
      'Que atributos tiene la clase Reserva?',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('La clase "Reserva" no existe en el diagrama actual');
    expect(res).toContain('"Aerolinea", "Sucursal", "Pasajero", "Viaje"');
  });

  it('Prueba 3: returns exact attribute count and names for existing class', () => {
    const res = resolveDiagramFactualQuery(
      'Cuantos atributos tiene la clase Viaje?',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('La clase "Viaje" tiene 4 atributos:');
    expect(res).toContain('+fechaSalida: date');
    expect(res).toContain('+fechaLlegada: date');
    expect(res).toContain('+duracion: int');
    expect(res).toContain('+precioTotal: float');
    // Does NOT hallucinate fake "id"
    expect(res).not.toContain('+id:');
  });

  it('Prueba 4: returns exact relationship and multiplicity without inversion', () => {
    const res = resolveDiagramFactualQuery(
      'Cual es la relacion entre Pasajero y Viaje y que multiplicidad tiene?',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('composición');
    expect(res).toContain('desde "Viaje" hacia "Pasajero"');
    expect(res).toContain('origen "Viaje" tiene *');
    expect(res).toContain('destino "Pasajero" tiene 0..*');
  });

  it('Prueba 5: answers location and connections in English when queried in English', () => {
    const res = resolveDiagramFactualQuery(
      'Where does the Pasajero class appear in the diagram?',
      fixtureDiagram,
      'en'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('The class "Pasajero" is present on the canvas');
    expect(res).toContain('Connected classes: "Viaje"');
  });

  it('Prueba 7: lists attributes textually without triggering mutation proposals', () => {
    const res = resolveDiagramFactualQuery(
      'Lista textualmente los atributos de la clase Pasajero, con su tipo, sin interpretar nada.',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('La clase "Pasajero" tiene 3 atributos:');
    expect(res).toContain('+dni: string');
    expect(res).toContain('+nombreCompleto: string');
    expect(res).toContain('+email: string');
  });

  it('reports 0 methods truthfully when class has no methods', () => {
    const res = resolveDiagramFactualQuery(
      'Que metodos tiene la clase Pasajero?',
      fixtureDiagram,
      'es'
    );
    expect(res).not.toBeNull();
    expect(res).toContain('actualmente no tiene métodos definidos');
  });

  it('returns null for non-factual or modeling mutation commands so they pass to LLM', () => {
    const res1 = resolveDiagramFactualQuery(
      'Crear una clase Empleado con legajo y sueldo',
      fixtureDiagram,
      'es'
    );
    expect(res1).toBeNull();

    const res2 = resolveDiagramFactualQuery(
      '¿Qué ventajas tiene usar agregación en lugar de composición en este dominio?',
      fixtureDiagram,
      'es'
    );
    expect(res2).toBeNull();
  });
});
