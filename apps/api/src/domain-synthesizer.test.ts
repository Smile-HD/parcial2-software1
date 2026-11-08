import { describe, it, expect } from 'vitest';
import { expandSemanticDomainToDelta, synthesizeDomainModel, robustParseDomainJson, extractExplicitModelMutations, type SemanticDomainModel } from './domain-synthesizer.js';
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

  it('auto-backfills realistic domain attributes for empty classes so no class is created with 0 attributes', () => {
    const modelWithEmptyClasses: SemanticDomainModel = {
      classes: [
        { name: 'Producto' },
        { name: 'Factura' },
        { name: 'Cliente' },
      ],
      associations: [
        { source: 'Cliente', target: 'Factura', aggregation: 'none' },
        { source: 'Factura', target: 'Producto', aggregation: 'none' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWithEmptyClasses, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const diagram = applied.value;
      for (const cls of diagram.classes) {
        expect(cls.attributes.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('guarantees graph connectivity: connects isolated orphan classes to anchor class', () => {
    const modelWithOrphan: SemanticDomainModel = {
      classes: [
        { name: 'Factura', attributes: [{ name: 'id', type: 'int' }] },
        { name: 'DetalleFactura', attributes: [{ name: 'cantidad', type: 'int' }] },
        // Esta clase queda completamente desconectada en el JSON del LLM
        { name: 'Notificacion', attributes: [{ name: 'mensaje', type: 'string' }] },
      ],
      associations: [
        { source: 'Factura', target: 'DetalleFactura', aggregation: 'composite' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWithOrphan, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const diagram = applied.value;
      const notifClass = diagram.classes.find((c) => c.name === 'Notificacion');
      expect(notifClass).toBeDefined();

      // Verificar que Notificacion no quedó aislada
      const notifAssoc = diagram.associations.find(
        (a) => a.sourceClassId === notifClass!.id || a.targetClassId === notifClass!.id
      );
      expect(notifAssoc).toBeDefined();
    }
  });

  it('prevents relating the same class pair with 2 aggregations or duplicate edges', () => {
    const modelWith2Aggregations: SemanticDomainModel = {
      classes: [
        { name: 'Carrito' },
        { name: 'Producto' },
      ],
      associations: [
        // Dos agregaciones entre el mismo par de clases
        { source: 'Carrito', target: 'Producto', aggregation: 'shared' },
        { source: 'Carrito', target: 'Producto', aggregation: 'shared' },
        { source: 'Producto', target: 'Carrito', aggregation: 'none' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWith2Aggregations, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const diagram = applied.value;
      // Solo 1 asociación permitida entre Carrito y Producto
      expect(diagram.associations).toHaveLength(1);
      expect(diagram.associations[0].aggregation).toBe('shared');
    }
  });

  it('prioritizes generalization over association when both are proposed between same classes', () => {
    const modelWithGenAndAssoc: SemanticDomainModel = {
      classes: [
        { name: 'Animal', attributes: [{ name: 'nombre', type: 'string' }] },
        { name: 'Perro', attributes: [{ name: 'raza', type: 'string' }] },
      ],
      generalizations: [
        { subclass: 'Perro', superclass: 'Animal' },
      ],
      associations: [
        // Esta asociación redundante debe ser descartada a favor de la generalización
        { source: 'Perro', target: 'Animal', aggregation: 'none' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWithGenAndAssoc, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const diagram = applied.value;
      expect(diagram.generalizations).toHaveLength(1);
      expect(diagram.associations).toHaveLength(0);
    }
  });

  it('cleans class names with quotes, markdown bold, and prefixes like "Clase "', () => {
    const modelWithMessyNames: SemanticDomainModel = {
      classes: [
        { name: 'Clase "Producto"' },
        { name: '**Carrito**' },
      ],
      associations: [
        { source: 'Clase "Carrito"', target: 'Producto', aggregation: 'shared' },
      ],
    };

    const delta = expandSemanticDomainToDelta(modelWithMessyNames, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const diagram = applied.value;
      expect(diagram.classes.map((c) => c.name).sort()).toEqual(['Carrito', 'Producto']);
      expect(diagram.associations).toHaveLength(1);
    }
  });

  it('sanitizes attribute names with type suffixes and avoids duplicating existing class attributes', () => {
    const existingCanvas: Diagram = {
      ...emptyDiagram,
      classes: [
        {
          id: '01925b42-d690-7c28-9f12-9c98a3f80c66',
          name: 'Aerolinea',
          isAbstract: false,
          position: { x: 100, y: 100 },
          attributes: [
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c67', name: 'nombre', type: 'string' },
            { id: '01925b42-d690-7c28-9f12-9c98a3f80c68', name: 'codigoIATA', type: 'string' },
          ],
          methods: [],
        },
      ],
    };

    // Modelo donde el LLM devuelve atributos con tipo pegado al nombre (nombre:string)
    const messyModel: SemanticDomainModel = {
      classes: [
        {
          name: 'Aerolinea',
          attributes: [
            { name: 'nombre:string', type: 'string' },
            { name: 'codigoIATA', type: 'string' },
            { name: 'direccion:string', type: 'string' },
          ],
        },
      ],
    };

    const delta = expandSemanticDomainToDelta(messyModel, existingCanvas.id, existingCanvas);
    expect(delta).not.toBeNull();

    // Solo debe agregar "direccion" (sin duplicar "nombre" ni "codigoIATA")
    const memberDeltas = delta!.deltas.filter((d: any) => d.kind === 'member');
    expect(memberDeltas).toHaveLength(1);
    expect(memberDeltas[0].op).toBe('addAttribute');
    expect(memberDeltas[0].name).toBe('direccion');
    expect(memberDeltas[0].type).toBe('string');

    const applied = applyDelta(existingCanvas, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const aero = applied.value.classes[0];
      expect(aero.attributes).toHaveLength(3);
      expect(aero.attributes.map(a => a.name)).toEqual(['nombre', 'codigoIATA', 'direccion']);
    }
  });

  it('updates existing association aggregation from composite to none using updateMultiplicity', () => {
    const classAId = '01925b42-d690-7c28-9f12-9c98a3f80c71';
    const classBId = '01925b42-d690-7c28-9f12-9c98a3f80c72';
    const assocId = '01925b42-d690-7c28-9f12-9c98a3f80c73';

    const existingCanvas: Diagram = {
      ...emptyDiagram,
      classes: [
        { id: classAId, name: 'Aerolinea', isAbstract: false, position: { x: 50, y: 50 }, attributes: [], methods: [] },
        { id: classBId, name: 'Pasajero', isAbstract: false, position: { x: 350, y: 50 }, attributes: [], methods: [] },
      ],
      associations: [
        {
          id: assocId,
          sourceClassId: classAId,
          targetClassId: classBId,
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
          directed: false,
          aggregation: 'composite',
          aggregationEnd: 'source',
        },
      ],
    };

    // Usuario pide cambiar la relación entre Aerolinea y Pasajero a asociación simple
    const changeRelModel: SemanticDomainModel = {
      associations: [
        {
          source: 'Aerolinea',
          target: 'Pasajero',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
      ],
    };

    const delta = expandSemanticDomainToDelta(changeRelModel, existingCanvas.id, existingCanvas);
    expect(delta).not.toBeNull();

    const assocDeltas = delta!.deltas.filter((d: any) => d.kind === 'association');
    expect(assocDeltas).toHaveLength(1);
    expect(assocDeltas[0].op).toBe('updateMultiplicity');
    expect(assocDeltas[0].associationId).toBe(assocId);
    expect(assocDeltas[0].aggregation).toBe('none');

    const applied = applyDelta(existingCanvas, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.associations[0].aggregation).toBe('none');
    }
  });

  it('enforces composition guardrail: downgrades non-lifecycle composite requests to plain association', () => {
    // Si la IA intenta componer Aerolinea -> Pasajero, debe degradarse a none
    const bogusCompositionModel: SemanticDomainModel = {
      classes: [
        { name: 'Aerolinea', attributes: [{ name: 'nombre', type: 'string' }] },
        { name: 'Pasajero', attributes: [{ name: 'dni', type: 'string' }] },
      ],
      associations: [
        { source: 'Aerolinea', target: 'Pasajero', aggregation: 'composite' },
      ],
    };

    const delta = expandSemanticDomainToDelta(bogusCompositionModel, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const assocDelta = delta!.deltas.find((d: any) => d.kind === 'association');
    expect(assocDelta.aggregation).toBe('none');

    // Pero si es Factura -> DetalleFactura, se preserva como composite
    const validCompositionModel: SemanticDomainModel = {
      classes: [
        { name: 'Factura', attributes: [{ name: 'numero', type: 'string' }] },
        { name: 'DetalleFactura', attributes: [{ name: 'cantidad', type: 'int' }] },
      ],
      associations: [
        { source: 'Factura', target: 'DetalleFactura', aggregation: 'composite' },
      ],
    };

    const validDelta = expandSemanticDomainToDelta(validCompositionModel, emptyDiagram.id);
    expect(validDelta).not.toBeNull();
    const validAssoc = validDelta!.deltas.find((d: any) => d.kind === 'association');
    expect(validAssoc.aggregation).toBe('composite');
  });

  it('supports recursive associations with roles', () => {
    const recursiveModel: SemanticDomainModel = {
      classes: [
        { name: 'Empleado', attributes: [{ name: 'legajo', type: 'string' }, { name: 'nombre', type: 'string' }] },
      ],
      associations: [
        {
          source: 'Empleado',
          target: 'Empleado',
          aggregation: 'none',
          sourceRole: 'supervisor',
          targetRole: 'subordinados',
          sourceMultiplicity: '0..1',
          targetMultiplicity: '0..*',
        },
      ],
    };

    const delta = expandSemanticDomainToDelta(recursiveModel, emptyDiagram.id);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.associations).toHaveLength(1);
      const rec = applied.value.associations[0];
      expect(rec.sourceClassId).toBe(rec.targetClassId);
      expect(rec.sourceRole).toBe('supervisor');
      expect(rec.targetRole).toBe('subordinados');
      expect(rec.sourceMultiplicity).toBe('0..1');
      expect(rec.targetMultiplicity).toBe('0..*');
    }
  });

  it('extracts explicit multiplicities from Spanish utterances and overrides * <-> *', () => {
    const model: SemanticDomainModel = {
      classes: [
        { name: 'Cliente', attributes: [{ name: 'dni', type: 'string' }, { name: 'nombre', type: 'string' }] },
        { name: 'Turno', attributes: [{ name: 'hora', type: 'date' }, { name: 'fecha', type: 'date' }] },
      ],
      associations: [
        {
          source: 'Cliente',
          target: 'Turno',
          aggregation: 'none',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ],
    };

    const prompt = 'crea una clase Cliente con dni y nombre, crea una clase Turno con hora y fecha, y asocia Cliente con Turno donde un cliente tiene muchos turnos y cada turno pertenece a un solo cliente';
    const delta = expandSemanticDomainToDelta(model, emptyDiagram.id, emptyDiagram, prompt);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const assoc = applied.value.associations[0];
      expect(assoc.sourceMultiplicity).toBe('1');
      expect(assoc.targetMultiplicity).toBe('0..*');
    }
  });

  it('prunes unrequested hallucinated classes when user asked for specific classes', () => {
    const existingCanvas: Diagram = {
      ...emptyDiagram,
      classes: [
        {
          id: crypto.randomUUID(),
          name: 'Libro',
          isAbstract: false,
          attributes: [{ id: crypto.randomUUID(), name: 'titulo', type: 'string', visibility: '+', isStatic: false, isDerived: false }],
          methods: [],
          position: { x: 100, y: 100 },
        },
      ],
    };

    const modelWithHallucinatedCliente: SemanticDomainModel = {
      classes: [
        { name: 'ReservaDeLibro', attributes: [{ name: 'codigo', type: 'string' }, { name: 'fecha', type: 'date' }] },
        { name: 'Cliente', attributes: [{ name: 'nombre', type: 'string' }, { name: 'email', type: 'string' }] },
      ],
      associations: [
        {
          source: 'ReservaDeLibro',
          target: 'Libro',
          aggregation: 'none',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ],
    };

    const prompt = 'agrega al modelo una clase ReservaDeLibro con atributos codigo y fecha y una asociacion entre ReservaDeLibro y Libro donde un libro tiene muchas reservas';
    const delta = expandSemanticDomainToDelta(modelWithHallucinatedCliente, existingCanvas.id, existingCanvas, prompt);
    expect(delta).not.toBeNull();

    const applied = applyDelta(existingCanvas, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      // Cliente no debe ser creada en el diagrama
      const classNames = applied.value.classes.map((c) => c.name);
      expect(classNames).toContain('ReservaDeLibro');
      expect(classNames).toContain('Libro');
      expect(classNames).not.toContain('Cliente');

      // La asociación debe respetar la cardinalidad de la frase ("un libro tiene muchas reservas")
      const assoc = applied.value.associations[0];
      expect(assoc.sourceMultiplicity).toBe('0..*');
      expect(assoc.targetMultiplicity).toBe('1');
    }
  });

  it('remaps few-shot contaminated class names back to explicitly requested names', () => {
    const modelWithFacturaInsteadOfPedido: SemanticDomainModel = {
      classes: [
        { name: 'Factura', attributes: [{ name: 'codigo', type: 'string' }, { name: 'total', type: 'float' }] },
        { name: 'DetallePedido', attributes: [{ name: 'cantidad', type: 'int' }, { name: 'subtotal', type: 'float' }] },
      ],
      associations: [
        {
          source: 'Factura',
          target: 'DetallePedido',
          aggregation: 'composite',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
      ],
    };

    const prompt = 'crea una clase Pedido con codigo y total, y una clase DetallePedido con cantidad y subtotal, y conectalos con una asociacion donde un Pedido tiene uno o muchos DetallePedido';
    const delta = expandSemanticDomainToDelta(modelWithFacturaInsteadOfPedido, emptyDiagram.id, emptyDiagram, prompt);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const classNames = applied.value.classes.map((c) => c.name);
      expect(classNames).toContain('Pedido');
      expect(classNames).toContain('DetallePedido');
      expect(classNames).not.toContain('Factura');

      const assoc = applied.value.associations[0];
      expect(assoc.aggregation).toBe('composite');
      expect(assoc.sourceMultiplicity).toBe('1');
      expect(assoc.targetMultiplicity).toBe('1..*');
    }
  });

  it('correctly resolves 1:1 explicit cardinality (M2 Round 5)', () => {
    const model: SemanticDomainModel = {
      classes: [
        { name: 'Persona', attributes: [{ name: 'nombre', type: 'string' }] },
        { name: 'Pasaporte', attributes: [{ name: 'numero', type: 'string' }] },
      ],
      associations: [
        {
          source: 'Persona',
          target: 'Pasaporte',
          aggregation: 'none',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ],
    };

    const prompt = 'crea Persona y Pasaporte relacionadas uno a uno: cada persona posee exactamente un pasaporte y cada pasaporte pertenece a una sola persona';
    const delta = expandSemanticDomainToDelta(model, emptyDiagram.id, emptyDiagram, prompt);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const assoc = applied.value.associations[0];
      expect(assoc.sourceMultiplicity).toBe('1');
      expect(assoc.targetMultiplicity).toBe('1');
    }
  });

  it('correctly resolves domain verbs for multiplicity (M4 Round 5: opera muchos vuelos, despega desde un unico)', () => {
    const model: SemanticDomainModel = {
      classes: [
        { name: 'Aeropuerto', attributes: [{ name: 'codigoIATA', type: 'string' }] },
        { name: 'Vuelo', attributes: [{ name: 'numero', type: 'string' }] },
      ],
      associations: [
        {
          source: 'Aeropuerto',
          target: 'Vuelo',
          aggregation: 'none',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ],
    };

    const prompt = 'un aeropuerto opera muchos vuelos y cada vuelo despega desde un unico aeropuerto';
    const delta = expandSemanticDomainToDelta(model, emptyDiagram.id, emptyDiagram, prompt);
    expect(delta).not.toBeNull();

    const applied = applyDelta(emptyDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const assoc = applied.value.associations[0];
      expect(assoc.sourceMultiplicity).toBe('1');
      expect(assoc.targetMultiplicity).toBe('0..*');
    }
  });

  it('synthesizes class, attribute, and method renames and updates symbol table in-flight', () => {
    const classId = crypto.randomUUID();
    const attrId = crypto.randomUUID();
    const methodId = crypto.randomUUID();
    const existingDiagram: Diagram = {
      id: crypto.randomUUID(),
      name: 'Existing Canvas',
      classes: [
        {
          id: classId,
          name: 'Estudiante',
          position: { x: 100, y: 100 },
          classKind: 'class',
          isAbstract: false,
          attributes: [
            { id: attrId, name: 'nombreViejo', type: 'string', visibility: '+' },
          ],
          methods: [
            { id: methodId, name: 'metodoViejo', returnType: 'void', parameters: [], visibility: '+' },
          ],
        },
      ],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const model: SemanticDomainModel = {
      renames: {
        classes: [{ from: 'Estudiante', to: 'Alumno' }],
        attributes: [{ class: 'Estudiante', from: 'nombreViejo', to: 'nombreCompleto' }],
        methods: [{ class: 'Estudiante', from: 'metodoViejo', to: 'calcularPromedio' }],
      },
    };

    const delta = expandSemanticDomainToDelta(model, existingDiagram.id, existingDiagram);
    expect(delta).not.toBeNull();
    expect(delta!.deltas).toHaveLength(3);

    const renameClassDelta = delta!.deltas.find((d: any) => d.kind === 'class' && d.op === 'rename');
    expect(renameClassDelta).toBeDefined();
    expect(renameClassDelta.newName).toBe('Alumno');

    const editAttrDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'editAttribute');
    expect(editAttrDelta).toBeDefined();
    expect(editAttrDelta.name).toBe('nombreCompleto');

    const editMethodDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'editMethod');
    expect(editMethodDelta).toBeDefined();
    expect(editMethodDelta.name).toBe('calcularPromedio');

    const applied = applyDelta(existingDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.classes[0]!.name).toBe('Alumno');
      expect(applied.value.classes[0]!.attributes[0]!.name).toBe('nombreCompleto');
      expect(applied.value.classes[0]!.methods[0]!.name).toBe('calcularPromedio');
    }
  });

  it('synthesizes class updates (classKind, isAbstract) and reposition', () => {
    const classId = crypto.randomUUID();
    const existingDiagram: Diagram = {
      id: crypto.randomUUID(),
      name: 'Existing Canvas',
      classes: [
        {
          id: classId,
          name: 'Vehiculo',
          position: { x: 100, y: 100 },
          classKind: 'class',
          isAbstract: false,
          attributes: [],
          methods: [],
        },
      ],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const model: SemanticDomainModel = {
      updates: {
        classes: [{ name: 'Vehiculo', isAbstract: true }],
        positions: [{ class: 'Vehiculo', x: 450, y: 300 }],
      },
    };

    const delta = expandSemanticDomainToDelta(model, existingDiagram.id, existingDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(existingDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.classes[0]!.isAbstract).toBe(true);
      expect(applied.value.classes[0]!.position).toEqual({ x: 450, y: 300 });
    }
  });

  it('synthesizes relationship updates and extended deletions', () => {
    const autoId = crypto.randomUUID();
    const vehiculoId = crypto.randomUUID();
    const motorId = crypto.randomUUID();
    const assocId = crypto.randomUUID();
    const genId = crypto.randomUUID();

    const existingDiagram: Diagram = {
      id: crypto.randomUUID(),
      name: 'Existing Canvas',
      classes: [
        { id: autoId, name: 'Auto', position: { x: 50, y: 50 }, classKind: 'class', isAbstract: false, attributes: [], methods: [] },
        { id: vehiculoId, name: 'Vehiculo', position: { x: 250, y: 50 }, classKind: 'class', isAbstract: true, attributes: [], methods: [] },
        { id: motorId, name: 'Motor', position: { x: 50, y: 250 }, classKind: 'class', isAbstract: false, attributes: [], methods: [] },
      ],
      associations: [
        {
          id: assocId,
          sourceClassId: autoId,
          targetClassId: motorId,
          sourceMultiplicity: '1',
          targetMultiplicity: '1',
          directed: false,
          aggregation: 'composite',
          aggregationEnd: 'source',
        },
      ],
      generalizations: [
        {
          id: genId,
          subClassId: autoId,
          superClassId: vehiculoId,
        },
      ],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const model: SemanticDomainModel = {
      updates: {
        generalizations: [{ subclass: 'Auto', superclass: 'Vehiculo', name: 'hereda_de' }],
      },
      deletions: {
        associations: [{ source: 'Auto', target: 'Motor' }],
      },
    };

    const delta = expandSemanticDomainToDelta(model, existingDiagram.id, existingDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(existingDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.value.associations).toHaveLength(0);
      expect(applied.value.generalizations[0]!.name).toBe('hereda_de');
    }
  });

  it('performs composite refactoring: create new class + rename existing class + delete class in a single batch', () => {
    const estId = crypto.randomUUID();
    const usrId = crypto.randomUUID();
    const existingDiagram: Diagram = {
      id: crypto.randomUUID(),
      name: 'Existing Canvas',
      classes: [
        { id: estId, name: 'Estudiante', position: { x: 100, y: 100 }, classKind: 'class', isAbstract: false, attributes: [], methods: [] },
        { id: usrId, name: 'Usuario', position: { x: 300, y: 100 }, classKind: 'class', isAbstract: false, attributes: [], methods: [] },
      ],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
      naryAssociations: [],
    };

    const model: SemanticDomainModel = {
      classes: [
        {
          name: 'Factura',
          attributes: [
            { name: 'numero', type: 'string' },
            { name: 'total', type: 'float' },
            { name: 'fecha', type: 'date' },
          ],
        },
      ],
      renames: {
        classes: [{ from: 'Estudiante', to: 'Alumno' }],
      },
      deletions: {
        classes: ['Usuario'],
      },
    };

    const delta = expandSemanticDomainToDelta(model, existingDiagram.id, existingDiagram);
    expect(delta).not.toBeNull();

    const applied = applyDelta(existingDiagram, delta!);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const classNames = applied.value.classes.map(c => c.name);
      expect(classNames).toContain('Alumno');
      expect(classNames).toContain('Factura');
      expect(classNames).not.toContain('Estudiante');
      expect(classNames).not.toContain('Usuario');

      const factura = applied.value.classes.find(c => c.name === 'Factura');
      expect(factura!.attributes).toHaveLength(3);
    }
  });

  it('extracts connection between two existing classes with explicit multiplicities', () => {
    const diag: any = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      classes: [
        { id: 'c_edit', name: 'Editorial', attributes: [] },
        { id: 'c_pub', name: 'Publicacion', attributes: [] },
      ],
      associations: [],
      generalizations: [],
      realizations: [],
      dependencies: [],
    };

    const mutation = extractExplicitModelMutations('conecta Editorial con Publicacion con asociacion 1 a 0..*', diag);
    expect(mutation).not.toBeNull();
    expect(mutation?.action).toBe('modify');
    expect(mutation?.associations).toBeDefined();
    expect(mutation?.associations?.[0]?.source).toBe('Editorial');
    expect(mutation?.associations?.[0]?.target).toBe('Publicacion');
    expect(mutation?.associations?.[0]?.sourceMultiplicity).toBe('1');
    expect(mutation?.associations?.[0]?.targetMultiplicity).toBe('0..*');

    const delta = expandSemanticDomainToDelta(mutation!, diag.id, diag);
    expect(delta).not.toBeNull();
    const assocDelta = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'create');
    expect(assocDelta).toBeDefined();
    expect((assocDelta as any).sourceClassId).toBe('c_edit');
    expect((assocDelta as any).targetClassId).toBe('c_pub');
    expect((assocDelta as any).sourceMultiplicity).toBe('1');
    expect((assocDelta as any).targetMultiplicity).toBe('0..*');
  });

  it('extracts method addition with parameters and return type deterministically', () => {
    const diag: any = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      classes: [
        { id: 'c_pub', name: 'Publicacion', attributes: [], methods: [] },
      ],
      associations: [],
    };

    const mutation = extractExplicitModelMutations(
      'a la clase Publicacion agregale el metodo calcularRegalias(porcentaje:float):float',
      diag
    );
    expect(mutation).not.toBeNull();
    expect(mutation?.action).toBe('modify');
    expect(mutation?.classes?.[0]?.name).toBe('Publicacion');
    expect(mutation?.classes?.[0]?.methods).toBeDefined();
    expect(mutation?.classes?.[0]?.methods?.[0]?.name).toBe('calcularRegalias');
    expect(mutation?.classes?.[0]?.methods?.[0]?.returnType).toBe('float');
    expect(mutation?.classes?.[0]?.methods?.[0]?.parameters).toEqual([
      { name: 'porcentaje', type: 'float' },
    ]);

    const delta = expandSemanticDomainToDelta(mutation!, diag.id, diag);
    expect(delta).not.toBeNull();
    const methodDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'addMethod');
    expect(methodDelta).toBeDefined();
    expect((methodDelta as any).classId).toBe('c_pub');
    expect((methodDelta as any).name).toBe('calcularRegalias');
    expect((methodDelta as any).returnType).toBe('float');
    expect((methodDelta as any).parameters).toEqual([
      { name: 'porcentaje', type: 'float' },
    ]);
  });

  it('extracts colloquial method without parentheses', () => {
    const diag: any = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      classes: [
        { id: 'c_pub', name: 'Publicacion', attributes: [], methods: [] },
      ],
      associations: [],
    };

    const mutation = extractExplicitModelMutations(
      'en Publicacion agrega el metodo calcularTotal que recibe x de tipo float y devuelve int',
      diag
    );
    expect(mutation).not.toBeNull();
    expect(mutation?.classes?.[0]?.name).toBe('Publicacion');
    expect(mutation?.classes?.[0]?.methods?.[0]?.name).toBe('calcularTotal');
    expect(mutation?.classes?.[0]?.methods?.[0]?.returnType).toBe('int');
    expect(mutation?.classes?.[0]?.methods?.[0]?.parameters).toEqual([
      { name: 'x', type: 'float' },
    ]);
  });

  it('deletes attribute from specified class without confusing other classes with matching attribute names', () => {
    const diag: any = {
      id: '01925b42-d690-7c28-9f12-9c98a3f80c65',
      classes: [
        {
          id: 'c_pub',
          name: 'Publicacion',
          attributes: [
            { id: 'a1', name: 'isbn' },
            { id: 'a2', name: 'autor' }, // attribute named "autor" in Publicacion!
          ],
        },
        {
          id: 'c_aut',
          name: 'Autor',
          attributes: [
            { id: 'a3', name: 'nombre' },
            { id: 'a4', name: 'nacionalidad' },
          ],
        },
      ],
      associations: [],
    };

    const mutation = extractExplicitModelMutations(
      'elimina el atributo nacionalidad en Autor',
      diag
    );
    expect(mutation).not.toBeNull();
    expect(mutation?.deletions?.attributes).toBeDefined();
    expect(mutation?.deletions?.attributes).toEqual([
      { class: 'Autor', attribute: 'nacionalidad' },
    ]);

    const delta = expandSemanticDomainToDelta(mutation!, diag.id, diag);
    expect(delta).not.toBeNull();
    const deleteDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'deleteAttribute');
    expect(deleteDelta).toBeDefined();
    expect((deleteDelta as any).classId).toBe('c_aut');
  });

  it('extracts class creation with typed attributes and associations deterministically', () => {
    const diag: any = {
      id: 'd_test',
      classes: [
        { id: 'c_pub', name: 'Publicacion', attributes: [], methods: [] },
      ],
      associations: [],
    };

    const mutation = extractExplicitModelMutations(
      'crea la clase Especialidad con matricula:string y activa:boolean',
      diag
    );
    expect(mutation).not.toBeNull();
    expect(mutation?.action).toBe('modify');
    expect(mutation?.classes).toHaveLength(1);
    expect(mutation?.classes?.[0]?.name).toBe('Especialidad');
    expect(mutation?.classes?.[0]?.attributes).toEqual([
      { name: 'matricula', type: 'string' },
      { name: 'activa', type: 'boolean' },
    ]);

    const delta = expandSemanticDomainToDelta(mutation!, diag.id, diag);
    expect(delta).not.toBeNull();
    const classDelta = delta!.deltas.find((d: any) => d.kind === 'class' && d.op === 'create');
    expect(classDelta).toBeDefined();
    expect((classDelta as any).name).toBe('Especialidad');

    const attrDeltas = delta!.deltas.filter((d: any) => d.kind === 'member' && d.op === 'addAttribute');
    expect(attrDeltas).toHaveLength(2);
    expect(attrDeltas[0]).toMatchObject({ name: 'matricula', type: 'string' });
    expect(attrDeltas[1]).toMatchObject({ name: 'activa', type: 'boolean' });
  });

  it('sanitizes type suffixes from LLM hallucinations (matriculastring -> matricula: string, activaboolean -> activa: boolean)', () => {
    const diag: any = {
      id: 'd_test',
      classes: [],
      associations: [],
    };

    const semanticModel: SemanticDomainModel = {
      action: 'modify',
      classes: [
        {
          name: 'Especialidad',
          attributes: [
            { name: 'matriculastring', type: 'string' },
            { name: 'activaboolean', type: 'string' },
            { name: 'fechadate', type: 'string' },
          ],
        },
      ],
    };

    const delta = expandSemanticDomainToDelta(semanticModel, diag.id, diag);
    expect(delta).not.toBeNull();
    const attrDeltas = delta!.deltas.filter((d: any) => d.kind === 'member' && d.op === 'addAttribute');
    expect(attrDeltas).toHaveLength(3);
    expect(attrDeltas[0]).toMatchObject({ name: 'matricula', type: 'string' });
    expect(attrDeltas[1]).toMatchObject({ name: 'activa', type: 'boolean' });
    expect(attrDeltas[2]).toMatchObject({ name: 'fecha', type: 'date' });
  });

  it('correctly parses inverted class-first attribute type change with typo (A la tabla alunmo cambiale el id tipo int a tipo float)', () => {
    const diag: any = {
      id: 'd_test',
      classes: [
        {
          id: 'c_alumno',
          name: 'Alumno',
          attributes: [{ id: 'a_id', name: 'id', type: 'int' }],
          methods: [],
        },
      ],
      associations: [],
    };

    const mutations = extractExplicitModelMutations('A la tabla alunmo cambiale el id tipo int a tipo float', diag);
    expect(mutations).not.toBeNull();
    expect(mutations?.updates?.attributes).toEqual([
      {
        class: 'Alumno',
        name: 'id',
        type: 'float',
      },
    ]);

    const delta = expandSemanticDomainToDelta(mutations!, diag.id, diag);
    expect(delta).not.toBeNull();
    const editDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'editAttribute');
    expect(editDelta).toBeDefined();
    expect((editDelta as any).type).toBe('float');
    expect((editDelta as any).name).toBe('id');
  });

  it('correctly parses inverted class-first attribute rename with typo (a la tabla materia cambiale el atribut id a id_materia)', () => {
    const diag: any = {
      id: 'd_test',
      classes: [
        {
          id: 'c_materia',
          name: 'Materia',
          attributes: [{ id: 'a_id', name: 'id', type: 'int' }],
          methods: [],
        },
      ],
      associations: [],
    };

    const mutations = extractExplicitModelMutations('a la tabla materia cambiale el atribut id a id_materia', diag);
    expect(mutations).not.toBeNull();
    expect(mutations?.renames?.attributes).toEqual([
      {
        class: 'Materia',
        from: 'id',
        to: 'id_materia',
      },
    ]);

    const delta = expandSemanticDomainToDelta(mutations!, diag.id, diag);
    expect(delta).not.toBeNull();
    const renameDelta = delta!.deltas.find((d: any) => d.kind === 'member' && d.op === 'editAttribute');
    expect(renameDelta).toBeDefined();
    expect((renameDelta as any).name).toBe('id_materia');
    expect((renameDelta as any).type).toBe('int');
  });

  describe('Suite de 15 pruebas: Mutación limpia de relaciones, inversión de rombos/flechas y tolerancia tipográfica', () => {
    const makeBaseDiagram = () => ({
      id: 'diag_suite',
      classes: [
        { id: 'c_materia', name: 'Materia', attributes: [], methods: [] },
        { id: 'c_asistencia', name: 'Asistencia', attributes: [], methods: [] },
        { id: 'c_alumno', name: 'Alumno', attributes: [], methods: [] },
        { id: 'c_persona', name: 'Persona', attributes: [], methods: [] },
        { id: 'c_factura', name: 'Factura', attributes: [], methods: [] },
        { id: 'c_detalle', name: 'Detalle', attributes: [], methods: [] },
        { id: 'c_cliente', name: 'Cliente', attributes: [], methods: [] },
        { id: 'c_servicio', name: 'Servicio', attributes: [], methods: [] },
        { id: 'c_contrato', name: 'Contrato', attributes: [], methods: [] },
        { id: 'c_pedido', name: 'Pedido', attributes: [], methods: [] },
        { id: 'c_producto', name: 'Producto', attributes: [], methods: [] },
        { id: 'c_usuario', name: 'Usuario', attributes: [], methods: [] },
        { id: 'c_perfil', name: 'Perfil', attributes: [], methods: [] },
        { id: 'c_curso', name: 'Curso', attributes: [], methods: [] },
        { id: 'c_profesor', name: 'Profesor', attributes: [], methods: [] },
        { id: 'c_order', name: 'Order', attributes: [], methods: [] },
        { id: 'c_item', name: 'Item', attributes: [], methods: [] },
        { id: 'c_customer', name: 'Customer', attributes: [], methods: [] },
        { id: 'c_invoice', name: 'Invoice', attributes: [], methods: [] },
      ],
      associations: [
        {
          id: 'a_mat_asis',
          sourceClassId: 'c_materia',
          targetClassId: 'c_asistencia',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'a_al_asis',
          sourceClassId: 'c_alumno',
          targetClassId: 'c_asistencia',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'a_fac_det',
          sourceClassId: 'c_factura',
          targetClassId: 'c_detalle',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
        {
          id: 'a_cli_fac',
          sourceClassId: 'c_cliente',
          targetClassId: 'c_factura',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'a_ser_con',
          sourceClassId: 'c_servicio',
          targetClassId: 'c_contrato',
          aggregation: 'none',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
        {
          id: 'a_ped_prod',
          sourceClassId: 'c_pedido',
          targetClassId: 'c_producto',
          aggregation: 'shared',
          aggregationEnd: 'source',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'a_ord_itm',
          sourceClassId: 'c_order',
          targetClassId: 'c_item',
          aggregation: 'composite',
          aggregationEnd: 'source',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'a_cus_inv',
          sourceClassId: 'c_customer',
          targetClassId: 'c_invoice',
          aggregation: 'composite',
          aggregationEnd: 'source',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
      ],
      generalizations: [
        {
          id: 'g_al_per',
          subClassId: 'c_alumno',
          superClassId: 'c_persona',
        },
      ],
      realizations: [],
      dependencies: [],
    });

    // 1. Reemplazo por composición sin ensuciar label con "una"
    it('1. cambia la relacion entre materia y asistencia por una composicion', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('cambia la relacion entre materia y asistencia por una composicion', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag, 'cambia la relacion entre materia y asistencia por una composicion');
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregation).toBe('composite');
      expect((update as any).name).toBeUndefined(); // no "una"
    });

    // 2. Reemplazo por generalización limpia (elimina asociación previa, no pone label "generalizacion")
    it('2. cambiame la relacion entre alumno y asistencia por una generalizacion', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('cambiame la relacion entre alumno y asistencia por una generalizacion', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const delAssoc = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'delete');
      const genCreate = delta!.deltas.find((d: any) => d.kind === 'generalization' && d.op === 'create');
      expect(delAssoc).toBeDefined();
      expect(genCreate).toBeDefined();
      expect((genCreate as any).subClassId).toBe('c_alumno');
      expect((genCreate as any).superClassId).toBe('c_asistencia');
    });

    // 3. Creación/asociación con typo en nombre de clase (asisetncia)
    it('3. asocia asisetncia y materia con una relacion de composicion', () => {
      const diag = makeBaseDiagram();
      // eliminar la asociacion previa para probar creacion
      diag.associations = [];
      const mut = extractExplicitModelMutations('asocia asisetncia y materia con una relacion de composicion', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag, 'asocia asisetncia y materia con una relacion de composicion');
      const createAssoc = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'create');
      expect(createAssoc).toBeDefined();
      expect((createAssoc as any).aggregation).toBe('composite');
      expect((createAssoc as any).name).toBeUndefined();
    });

    // 4. Inversión de rombo de composición
    it('4. inverti el nodo de relacion de composicion entre asistencia y materia', () => {
      const diag = makeBaseDiagram();
      diag.associations[0]!.aggregation = 'composite';
      diag.associations[0]!.aggregationEnd = 'source'; // materia tiene el rombo
      const mut = extractExplicitModelMutations('inverti el nodo de relacion de composicion entre asistencia y materia', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('target'); // invertido a target
    });

    // 5. Da vuelta el rombo (sinónimo coloquial)
    it('5. da vuelta el rombo entre Materia y Asistencia', () => {
      const diag = makeBaseDiagram();
      diag.associations[0]!.aggregation = 'composite';
      diag.associations[0]!.aggregationEnd = 'target';
      const mut = extractExplicitModelMutations('da vuelta el rombo entre Materia y Asistencia', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('source');
    });

    // 6. Cambiar de lado la composición
    it('6. cambia de lado la composicion entre Asistencia y Materia', () => {
      const diag = makeBaseDiagram();
      diag.associations[0]!.aggregation = 'composite';
      diag.associations[0]!.aggregationEnd = 'source';
      const mut = extractExplicitModelMutations('cambia de lado la composicion entre Asistencia y Materia', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('target');
    });

    // 7. Reemplazo de relación por agregación
    it('7. cambia la relacion entre Factura y Detalle por agregacion', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('cambia la relacion entre Factura y Detalle por agregacion', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregation).toBe('shared');
    });

    // 8. Reemplazo de relación por dependencia (borra asociación previa)
    it('8. remplaza la relacion de Cliente y Factura con dependencia', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('remplaza la relacion de Cliente y Factura con dependencia', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const del = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'delete');
      const dep = delta!.deltas.find((d: any) => d.kind === 'dependency' && d.op === 'create');
      expect(del).toBeDefined();
      expect(dep).toBeDefined();
    });

    // 9. Reemplazo por realización
    it('9. cambia la asociacion entre Servicio y Contrato por realizacion', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('cambia la asociacion entre Servicio y Contrato por realizacion', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const del = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'delete');
      const rel = delta!.deltas.find((d: any) => d.kind === 'realization' && d.op === 'create');
      expect(del).toBeDefined();
      expect(rel).toBeDefined();
    });

    // 10. Voltea rombo de agregación
    it('10. voltea el rombo de agregacion entre Pedido y Producto', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('voltea el rombo de agregacion entre Pedido y Producto', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('target');
    });

    // 11. Errores tipográficos fonéticos ("relasion", "composision")
    it('11. cambia la relasion entre Usuario y Perfil por una composision', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('cambia la relasion entre Usuario y Perfil por una composision', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag, 'cambia la relasion entre Usuario y Perfil por una composision');
      const create = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'create');
      expect(create).toBeDefined();
      expect((create as any).aggregation).toBe('composite');
      expect((create as any).name).toBeUndefined();
    });

    // 12. Inversión de generalización con error tipográfico ("generalizasion")
    it('12. inverti la generalizasion entre Alumno y Persona', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('inverti la generalizasion entre Alumno y Persona', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const delGen = delta!.deltas.find((d: any) => d.kind === 'generalization' && d.op === 'delete');
      const createGen = delta!.deltas.find((d: any) => d.kind === 'generalization' && d.op === 'create');
      expect(delGen).toBeDefined();
      expect(createGen).toBeDefined();
      expect((createGen as any).subClassId).toBe('c_persona');
      expect((createGen as any).superClassId).toBe('c_alumno');
    });

    // 13. Errores tipográficos "asosia", "agregasion"
    it('13. asosia con agregasion Curso y Profesor', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('asosia con agregasion Curso y Profesor', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const create = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'create');
      expect(create).toBeDefined();
      expect((create as any).aggregation).toBe('shared');
    });

    // 14. Inversión en inglés ("flip composition between Order and Item")
    it('14. flip composition between Order and Item', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('flip composition between Order and Item', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('target');
    });

    // 15. Inversión en inglés ("reverse the relationship between Customer and Invoice")
    it('15. reverse the relationship between Customer and Invoice', () => {
      const diag = makeBaseDiagram();
      const mut = extractExplicitModelMutations('reverse the relationship between Customer and Invoice', diag);
      expect(mut).not.toBeNull();
      const delta = expandSemanticDomainToDelta(mut!, diag.id, diag);
      const update = delta!.deltas.find((d: any) => d.kind === 'association' && d.op === 'updateMultiplicity');
      expect(update).toBeDefined();
      expect((update as any).aggregationEnd).toBe('target');
    });
  });
});


