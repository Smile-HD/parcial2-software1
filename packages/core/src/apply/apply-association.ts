import { type Diagram, AssociationSchema } from '../ir.js';
import { type AssociationDelta } from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import { findClass } from './cascade.js';

/**
 * Aplica un único delta de asociación.
 */
export function applyAssociationDelta(diagram: Diagram, delta: AssociationDelta): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.sourceClassId || !delta.targetClassId || delta.directed === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Association create requires sourceClassId, targetClassId, and directed' });
      }
      if (!findClass(diagram, delta.sourceClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.sourceClassId });
      }
      if (!findClass(diagram, delta.targetClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.targetClassId });
      }
      const newAssociation = AssociationSchema.parse({
        id: delta.associationId,
        sourceClassId: delta.sourceClassId,
        targetClassId: delta.targetClassId,
        sourceMultiplicity: delta.sourceMultiplicity,
        targetMultiplicity: delta.targetMultiplicity,
        directed: delta.directed,
        aggregation: delta.aggregation,
        aggregationEnd: delta.aggregationEnd,
        name: delta.name,
        sourceRole: delta.sourceRole,
        targetRole: delta.targetRole,
        associationClassId: delta.associationClassId,
      });
      return ok({ ...diagram, associations: [...diagram.associations, newAssociation] });
    }

    case 'updateMultiplicity': {
      if (
        delta.newSourceMultiplicity === undefined &&
        delta.newTargetMultiplicity === undefined &&
        delta.aggregation === undefined &&
        delta.aggregationEnd === undefined &&
        delta.name === undefined &&
        delta.sourceRole === undefined &&
        delta.targetRole === undefined &&
        delta.associationClassId === undefined &&
        delta.newAssociationClassId === undefined
      ) {
        return err({ kind: 'InvalidOperationError', reason: 'Update requires at least one new multiplicity or meta field' });
      }
      const assocIndex = diagram.associations.findIndex(a => a.id === delta.associationId);
      if (assocIndex === -1) {
        return err({ kind: 'AssociationNotFoundError', associationId: delta.associationId });
      }
      const updatedAssociations = [...diagram.associations];
      const updatedAssoc = {
        ...updatedAssociations[assocIndex],
        ...(delta.newSourceMultiplicity !== undefined ? { sourceMultiplicity: delta.newSourceMultiplicity ?? undefined } : {}),
        ...(delta.newTargetMultiplicity !== undefined ? { targetMultiplicity: delta.newTargetMultiplicity ?? undefined } : {}),
        ...(delta.aggregation !== undefined ? { aggregation: delta.aggregation } : {}),
        ...(delta.aggregationEnd !== undefined ? { aggregationEnd: delta.aggregationEnd } : {}),
        ...(delta.name !== undefined ? { name: delta.name || undefined } : {}),
        ...(delta.sourceRole !== undefined ? { sourceRole: delta.sourceRole || undefined } : {}),
        ...(delta.targetRole !== undefined ? { targetRole: delta.targetRole || undefined } : {}),
        ...(delta.associationClassId !== undefined ? { associationClassId: delta.associationClassId || undefined } : {}),
        ...(delta.newAssociationClassId !== undefined ? { associationClassId: delta.newAssociationClassId ?? undefined } : {}),
      };
      if (delta.newAssociationClassId === null || delta.associationClassId === null) {
        delete updatedAssoc.associationClassId;
      }
      updatedAssociations[assocIndex] = updatedAssoc;
      return ok({ ...diagram, associations: updatedAssociations });
    }

    case 'delete': {
      const assocIndex = diagram.associations.findIndex(a => a.id === delta.associationId);
      if (assocIndex === -1) {
        return err({ kind: 'AssociationNotFoundError', associationId: delta.associationId });
      }
      const updatedAssociations = diagram.associations.filter(a => a.id !== delta.associationId);
      return ok({ ...diagram, associations: updatedAssociations });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown association op: ${_exhaustive}` });
    }
  }
}
