import { describe, it, expect } from 'vitest';
import { FakeLlm } from './index';
import { normalizeUmlUtterance, splitCompoundUtterance } from './normalizer';
import { Diagram, DeltaSchema } from '@app/core';

function makeBaseDiagram(): Diagram {
  const dId = crypto.randomUUID();
  const c1Id = crypto.randomUUID();
  const c2Id = crypto.randomUUID();
  return {
    id: dId,
    name: 'Compound Test Diagram',
    classes: [
      {
        id: c1Id,
        diagramId: dId,
        name: 'Factura',
        position: { x: 0, y: 0 },
        attributes: [
          { id: crypto.randomUUID(), name: 'total', type: 'float' },
          { id: crypto.randomUUID(), name: 'fecha', type: 'date' }
        ],
        methods: [
          { id: crypto.randomUUID(), name: 'calcularTotal', returnType: 'float', parameters: [] }
        ],
        isAbstract: false
      },
      {
        id: c2Id,
        diagramId: dId,
        name: 'Cliente',
        position: { x: 200, y: 0 },
        attributes: [
          { id: crypto.randomUUID(), name: 'nombre', type: 'string' }
        ],
        methods: [],
        isAbstract: false
      }
    ],
    associations: [],
    generalizations: [],
    realizations: [],
    dependencies: [],
    naryAssociations: []
  };
}

