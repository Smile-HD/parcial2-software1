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

  it('synthesizes interfaces, realizations, and dependencies', () => {
    const raw = `
\`\`\`json
{
  "classes": [
    {
      "name": "Volador",
      "isInterface": true,
      "methods": [
        { "name": "volar", "returnType": "void" }
      ]
    },
    {
      "name": "Paloma",
      "attributes": [
        { "name": "nombre", "type": "string" }
      ]
    },
    {
      "name": "ServicioEmail",
      "methods": [
        { "name": "enviar", "returnType": "boolean" }
      ]
    }
  ],
  "realizations": [
    {
      "clientClass": "Paloma",
      "supplierInterface": "Volador"
    }
  ],
  "dependencies": [
    {
      "client": "Paloma",
      "supplier": "ServicioEmail"
    }
  ]
}
\`\`\``;

    const parsed = robustParseDomainJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.classes).toHaveLength(3);
    expect(parsed!.realizations).toHaveLength(1);
    expect(parsed!.dependencies).toHaveLength(1);

    const delta = expandSemanticDomainToDelta(parsed!, emptyDiagram.id, emptyDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);

    if (applied.ok) {
      const diagram = applied.value;
      const volador = diagram.classes.find(c => c.name === 'Volador');
      expect(volador).toBeDefined();
      expect(volador!.kind).toBe('interface');
      expect(volador!.methods).toHaveLength(1);

      expect(diagram.realizations).toHaveLength(1);
      expect(diagram.dependencies).toHaveLength(1);
    }
  });

  it('synthesizes n-ary associations with 3 or more participants', () => {
    const raw = `
\`\`\`json
{
  "classes": [
    { "name": "Profesor" },
    { "name": "Universidad" },
    { "name": "Gremio" }
  ],
  "naryAssociations": [
    {
      "name": "Contrato",
      "members": [
        { "class": "Profesor", "multiplicity": "1..*" },
        { "class": "Universidad", "multiplicity": "1" },
        { "class": "Gremio", "multiplicity": "0..1" }
      ]
    }
  ]
}
\`\`\``;

    const parsed = robustParseDomainJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.naryAssociations).toHaveLength(1);

    const delta = expandSemanticDomainToDelta(parsed!, emptyDiagram.id, emptyDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);

    if (applied.ok) {
      const diagram = applied.value;
      expect(diagram.naryAssociations).toHaveLength(1);
      expect(diagram.naryAssociations[0]!.name).toBe('Contrato');
      expect(diagram.naryAssociations[0]!.memberEnds).toHaveLength(3);
    }
  });

  it('synthesizes deletions for classes, attributes, methods, and associations', () => {
    const existingDiagram: Diagram = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      name: 'Diagrama con elementos para borrar',
      classes: [
        {
          id: '01925b42-d690-7c28-9f12-9c98a3f80c66',
          name: 'Factura',
          position: { x: 50, y: 50 },
          attributes: [
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c67', name: 'numero', type: 'string', visibility: '+', isStatic: false, isDerived: false },
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c68', name: 'obsoleto', type: 'string', visibility: '+', isStatic: false, isDerived: false },
          ],
          methods: [
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c69', name: 'calcularTotal', returnType: 'float', parameters: [], visibility: '+', isStatic: false },
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c6a', name: 'metodoViejo', returnType: 'void', parameters: [], visibility: '+', isStatic: false },
          ],
          kind: 'class',
          isAbstract: false,
        },
        {
          id: '01925b42-d690-7c28-9f12-9c98a3f80c6b',
          name: 'ClaseInutil',
          position: { x: 300, y: 50 },
          attributes: [],
          methods: [],
          kind: 'class',
          isAbstract: false,
        },
      ],
      associations: [
        {
          id: '01925b42-d690-7c28-9f12-9c98a3f80c6c',
          sourceClassId: '01925b42-d690-7c28-9f12-9c98a3f80c66',
          targetClassId: '01925b42-d690-7c28-9f12-9c98a3f80c6b',
          directed: false,
          aggregation: 'none',
          aggregationEnd: 'source',
        },
      ],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const raw = `
\`\`\`json
{
  "action": "delete",
  "deletions": {
    "classes": ["ClaseInutil"],
    "attributes": [{ "class": "Factura", "attribute": "obsoleto" }],
    "methods": [{ "class": "Factura", "method": "metodoViejo" }],
    "associations": [{ "source": "Factura", "target": "ClaseInutil" }]
  }
}
\`\`\``;

    const parsed = robustParseDomainJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.deletions).toBeDefined();

    const delta = expandSemanticDomainToDelta(parsed!, existingDiagram.id, existingDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(existingDiagram, delta!);
    expect(applied.ok).toBe(true);

    if (applied.ok) {
      const diagram = applied.value;
      // ClaseInutil eliminada
      expect(diagram.classes.find(c => c.name === 'ClaseInutil')).toBeUndefined();
      // Factura conservada pero sin atributo 'obsoleto' ni método 'metodoViejo'
      const factura = diagram.classes.find(c => c.name === 'Factura');
      expect(factura).toBeDefined();
      expect(factura!.attributes.find(a => a.name === 'obsoleto')).toBeUndefined();
      expect(factura!.attributes.find(a => a.name === 'numero')).toBeDefined();
      expect(factura!.methods.find(m => m.name === 'metodoViejo')).toBeUndefined();
      expect(factura!.methods.find(m => m.name === 'calcularTotal')).toBeDefined();
      // Asociacion eliminada
      expect(diagram.associations).toHaveLength(0);
    }
  });

  it('deduplicates associations when classes already have a relationship in the diagram or batch', () => {
    const classAId = '01925b42-d690-7c28-9f12-9c98a3f80c01';
    const classBId = '01925b42-d690-7c28-9f12-9c98a3f80c02';
    const existingDiagramWithAssoc: Diagram = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      name: 'Existing Assoc Diagram',
      classes: [
        { id: classAId, name: 'Vuelo', attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: classBId, name: 'Pasajero', attributes: [], methods: [], position: { x: 300, y: 0 } },
      ],
      associations: [
        {
          id: '01925b42-d690-7c28-9f12-9c98a3f80c03',
          sourceClassId: classAId,
          targetClassId: classBId,
          directed: false,
          aggregation: 'none',
          aggregationEnd: 'source',
        },
      ],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const modelWithDuplicateAssocs: SemanticDomainModel = {
      classes: [
        { name: 'Vuelo' },
        { name: 'Pasajero' },
        { name: 'Reserva' },
      ],
      associations: [
        // Esta asociación entre Vuelo y Pasajero ya existe en el diagrama existente: debe ser descartada
        { source: 'Vuelo', target: 'Pasajero' },
        // Y si viene repetida en reversa en el mismo lote: debe ser descartada
        { source: 'Pasajero', target: 'Vuelo' },
        // Esta nueva relación hacia Reserva debe ser aceptada
        { source: 'Pasajero', target: 'Reserva' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWithDuplicateAssocs, existingDiagramWithAssoc.id, existingDiagramWithAssoc);
    expect(delta).not.toBeNull();
    const assocDeltas = delta!.deltas.filter((d: any) => d.kind === 'association');
    // Solo 1 asociación permitida (Pasajero <-> Reserva). Las asociaciones duplicadas (Vuelo <-> Pasajero) deben descartarse.
    expect(assocDeltas).toHaveLength(1);
    expect(assocDeltas[0].sourceClassId === classBId || assocDeltas[0].targetClassId === classBId).toBe(true);
  });
});


