/**
 * Resolutor de mutaciones deterministas directas sobre el metamodelo UML.
 */
import {
  extractExplicitModelMutations,
  expandSemanticDomainToDelta,
} from '../../synthesis/index.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export function tryExplicitModelMutation(
  cleanContent: string,
  diagramId: string,
  diagram: any,
  isEn: boolean
): UnifiedTurnResult | null {
  if (!diagram) return null;

  const explicitMutation = extractExplicitModelMutations(cleanContent, diagram);
  if (!explicitMutation) return null;

  const mutationDelta = expandSemanticDomainToDelta(explicitMutation, diagramId, diagram, cleanContent);
  if (mutationDelta && mutationDelta.deltas.length > 0) {
    let defaultReply = isEn
      ? 'I have prepared the proposal for this change. You can preview the updated elements on the canvas and confirm to apply.'
      : 'Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que se aplique en vivo.';
    const hasUnlink = mutationDelta.deltas.some((d: any) => d.kind === 'association' && (d as any).newAssociationClassId === null);
    const hasClassCreate = mutationDelta.deltas.some((d: any) => d.kind === 'class' && d.op === 'create');
    if (hasUnlink) {
      defaultReply = isEn
        ? 'I have prepared the proposal to unlink the association class. The relationship and classes remain intact on the canvas.'
        : 'Preparé la propuesta para desvincular la clase de asociación. La relación base y las clases se conservan intactas en el lienzo.';
    } else if (hasClassCreate) {
      defaultReply = isEn
        ? 'I have prepared the proposal for this change. You can preview it on the canvas and confirm to apply.'
        : 'Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que la construya en vivo.';
    }
    return {
      replyContent: defaultReply,
      batchDelta: mutationDelta,
    };
  }

  if (explicitMutation.deletions && Array.isArray(explicitMutation.deletions.attributes) && explicitMutation.deletions.attributes.length === 0) {
    return {
      replyContent: isEn
        ? 'The requested attribute does not exist in the diagram, so no changes were made.'
        : 'El atributo solicitado no existe en el diagrama, por lo que no se realizaron modificaciones.',
    };
  }

  return null;
}
