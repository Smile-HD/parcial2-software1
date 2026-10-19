import type { BatchDelta } from '@app/core';

export function synthesizeDomainTemplate(text: string, diagramId: string): BatchDelta | null {
  const lower = text.toLowerCase();
  const timestamp = new Date().toISOString();

  // Ecommerce / Tienda / Ventas / Pedidos
  if (/\b(ecom|tienda|comercio|ventas?|pedidos?|store|shop)\b/i.test(lower)) {
    const prodId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();
    const pedidoId = crypto.randomUUID();
    const itemId = crypto.randomUUID();

    const deltas: any[] = [
      // Clases
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'class',
        op: 'create',
        classId: prodId,
        name: 'Producto',
        position: { x: 80, y: 80 },
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'class',
        op: 'create',
        classId: clienteId,
        name: 'Cliente',
        position: { x: 500, y: 80 },
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'class',
        op: 'create',
        classId: pedidoId,
        name: 'Pedido',
        position: { x: 500, y: 380 },
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'class',
        op: 'create',
        classId: itemId,
        name: 'ItemPedido',
        position: { x: 80, y: 380 },
      },
      // Atributos Producto
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: prodId,
        memberId: crypto.randomUUID(),
        name: 'id',
        type: 'int',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: prodId,
        memberId: crypto.randomUUID(),
        name: 'nombre',
        type: 'string',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: prodId,
        memberId: crypto.randomUUID(),
        name: 'precio',
        type: 'float',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: prodId,
        memberId: crypto.randomUUID(),
        name: 'stock',
        type: 'int',
      },
      // Atributos Cliente
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: clienteId,
        memberId: crypto.randomUUID(),
        name: 'id',
        type: 'int',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: clienteId,
        memberId: crypto.randomUUID(),
        name: 'nombre',
        type: 'string',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: clienteId,
        memberId: crypto.randomUUID(),
        name: 'email',
        type: 'string',
      },
      // Atributos Pedido
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: pedidoId,
        memberId: crypto.randomUUID(),
        name: 'id',
        type: 'int',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: pedidoId,
        memberId: crypto.randomUUID(),
        name: 'fecha',
        type: 'string',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: pedidoId,
        memberId: crypto.randomUUID(),
        name: 'total',
        type: 'float',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: pedidoId,
        memberId: crypto.randomUUID(),
        name: 'estado',
        type: 'string',
      },
      // Atributos ItemPedido
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: itemId,
        memberId: crypto.randomUUID(),
        name: 'id',
        type: 'int',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: itemId,
        memberId: crypto.randomUUID(),
        name: 'cantidad',
        type: 'int',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'member',
        op: 'addAttribute',
        classId: itemId,
        memberId: crypto.randomUUID(),
        name: 'precioUnitario',
        type: 'float',
      },
      // Relaciones
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: clienteId,
        targetClassId: pedidoId,
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: pedidoId,
        targetClassId: itemId,
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
        aggregation: 'composite',
        aggregationEnd: 'source',
      },
      {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: itemId,
        targetClassId: prodId,
        sourceMultiplicity: '*',
        targetMultiplicity: '1',
      },
    ];

    return {
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'batch',
      deltas,
    };
  }

  // Biblioteca / Libros
  if (/\b(biblioteca|libros?|prestamos?|library)\b/i.test(lower)) {
    const libroId = crypto.randomUUID();
    const autorId = crypto.randomUUID();
    const usuarioId = crypto.randomUUID();
    const prestamoId = crypto.randomUUID();

    const deltas: any[] = [
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'class', op: 'create', classId: libroId, name: 'Libro', position: { x: 80, y: 80 } },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'class', op: 'create', classId: autorId, name: 'Autor', position: { x: 80, y: 380 } },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'class', op: 'create', classId: usuarioId, name: 'Usuario', position: { x: 500, y: 80 } },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'class', op: 'create', classId: prestamoId, name: 'Prestamo', position: { x: 500, y: 380 } },
      // Atributos
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: libroId, memberId: crypto.randomUUID(), name: 'id', type: 'int' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: libroId, memberId: crypto.randomUUID(), name: 'titulo', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: libroId, memberId: crypto.randomUUID(), name: 'isbn', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: autorId, memberId: crypto.randomUUID(), name: 'id', type: 'int' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: autorId, memberId: crypto.randomUUID(), name: 'nombre', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: usuarioId, memberId: crypto.randomUUID(), name: 'id', type: 'int' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: usuarioId, memberId: crypto.randomUUID(), name: 'nombre', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: usuarioId, memberId: crypto.randomUUID(), name: 'email', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: prestamoId, memberId: crypto.randomUUID(), name: 'id', type: 'int' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: prestamoId, memberId: crypto.randomUUID(), name: 'fechaInicio', type: 'string' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'member', op: 'addAttribute', classId: prestamoId, memberId: crypto.randomUUID(), name: 'fechaFin', type: 'string' },
      // Asociaciones
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'association', op: 'create', associationId: crypto.randomUUID(), sourceClassId: autorId, targetClassId: libroId, sourceMultiplicity: '1..*', targetMultiplicity: '1..*' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'association', op: 'create', associationId: crypto.randomUUID(), sourceClassId: usuarioId, targetClassId: prestamoId, sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { id: crypto.randomUUID(), diagramId, timestamp, kind: 'association', op: 'create', associationId: crypto.randomUUID(), sourceClassId: prestamoId, targetClassId: libroId, sourceMultiplicity: '*', targetMultiplicity: '1' },
    ];

    return {
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'batch',
      deltas,
    };
  }

  return null;
}