describe('20 Compound & Mixed Permutation Tests (C1-C20)', () => {
  const llm = new FakeLlm();

  // C1: Create + Update + Delete
  it('C1 [Create + Update + Delete]: crea clase Item con precio:float; cambia el tipo de total en Factura a decimal; borra el metodo calcularTotal en Factura', async () => {
    const text = 'crea clase Item con precio:float; cambia el tipo de total en Factura a decimal; borra el metodo calcularTotal en Factura';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      expect(res.value.kind).toBe('batch');
      const b = res.value as any;
      expect(b.deltas).toHaveLength(4); // create + addAttr precio + editAttribute + deleteMember
      expect(b.deltas[0].op).toBe('create'); // Item
      expect(b.deltas[1].op).toBe('addAttribute'); // precio:float
      expect(b.deltas[2].op).toBe('editAttribute'); // total -> decimal
      expect(b.deltas[3].op).toBe('deleteMethod'); // calcularTotal
    }
  });

  // C2: Delete + Create + Update
  it('C2 [Delete + Create + Update]: borra el atributo fecha en Factura; crea la clase Producto con codigo:string; renombra la clase Cliente a Comprador', async () => {
    const text = 'borra el atributo fecha en Factura; crea la clase Producto con codigo:string; renombra la clase Cliente a Comprador';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(4); // deleteAttribute + create + addAttr + rename
      expect(b.deltas[0].op).toBe('deleteAttribute');
      expect(b.deltas[1].op).toBe('create');
      expect(b.deltas[2].op).toBe('addAttribute');
      expect(b.deltas[3].op).toBe('rename');
    }
  });

  // C3: Update + Create + Delete
  it('C3 [Update + Create + Delete]: renombra el atributo nombre a razonSocial en Cliente; crea clase Auditoria; borra la clase Factura', async () => {
    const text = 'renombra el atributo nombre a razonSocial en Cliente; crea clase Auditoria; borra la clase Factura';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
      expect(b.deltas[0].op).toBe('editAttribute');
      expect(b.deltas[1].op).toBe('create');
      expect(b.deltas[2].op).toBe('delete');
    }
  });

  // C4: Create + Add Attribute + Add Method
  it('C4 [Create + Add Attr + Add Method]: crea clase Recibo con numero:string; agrega el atributo cai:string a Recibo; sumale a Recibo el metodo validar():boolean', async () => {
    const text = 'crea clase Recibo con numero:string; agrega el atributo cai:string a Recibo; sumale a Recibo el metodo validar():boolean';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(4); // create + addAttr numero + addAttr cai + addMethod validar
    }
  });

  // C5: Create Class + Create Association + Add Attributes
  it('C5 [Create + Connect + Add Attr]: crea clase Pago con monto:float; conecta Factura con Pago de 1 a 1; sumale a Cliente el campo email:string', async () => {
    const text = 'crea clase Pago con monto:float; conecta Factura con Pago de 1 a 1; sumale a Cliente el campo email:string';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    if (res.kind === 'refused') console.log('C5 REFUSED REASON:', res.reason);
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(4); // create Pago + attr monto + assoc Factura-Pago + attr email
    }
  });

  // C6: Rename Class + Add Multiple Attributes (el caso del usuario!)
  it('C6 [Rename Inverted + Multi Attr]: a la clase Factura cambiale de nombre a FacturaVenta; a la clase Factura agregale atributo id de tipo entero, nombre de tipo string y cuit de tipo string', async () => {
    const text = 'a la clase Factura cambiale de nombre a FacturaVenta; a la clase Factura agregale atributo id de tipo entero, nombre de tipo string y cuit de tipo string';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(4); // rename + 3 attributes
      expect(b.deltas[0].op).toBe('rename');
      expect(b.deltas[0].newName).toBe('FacturaVenta');
      expect(b.deltas[1].name).toBe('id');
      expect(b.deltas[2].name).toBe('nombre');
      expect(b.deltas[3].name).toBe('cuit');
    }
  });

  // C7: Delete Member + Add Member + Change Type
  it('C7 [Delete Attr + Add Attr + Change Type]: borra el atributo fecha en Factura; agregale a Factura el campo numero:int; cambia el tipo de total en Factura a double', async () => {
    const text = 'borra el atributo fecha en Factura; agregale a Factura el campo numero:int; cambia el tipo de total en Factura a double';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
    }
  });

  // C8: Create Interface + Implement Interface + Add Operation
  it('C8 [Interface + Realization + Method]: create interface Imprimible; Factura implementa Imprimible; anadile a Factura el metodo imprimir():void', async () => {
    const text = 'create interface Imprimible; Factura implementa Imprimible; anadile a Factura el metodo imprimir():void';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
      expect(b.deltas[0].classKind).toBe('interface');
      expect(b.deltas[1].kind).toBe('realization');
    }
  });

  // C9: Delete Association + Connect New Association
  it('C9 [Connect + Connect]: conecta Factura con Cliente de 1 a N; conecta Factura consigo misma', async () => {
    const text = 'conecta Factura con Cliente de 1 a N; conecta Factura consigo misma';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(2);
    }
  });

  // C10: Create Class + Make Abstract + Add Static Attribute
  it('C10 [Create + Make Abstract + Add Attr]: crea clase DocumentoBase; marca la clase DocumentoBase como abstracta; agregale a DocumentoBase el campo version:int', async () => {
    const text = 'crea clase DocumentoBase; marca la clase DocumentoBase como abstracta; agregale a DocumentoBase el campo version:int';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
    }
  });

  // C11: Add Attribute + Rename Attribute + Delete Attribute
  it('C11 [Add + Rename + Delete]: agregale a Cliente el campo telefono:string; renombra el atributo nombre a razonSocial en Cliente; borra el atributo fecha en Factura', async () => {
    const text = 'agregale a Cliente el campo telefono:string; renombra el atributo nombre a razonSocial en Cliente; borra el atributo fecha en Factura';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
    }
  });

  // C12: Create Association Class + Add Attribute to Association Class
  it('C12 [Assoc Class + Add Attr]: clase de asociacion Detalle entre Factura y Cliente; agregale a Detalle el atributo cantidad:int', async () => {
    const text = 'clase de asociacion Detalle entre Factura y Cliente; agregale a Detalle el atributo cantidad:int';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas.length).toBeGreaterThanOrEqual(2);
    }
  });

  // C13: Delete Class + Create Replacement Class
  it('C13 [Delete + Create]: borra la clase Cliente; crea la clase PersonaJuridica con cuit:string', async () => {
    const text = 'borra la clase Cliente; crea la clase PersonaJuridica con cuit:string';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
      expect(b.deltas[0].op).toBe('delete');
      expect(b.deltas[1].op).toBe('create');
      expect(b.deltas[2].op).toBe('addAttribute');
    }
  });

  // C14: Run-on sentence with ", y agregale" without semicolon
  it('C14 [Run-on comma-and Add]: crea la clase Tarjeta con numero:string, y agregale el campo banco:string a Tarjeta', async () => {
    const text = 'crea la clase Tarjeta con numero:string, y agregale el campo banco:string a Tarjeta';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
    }
  });

  // C15: Run-on sentence with ", y cambiale" without semicolon
  it('C15 [Run-on comma-and Change]: agregale a Factura el campo estado:string, y cambiale el tipo de total en Factura a decimal', async () => {
    const text = 'agregale a Factura el campo estado:string, y cambiale el tipo de total en Factura a decimal';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(2);
    }
  });

  // C16: Run-on sentence with ", y borra" without semicolon
  it('C16 [Run-on comma-and Delete]: agregale a Cliente el campo direccion:string, y borra el atributo fecha en Factura', async () => {
    const text = 'agregale a Cliente el campo direccion:string, y borra el atributo fecha en Factura';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(2);
    }
  });

  // C17: Batch with 4 operations: Create + Add Attr + Link + Rename
  it('C17 [4 Operations]: crea clase Proveedor con rubro:string; agregale a Proveedor el campo email:string; conecta Proveedor con Factura de 1 a N; renombra la clase Cliente a Destinatario', async () => {
    const text = 'crea clase Proveedor con rubro:string; agregale a Proveedor el campo email:string; conecta Proveedor con Factura de 1 a N; renombra la clase Cliente a Destinatario';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(5);
    }
  });

  // C18: Batch with 5 operations: 2 creates, 1 connect, 2 adds
  it('C18 [5 Operations]: crea clase NotaCredito; crea clase Remito; conecta Factura con Remito de 1 a 1; sumale a NotaCredito el campo motivo:string; sumale a Remito el campo bultos:int', async () => {
    const text = 'crea clase NotaCredito; crea clase Remito; conecta Factura con Remito de 1 a 1; sumale a NotaCredito el campo motivo:string; sumale a Remito el campo bultos:int';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(5);
    }
  });

  // C19: Update Type + Rename Member + Delete Member in same class
  it('C19 [Update Type + Rename Member + Delete Member]: cambia el tipo de total en Factura a decimal; renombra el atributo fecha a emisionFecha en Factura; borra el metodo calcularTotal en Factura', async () => {
    const text = 'cambia el tipo de total en Factura a decimal; renombra el atributo fecha a emisionFecha en Factura; borra el metodo calcularTotal en Factura';
    const res = await llm.interpret(text, {}, makeBaseDiagram());
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(3);
    }
  });

  // C20: Create Ternary + Add attributes
  it('C20 [Ternary + Mutate]: asociacion ternaria entre Factura, Cliente y Proveedor; agregale a Factura el atributo pagada:boolean', async () => {
    const diag = makeBaseDiagram();
    // add Proveedor to diagram
    diag.classes.push({
      id: crypto.randomUUID(),
      diagramId: diag.id,
      name: 'Proveedor',
      position: { x: 400, y: 0 },
      attributes: [],
      methods: [],
      isAbstract: false
    });
    const text = 'asociacion ternaria entre Factura, Cliente y Proveedor; agregale a Factura el atributo pagada:boolean';
    const res = await llm.interpret(text, {}, diag);
    expect(res.kind).toBe('delta');
    if (res.kind === 'delta') {
      const b = res.value as any;
      expect(b.deltas).toHaveLength(2);
      expect(b.deltas[0].kind).toBe('naryAssociation');
      expect(b.deltas[1].kind).toBe('member');
    }
  });

  // User exact screenshot test:
  it('User exact screenshot prompt', async () => {
    const dId = crypto.randomUUID();
    const c1Id = crypto.randomUUID();
    const c2Id = crypto.randomUUID();
    const c3Id = crypto.randomUUID();
    const diag: Diagram = {
      id: dId,
      name: 'User Diagram',
      classes: [
        { id: c1Id, diagramId: dId, name: 'Profesor', position: { x: 0, y: 0 }, attributes: [{ id: crypto.randomUUID(), name: 'nombre', type: 'string' }], methods: [], isAbstract: false },
        { id: c2Id, diagramId: dId, name: 'Materia', position: { x: 200, y: 0 }, attributes: [], methods: [], isAbstract: false },
        { id: c3Id, diagramId: dId, name: 'ProfesorMateria', position: { x: 100, y: 200 }, attributes: [], methods: [], isAbstract: false }
      ],
      associations: [
        { id: crypto.randomUUID(), diagramId: dId, sourceClassId: c1Id, targetClassId: c2Id, sourceMultiplicity: '1', targetMultiplicity: '1', isComposition: false, isAggregation: false, directed: false }
      ],
      generalizations: [], realizations: [], dependencies: [], naryAssociations: []
    };

    const text1 = 'a la clase profesormateria cambiale de nombre a clase; agregale atributo id de tipo entero, nombre de tipo string y profesor de tipo string';
    const res1 = await llm.interpret(text1, {}, diag);
    expect(res1.kind).toBe('delta');
    if (res1.kind === 'delta') {
      expect(res1.value.kind).toBe('batch');
      const b = res1.value as any;
      expect(b.deltas).toHaveLength(4);
      expect(b.deltas[0].op).toBe('rename');
      expect(b.deltas[0].newName).toBe('clase');
    }

    const text2 = 'cambia la multiplicidad entre materia y profesor a muchos a muchos, ya la clase profesormateria cambiale de nombre a clases, y agregale el atributo de nombre de tipo string y profesor de tipo string';
    const res2 = await llm.interpret(text2, {}, diag);
    expect(res2.kind).toBe('delta');
    if (res2.kind === 'delta') {
      expect(res2.value.kind).toBe('batch');
      const b = res2.value as any;
      expect(b.deltas).toHaveLength(4);
      expect(b.deltas[0].op).toBe('updateMultiplicity');
      expect(b.deltas[0].newSourceMultiplicity).toBe('0..*');
      expect(b.deltas[0].newTargetMultiplicity).toBe('0..*');
      expect(b.deltas[1].op).toBe('rename');
      expect(b.deltas[1].newName).toBe('clases');
      expect(b.deltas[2].op).toBe('addAttribute');
      expect(b.deltas[2].name).toBe('nombre');
      expect(b.deltas[2].type).toBe('string');
      expect(b.deltas[3].op).toBe('addAttribute');
      expect(b.deltas[3].name).toBe('profesor');
      expect(b.deltas[3].type).toBe('string');
    }

    // Association name tests:
    const text3 = 'cambia el nombre de la relacion entre Materia y Profesor a dicta';
    const res3 = await llm.interpret(text3, {}, diag);
    expect(res3.kind).toBe('delta');
    if (res3.kind === 'delta') {
      const d = res3.value as any;
      expect(d.kind).toBe('association');
      expect(d.op).toBe('updateMultiplicity');
      expect(d.name).toBe('dicta');
    }

    const text4 = 'cambia la multiplicidad entre materia y profesor a 1 a N con nombre dicta';
    const res4 = await llm.interpret(text4, {}, diag);
    expect(res4.kind).toBe('delta');
    if (res4.kind === 'delta') {
      const d = res4.value as any;
      expect(d.kind).toBe('association');
      expect(d.op).toBe('updateMultiplicity');
      // En diag, source es Profesor y target es Materia. Como el usuario dijo "materia (1) y profesor (N)":
      expect(d.newSourceMultiplicity).toBe('0..*'); // Profesor
      expect(d.newTargetMultiplicity).toBe('1');    // Materia
      expect(d.name).toBe('dicta');
    }

    const text5 = 'conecta Materia con Profesor llamada dicta de 1 a N';
    const res5 = await llm.interpret(text5, {}, diag);
    expect(res5.kind).toBe('delta');
    if (res5.kind === 'delta') {
      const d = res5.value as any;
      expect(d.kind).toBe('association');
      expect(d.op).toBe('create');
      expect(d.name).toBe('dicta');
      expect(d.sourceMultiplicity).toBe('1');
      expect(d.targetMultiplicity).toBe('0..*');
    }
  });
});
