import { type Diagram, DiagramSchema } from '../ir.js';
import { type Delta, DeltaSchema } from '../delta.js';
import { type ApplyResult, type ApplyError, err, isApplyError } from './types.js';
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
import { applyBatchDelta } from './apply-batch.js';

export { type ApplyResult, type ApplyError, isApplyError };
export { applyClassDelta } from './apply-class.js';
export { applyMemberDelta } from './apply-member.js';
export { applyAssociationDelta } from './apply-association.js';
export {
  applyGeneralizationDelta,
  applyRealizationDelta,
  applyDependencyDelta,
} from './apply-hierarchy.js';
export { applyNaryAssociationDelta } from './apply-nary.js';
export { applyBatchDelta } from './apply-batch.js';

/**
 * Función pura que aplica un delta al estado de un diagrama.
 *
 * @param state - El estado actual del diagrama (nunca mutado)
 * @param delta - El delta a aplicar
 * @returns Un nuevo estado del diagrama en caso de éxito, o un error si el delta es inválido
 *
 * Invariantes:
 * - NUNCA muta el estado de entrada
 * - Retorna un NUEVO estado en caso de éxito (estilo inmutable)
 * - Rechaza operaciones inválidas con errores tipados (unión discriminada)
 * - Semántica atómica de lotes: un delta inválido ⇒ no se aplica nada
 * - Se rechazan nombres de clase duplicados (editor:R1)
 * - Eliminar una clase se propaga en cascada a sus asociaciones (editor:R2)
 */
export function applyDelta(state: Diagram, delta: Delta): ApplyResult<Diagram> {
  // Valida el estado de entrada
  const validatedState = DiagramSchema.parse(state);
  // Valida el delta
  const validatedDelta = DeltaSchema.parse(delta);

  // Asegura que los IDs de diagrama coincidan
  if (validatedDelta.diagramId !== validatedState.id) {
    return err({ kind: 'InvalidOperationError', reason: 'Delta diagramId does not match state diagramId' });
  }

  // Clona el estado para garantizar inmutabilidad
  const clonedState = cloneDiagram(validatedState);

  switch (validatedDelta.kind) {
    case 'class':
      return applyClassDelta(clonedState, validatedDelta);
    case 'member':
      return applyMemberDelta(clonedState, validatedDelta);
    case 'association':
      return applyAssociationDelta(clonedState, validatedDelta);
    case 'generalization':
      return applyGeneralizationDelta(clonedState, validatedDelta);
    case 'realization':
      return applyRealizationDelta(clonedState, validatedDelta);
    case 'dependency':
      return applyDependencyDelta(clonedState, validatedDelta);
    case 'naryAssociation':
      return applyNaryAssociationDelta(clonedState, validatedDelta);
    case 'batch':
      return applyBatchDelta(clonedState, validatedDelta);
    default: {
      const _exhaustive: never = validatedDelta as never;
      return err({ kind: 'InvalidOperationError', reason: `Unknown delta kind: ${(_exhaustive as any)?.kind}` });
    }
  }
}

