import { describe, it, expect } from 'vitest';
import { expandSemanticDomainToDelta, synthesizeDomainModel, robustParseDomainJson, type SemanticDomainModel } from './domain-synthesizer.js';
import { applyDelta, type Diagram } from '@app/core';

describe('AI Domain Synthesizer & Dynamic Generation', () => {
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

  it('dynamically generates tailored domain model from LLM chat with markdown fences', async () => {
    const fakeAiLlm = {
      interpret: async () => ({ kind: 'refused' as const, reason: 'none' }),
      chat: async () => `Here is the UML model:
\`\`\`json
{
  "classes": [
    { "name": "Prenda", "attributes": [{ "name": "talla", "type": "string" }, { "name": "color", "type": "string" }] },
    { "name": "Categoria", "attributes": [{ "name": "nombre", "type": "string" }] }
  ],
  "associations": [
    { "source": "Prenda", "target": "Categoria", "sourceMultiplicity": "*", "targetMultiplicity": "1" }
  ]
}
\`\`\``
    };

    const delta = await synthesizeDomainModel('haceme una base de datos para tienda de ropa', emptyDiagram.id, fakeAiLlm as any);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.classes.map(c => c.name)).toEqual(['Prenda', 'Categoria']);
      expect(applied.value.associations).toHaveLength(1);
      expect(applied.value.associations[0]!.directed).toBe(false);
    }
  });

  it('parses dictionary-style classes, generalizations, and object source/target', () => {
    const raw = `
\`\`\`json
{
  "action": "modify",
  "classes": {
    "Profesor": {
      "attributes": {
        "telefono": "string"
      }
    },
    "Persona": {
      "attributes": {
        "ci": "string"
      }
    }
  },
  "associations": [
    {
      "name": "generaliza",
      "source": { "name": "Profesor" },
      "target": { "name": "Persona" }
    }
  ]
}
\`\`\``;

    const parsed = robustParseDomainJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.classes).toHaveLength(2);
    expect(parsed!.classes[0]!.name).toBe('Profesor');
    expect(parsed!.classes[0]!.attributes).toEqual([{ name: 'telefono', type: 'string' }]);
    expect(parsed!.classes[1]!.name).toBe('Persona');
    expect(parsed!.classes[1]!.attributes).toEqual([{ name: 'ci', type: 'string' }]);
    expect(parsed!.associations).toHaveLength(1);
    expect(parsed!.associations![0]!.source).toBe('Profesor');
    expect(parsed!.associations![0]!.target).toBe('Persona');

    // Ahora expandir considerando que Profesor ya existe en el diagrama
    const currentDiagram: Diagram = {
      id: 'diag-1',
      name: 'Diagrama Existente',
      classes: [
        {
          id: 'prof-id-1',
          name: 'Profesor',
          position: { x: 100, y: 100 },
          attributes: [{ id: 'attr-1', name: 'nombre', type: 'string', visibility: '+', isStatic: false, isDerived: false }],
          methods: [],
          kind: 'class',
          isAbstract: false,
        },
      ],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const delta = expandSemanticDomainToDelta(parsed!, currentDiagram.id, currentDiagram);
    expect(delta).not.toBeNull();

    // Profesor NO debe emitir op: 'create' para la clase
    const classCreates = delta!.deltas.filter((d: any) => d.kind === 'class' && d.op === 'create');
    expect(classCreates).toHaveLength(1);
    expect((classCreates[0] as any).name).toBe('Persona');

    // Debe emitir addAttribute para telefono sobre prof-id-1
    const attrAdds = delta!.deltas.filter((d: any) => d.kind === 'member' && d.op === 'addAttribute');
    const profAttr = attrAdds.find((a: any) => a.classId === 'prof-id-1');
    expect(profAttr).toBeDefined();
    expect((profAttr as any).name).toBe('telefono');

    // Debe emitir una generalización porque la asociación se llama "generaliza"
    const genCreates = delta!.deltas.filter((d: any) => d.kind === 'generalization' && d.op === 'create');
    expect(genCreates).toHaveLength(1);
    expect((genCreates[0] as any).subClassId).toBe('prof-id-1');
  });
});

