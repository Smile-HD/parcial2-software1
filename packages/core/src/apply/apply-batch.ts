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

/**
 * Aplica un delta por lotes (batch) de forma atómica (todo o nada).
 * Valida primero todos los deltas y luego los aplica secuencialmente sobre un estado clonado.
 * Si algún delta falla, se retorna el estado original sin modificaciones.
 */
export function applyBatchDelta(diagram: Diagram, batchDelta: BatchDelta): ApplyResult<Diagram> {
  // Primero valida todos los deltas en el lote contra el estado original.
  // Esto asegura atomicidad: no aplicamos cambios parciales.
  let workingDiagram = cloneDiagram(diagram);

  for (let i = 0; i < batchDelta.deltas.length; i++) {
    const delta = batchDelta.deltas[i];
    let result: ApplyResult<Diagram>;

    switch (delta.kind) {
      case 'class':
        result = applyClassDelta(workingDiagram, delta);
        break;
      case 'member':
        result = applyMemberDelta(workingDiagram, delta);
        break;
      case 'association':
        result = applyAssociationDelta(workingDiagram, delta);
        break;
      case 'generalization':
        result = applyGeneralizationDelta(workingDiagram, delta);
        break;
      case 'realization':
        result = applyRealizationDelta(workingDiagram, delta);
        break;
      case 'dependency':
        result = applyDependencyDelta(workingDiagram, delta);
        break;
      case 'naryAssociation':
        result = applyNaryAssociationDelta(workingDiagram, delta);
        break;
      default: {
        const _exhaustive: never = delta.kind;
        result = err({ kind: 'InvalidOperationError', reason: `Unknown delta kind: ${_exhaustive}` });
      }
    }

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

      // Envuelve el error con el contexto del lote (batch)
      return err({ kind: 'BatchError', error: result.error, failedDeltaIndex: i });
    }

    workingDiagram = result.value;
  }

  return ok(workingDiagram);
}
