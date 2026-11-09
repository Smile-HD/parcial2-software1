import { type Diagram } from '../ir.js';
import { type BatchDelta } from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import { cloneDiagram } from './cascade.js';
import { applyClassDelta } from './apply-class.js';
import { applyMemberDelta } from './apply-member.js';
import { applyAssociationDelta } from './apply-association.js';
import {
  applyGeneralizationDelta,
  applyRealizationDelta,
  applyDependencyDelta,
} from './apply-hierarchy.js';
import { applyNaryAssociationDelta } from './apply-nary.js';

function applySingleDelta(
  diagram: Diagram,
  delta: BatchDelta['deltas'][number]
): ApplyResult<Diagram> {
  switch (delta.kind) {
    case 'class':
      return applyClassDelta(diagram, delta);
    case 'member':
      return applyMemberDelta(diagram, delta);
    case 'association':
      return applyAssociationDelta(diagram, delta);
    case 'generalization':
      return applyGeneralizationDelta(diagram, delta);
    case 'realization':
      return applyRealizationDelta(diagram, delta);
    case 'dependency':
      return applyDependencyDelta(diagram, delta);
    case 'naryAssociation':
      return applyNaryAssociationDelta(diagram, delta);
    default: {
      const _exhaustive: never = delta;
      return err({
        kind: 'InvalidOperationError',
        reason: `Unknown delta kind: ${(_exhaustive as any)?.kind}`,
      });
    }
  }
}

/**
 * Aplica un delta por lotes (batch) de forma atómica (todo o nada).
 * Valida primero todos los deltas y luego los aplica secuencialmente sobre un estado clonado.
 * Si algún delta falla, se retorna el estado original sin modificaciones.
 */
export function applyBatchDelta(diagram: Diagram, batchDelta: BatchDelta): ApplyResult<Diagram> {
  let workingDiagram = cloneDiagram(diagram);

  for (let i = 0; i < batchDelta.deltas.length; i++) {
    const delta = batchDelta.deltas[i];
    if (!delta) continue;

    const result = applySingleDelta(workingDiagram, delta);

    if (!result.ok) {
      // Si una operación 'delete' de relación o elemento falla con NotFoundError porque
      // ya fue eliminado en cascada por un borrado anterior dentro del mismo lote (batch),
      // se tolera como éxito idempotente.
      const isDeleteOp =
        delta.op === 'delete' || delta.op === 'deleteAttribute' || delta.op === 'deleteMethod';
      const isNotFoundError =
        result.error.kind === 'NaryAssociationNotFoundError' ||
        result.error.kind === 'AssociationNotFoundError' ||
        result.error.kind === 'GeneralizationNotFoundError' ||
        result.error.kind === 'RealizationNotFoundError' ||
        result.error.kind === 'DependencyNotFoundError' ||
        result.error.kind === 'ClassNotFoundError' ||
        result.error.kind === 'MemberNotFoundError';

      if (isDeleteOp && isNotFoundError) {
        continue;
      }

      return err({ kind: 'BatchError', error: result.error, failedDeltaIndex: i });
    }

    workingDiagram = result.value;
  }

  return ok(workingDiagram);
}
