import type * as Y from 'yjs';
import type { ClassDelta } from '@app/core';
import { applyDeltaToYDoc } from '../applyDeltaToYDoc';
import type { PaletteNodeKind } from '../Palette';

/**
 * editor:R2 — fin de arrastre: emite un delta de reposicionamiento; el Y.Doc permanece como la fuente de verdad.
 */
export function handleNodeDragStop(
  doc: Y.Doc,
  diagramId: string,
  node: { id: string; position: { x: number; y: number } },
  origin: unknown = null,
): void {
  const delta: ClassDelta = {
    kind: 'class',
    op: 'reposition',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    classId: node.id,
    newPosition: node.position,
  };
  applyDeltaToYDoc(doc, delta, origin);
}

/**
 * Primer auto-nombre libre: Class1, Class2, ... (o Interface1, ... con un
 * prefijo personalizado) omitiendo cualquier nombre existente.
 */
export function nextFreeClassName(existing: readonly string[], prefix = 'Class'): string {
  let n = 1;
  while (existing.includes(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
}

/**
 * Modifica el modificador de clase abstracta emitiendo un delta `update`.
 */
export function handleSetAbstract(
  doc: Y.Doc,
  diagramId: string,
  classId: string,
  isAbstract: boolean,
): void {
  const delta: ClassDelta = {
    kind: 'class',
    op: 'update',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    classId,
    isAbstract,
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * unidad 13b (editor:R CRUD de Elemento Clase / Interfaces) — soltar de la paleta:
 * crea un nodo de clase/interfaz en la posición del lienzo donde se soltó el
 * elemento.
 */
export function handlePaletteDrop(
  doc: Y.Doc,
  diagramId: string,
  input: { kind: PaletteNodeKind; position: { x: number; y: number }; existingNames: readonly string[] },
): string {
  const prefix = input.kind === 'interface' ? 'Interface' : 'Class';
  const name = nextFreeClassName(input.existingNames, prefix);
  const classId = crypto.randomUUID();
  const delta: ClassDelta = {
    kind: 'class',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    classId,
    name,
    position: input.position,
    ...(input.kind === 'interface' ? { classKind: 'interface' as const } : {}),
  };
  applyDeltaToYDoc(doc, delta);
  return classId;
}
