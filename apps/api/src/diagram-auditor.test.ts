import { describe, expect, it } from 'vitest';
import { auditDiagramOOAD } from './diagram-auditor.js';

describe('Deterministic OOAD Diagram Auditor', () => {
  const mixedDomainDiagram = {
    classes: [
      // Subgrafo 1: Aerolínea
      {
        id: 'cls-aerolinea',
        name: 'Aerolinea',
        attributes: [
          { id: 'a1', name: 'codigoIATA', type: 'string' },
          { id: 'a2', name: 'nombre:string', type: 'string' }, // malformed
        ],
        methods: [],
      },
      {
        id: 'cls-pasajero',
        name: 'Pasajero',
        attributes: [{ id: 'a3', name: 'dni', type: 'string' }],
        methods: [],
      },
      // Subgrafo 2: Facturación (desconectado)
      {
        id: 'cls-factura',
        name: 'Factura',
        attributes: [
          { id: 'a4', name: 'numero', type: 'int' },
          { id: 'a5', name: 'date', type: 'string' }, // orphan type name
        ],
        methods: [],
      },
      {
        id: 'cls-detalle',
        name: 'DetalleFactura',
        attributes: [{ id: 'a6', name: 'cantidad', type: 'int' }],
        methods: [],
      },
      // Clase huérfana aislada
      {
        id: 'cls-huerfana',
        name: 'Bitacora',
        attributes: [],
        methods: [],
      },
    ],
    associations: [
      {
        id: 'assoc-1',
        sourceClassId: 'cls-aerolinea',
        targetClassId: 'cls-pasajero',
        aggregation: 'composite',
        sourceMultiplicity: '1',
        targetMultiplicity: '*',
      },
      {
        id: 'assoc-2',
        sourceClassId: 'cls-factura',
        targetClassId: 'cls-detalle',
        aggregation: 'composite',
        // missing targetMultiplicity deliberately to test detection
        sourceMultiplicity: '1',
      },
    ],
    generalizations: [],
    realizations: [],
    dependencies: [],
  };

  it('detects disjoint subgraphs and mixed domains without hallucination', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'es');
    expect(report).toContain('Subgrafos Desconectados / Mezcla de Dominios');
    expect(report).toContain('Aerolinea');
    expect(report).toContain('Factura');
  });

  it('detects malformed type-leaked attributes and orphan type names', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'es');
    expect(report).toContain('nombre:string');
    expect(report).toContain('date');
  });

  it('detects anemic domain model when 0 methods exist', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'es');
    expect(report).toContain('Modelo de Dominio Anémico');
    expect(report).toContain('0 métodos');
  });

  it('detects isolated orphan classes', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'es');
    expect(report).toContain('Clases Huérfanas');
    expect(report).toContain('"Bitacora"');
  });

  it('detects missing relationship multiplicities', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'es');
    expect(report).toContain('Multiplicidad Ausente');
    expect(report).toContain('"Factura"');
  });

  it('generates English report when language is en', () => {
    const report = auditDiagramOOAD(mixedDomainDiagram, 'en');
    expect(report).toContain('AUDIT REPORT — OOAD & UML METAMODEL QUALITY');
    expect(report).toContain('Disjoint Subgraphs / Mixed Domains');
    expect(report).toContain('Anemic Domain Model');
  });
});
