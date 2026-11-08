import type * as Y from 'yjs';
import { MultiplicitySchema, type NaryAssociationDelta, type NaryMemberEnd } from '@app/core';
import { applyDeltaToYDoc } from '../applyDeltaToYDoc';

/**
 * editor:R N-aria (unidad 13.2) — centroide de las posiciones de las clases miembros.
 * El nodo diamante se posiciona aquí y se vuelve a derivar en cada proyección.
 */
export function computeNaryCentroid(
  positions: readonly { x: number; y: number }[],
): { x: number; y: number } {
  if (positions.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = positions.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / positions.length, y: sum.y / positions.length };
}

/** Un extremo miembro según se ingresa en la UI del editor n-ario. */
export interface NaryMemberEndInput {
  classId: string;
  multiplicity: string;
  role?: string;
}

/**
 * editor:R N-aria (unidad 13.2/13.3) — emite un delta `create` de naryAssociation.
 */
export function handleCreateNaryAssociation(
  doc: Y.Doc,
  diagramId: string,
  input: { memberEnds: NaryMemberEndInput[]; name?: string },
): void {
  if (input.memberEnds.length < 3) {
    return;
  }
  const memberEnds: NaryMemberEnd[] = [];
  for (const end of input.memberEnds) {
    if (end.classId === '') {
      return;
    }
    const parsed = MultiplicitySchema.safeParse(end.multiplicity);
    if (!parsed.success) {
      return;
    }
    memberEnds.push({
      classId: end.classId,
      multiplicity: parsed.data,
      ...(end.role !== undefined && end.role !== '' ? { role: end.role } : {}),
    });
  }
  const delta: NaryAssociationDelta = {
    kind: 'naryAssociation',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    naryAssociationId: crypto.randomUUID(),
    memberEnds,
    ...(input.name !== undefined && input.name !== '' ? { name: input.name } : {}),
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R N-aria (unidad 13d corrección A) — emite un delta `update` de naryAssociation.
 */
export function handleUpdateNaryAssociation(
  doc: Y.Doc,
  diagramId: string,
  naryAssociationId: string,
  updates: { name?: string; memberEnds?: NaryMemberEndInput[] },
): void {
  if (updates.name === undefined && updates.memberEnds === undefined) {
    return;
  }
  const delta: NaryAssociationDelta = {
    kind: 'naryAssociation',
    op: 'update',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    naryAssociationId,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
  };
  if (updates.memberEnds !== undefined) {
    if (updates.memberEnds.length < 3) {
      return;
    }
    const memberEnds: NaryMemberEnd[] = [];
    for (const end of updates.memberEnds) {
      if (end.classId === '') {
        return;
      }
      const parsed = MultiplicitySchema.safeParse(end.multiplicity);
      if (!parsed.success) {
        return;
      }
      memberEnds.push({
        classId: end.classId,
        multiplicity: parsed.data,
        ...(end.role !== undefined && end.role !== '' ? { role: end.role } : {}),
      });
    }
    delta.memberEnds = memberEnds;
  }
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R N-aria (unidad 13.3) — emite un delta `delete` de naryAssociation.
 */
export function handleDeleteNaryAssociation(
  doc: Y.Doc,
  diagramId: string,
  naryAssociationId: string,
): void {
  const delta: NaryAssociationDelta = {
    kind: 'naryAssociation',
    op: 'delete',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    naryAssociationId,
  };
  applyDeltaToYDoc(doc, delta);
}
