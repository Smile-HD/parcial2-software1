import { describe, it, expect } from 'vitest';
import { expandSemanticDomainToDelta, synthesizeDomainTemplate, synthesizeDomainModel, type SemanticDomainModel } from './domain-synthesizer.js';
import { applyDelta, type Diagram } from '@app/core';

describe('AI Domain Synthesizer & Relationship Expansion', () => {
  const emptyDiagram: Diagram = {
    id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
    name: 'Test Canvas',
    classes: [],
    associations: [],
    generalizations: [],
    realizations: [],
    dependencies: [],
    naryAssociations: [],
  };

  it('generates a valid BatchDelta from an AI semantic model with associations, composition and association classes', () => {
    const aiSemanticModel: SemanticDomainModel = {
      classes: [
        {
          name: 'Estudiante',
          attributes: [{ name: 'id', type: 'int' }, { name: 'nombre', type: 'string' }],
        },
        {
          name: 'Curso',
          attributes: [{ name: 'id', type: 'int' }, { name: 'titulo', type: 'string' }],
        },
        {
          name: 'Inscripcion',
          attributes: [{ name: 'id', type: 'int' }, { name: 'fecha', type: 'string' }, { name: 'calificacion', type: 'float' }],
        },
      ],
      associations: [
        {
          source: 'Estudiante',
          target: 'Curso',
          sourceMultiplicity: '1..*',
          targetMultiplicity: '0..*',
          associationClass: 'Inscripcion',
        },
        {
          source: 'Estudiante',
          target: 'Inscripcion',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
          aggregation: 'composite',
          aggregationEnd: 'source',
        },
      ],
    };

    const delta = expandSemanticDomainToDelta(aiSemanticModel, emptyDiagram.id);
    expect(delta).not.toBeNull();
    expect(delta!.kind).toBe('batch');

    // Aplicar el delta al diagrama vacío utilizando el motor oficial de @app/core
    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);

    if (applied.ok) {
      const diagram = applied.value;
      expect(diagram.classes).toHaveLength(3);
      expect(diagram.associations).toHaveLength(2);

      // Verificar que la asociación tiene directed: false y multiplicity válidas
      const assoc = diagram.associations[0]!;
      expect(assoc.directed).toBe(false);
      expect(assoc.sourceMultiplicity).toBe('1..*');
      expect(assoc.targetMultiplicity).toBe('0..*');
      expect(assoc.associationClassId).toBeDefined();

      // Verificar que la segunda asociación tiene composición
      const comp = diagram.associations[1]!;
      expect(comp.directed).toBe(false);
      expect(comp.aggregation).toBe('composite');
      expect(comp.aggregationEnd).toBe('source');
    }
  });

  it('ecommerce template generates valid associations, composite items, and association class', () => {
    const delta = synthesizeDomainTemplate('crea una tienda online con pedidos y productos', emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);

    if (applied.ok) {
      const diagram = applied.value;
      expect(diagram.classes.map(c => c.name)).toContain('Producto');
      expect(diagram.classes.map(c => c.name)).toContain('Cliente');
      expect(diagram.classes.map(c => c.name)).toContain('Pedido');
      expect(diagram.classes.map(c => c.name)).toContain('ItemPedido');

      expect(diagram.associations.length).toBeGreaterThanOrEqual(3);

      // Composición entre Pedido e ItemPedido
      const compositeAssoc = diagram.associations.find(a => a.aggregation === 'composite');
      expect(compositeAssoc).toBeDefined();
      expect(compositeAssoc!.directed).toBe(false);

      // Clase de asociación ItemPedido
      const assocClass = diagram.associations.find(a => a.associationClassId !== undefined);
      expect(assocClass).toBeDefined();
    }
  });

  it('delegates to dynamic AI if llm supports chat', async () => {
    const fakeAiLlm = {
      interpret: async () => ({ kind: 'refused' as const, reason: 'none' }),
      chat: async () => JSON.stringify({
        classes: [
          { name: 'NaveEspacial', attributes: [{ name: 'modelo', type: 'string' }] },
          { name: 'Piloto', attributes: [{ name: 'licencia', type: 'string' }] },
        ],
        associations: [
          { source: 'NaveEspacial', target: 'Piloto', sourceMultiplicity: '1', targetMultiplicity: '1..*' }
        ]
      })
    };

    const delta = await synthesizeDomainModel('diseñame un sistema de naves espaciales y pilotos', emptyDiagram.id, fakeAiLlm as any);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.classes.map(c => c.name)).toEqual(['NaveEspacial', 'Piloto']);
      expect(applied.value.associations).toHaveLength(1);
      expect(applied.value.associations[0]!.directed).toBe(false);
    }
  });
});
