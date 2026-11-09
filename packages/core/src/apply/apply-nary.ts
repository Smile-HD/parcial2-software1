import { type Diagram, NaryAssociationSchema } from '../ir.js';
import { type NaryAssociationDelta } from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import { findClass } from './cascade.js';

/**
 * Aplica un delta de asociación n-aria individual (invariantes de la unidad 13.1,
 * editor:R N-ary):
 * - create: al menos TRES extremos miembros; sin classId duplicado dentro de una
 *   misma asociación; cada clase miembro debe existir. Reside en su PROPIA
 *   colección `naryAssociations` — la ruta de asociaciones binarias nunca
 *   se altera (decisión de diseño D13).
 * - update (corrección A de la unidad 13d): la asociación debe existir; transporta
 *   un `name` opcional y/o un reemplazo opcional de `memberEnds`. Cuando se proveen
 *   memberEnds, se re-validan los MISMOS invariantes que en create (existencia,
 *   ≥3 extremos, sin duplicados) para que una edición nunca produzca una n-aria degenerada
 *   o colgante. Un nombre vacío la limpia (imita la semántica de etiquetas de aristas).
 * - delete: la asociación debe existir.
 */
export function applyNaryAssociationDelta(
  diagram: Diagram,
  delta: NaryAssociationDelta
): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.memberEnds || delta.memberEnds.length === 0) {
        return err({ kind: 'InvalidOperationError', reason: 'NaryAssociation create requires memberEnds' });
      }
      if (delta.memberEnds.length < 3) {
        return err({ kind: 'NaryAssociationMinEndsError', count: delta.memberEnds.length });
      }
      const seen = new Set<string>();
      for (const end of delta.memberEnds) {
        if (seen.has(end.classId)) {
          return err({ kind: 'DuplicateNaryMemberError', classId: end.classId });
        }
        seen.add(end.classId);
      }
      for (const end of delta.memberEnds) {
        if (!findClass(diagram, end.classId)) {
          return err({ kind: 'ClassNotFoundError', classId: end.classId });
        }
      }
      const newNary = NaryAssociationSchema.parse({
        id: delta.naryAssociationId,
        memberEnds: delta.memberEnds,
        name: delta.name,
      });
      return ok({ ...diagram, naryAssociations: [...(diagram.naryAssociations ?? []), newNary] });
    }

    case 'update': {
      if (delta.name === undefined && delta.memberEnds === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'NaryAssociation update requires name or memberEnds' });
      }
      const naryIndex = (diagram.naryAssociations ?? []).findIndex(n => n.id === delta.naryAssociationId);
      if (naryIndex === -1) {
        return err({ kind: 'NaryAssociationNotFoundError', naryAssociationId: delta.naryAssociationId });
      }
      const existing = (diagram.naryAssociations ?? [])[naryIndex]!;
      let memberEnds = existing.memberEnds;
      if (delta.memberEnds !== undefined) {
        if (delta.memberEnds.length < 3) {
          return err({ kind: 'NaryAssociationMinEndsError', count: delta.memberEnds.length });
        }
        const seen = new Set<string>();
        for (const end of delta.memberEnds) {
          if (seen.has(end.classId)) {
            return err({ kind: 'DuplicateNaryMemberError', classId: end.classId });
          }
          seen.add(end.classId);
        }
        for (const end of delta.memberEnds) {
          if (!findClass(diagram, end.classId)) {
            return err({ kind: 'ClassNotFoundError', classId: end.classId });
          }
        }
        memberEnds = delta.memberEnds;
      }
      const updatedNary = NaryAssociationSchema.parse({
        ...existing,
        memberEnds,
        ...(delta.name !== undefined ? { name: delta.name || undefined } : {}),
      });
      const updatedNaryAssociations = [...(diagram.naryAssociations ?? [])];
      updatedNaryAssociations[naryIndex] = updatedNary;
      return ok({ ...diagram, naryAssociations: updatedNaryAssociations });
    }

    case 'delete': {
      const naryIndex = (diagram.naryAssociations ?? []).findIndex(n => n.id === delta.naryAssociationId);
      if (naryIndex === -1) {
        return err({ kind: 'NaryAssociationNotFoundError', naryAssociationId: delta.naryAssociationId });
      }
      const updatedNaryAssociations = diagram.naryAssociations.filter(n => n.id !== delta.naryAssociationId);
      return ok({ ...diagram, naryAssociations: updatedNaryAssociations });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown naryAssociation op: ${_exhaustive}` });
    }
  }
}

