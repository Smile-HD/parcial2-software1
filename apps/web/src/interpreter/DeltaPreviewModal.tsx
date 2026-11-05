/**
 * Modal de vista previa de delta (tarea 7.6, interpreter:R2).
 *
 * El delta pendiente retornado por el intérprete se muestra ANTES de ser
 * aplicado: Confirm lo libera a través de la ruta canónica de deltas, Reject
 * lo descarta y deja el modelo sin cambios. Las líneas de resumen se
 * renderizan desde el propio objeto delta (nunca desde la locución original).
 */
import type { Delta } from '@app/core';

/** Una línea legible por humanos por cada kind/op de delta. */
export function describeDelta(
  delta: Delta,
  isEn: boolean = true,
  classNamesById?: Map<string, string> | Record<string, string>
): string {
  const getClassName = (id?: string | null): string | undefined => {
    if (!id || !classNamesById) return undefined;
    if (classNamesById instanceof Map) return classNamesById.get(id);
    return (classNamesById as Record<string, string>)[id];
  };

  switch (delta.kind) {
    case 'class':
      switch (delta.op) {
        case 'create':
          return isEn ? `Add class "${delta.name ?? '?'}"` : `Crear clase "${delta.name ?? '?'}"`;
        case 'rename':
          return isEn ? `Rename class to "${delta.newName ?? '?'}"` : `Renombrar clase a "${delta.newName ?? '?'}"`;
        case 'reposition':
          return isEn
            ? `Move class to (${delta.newPosition?.x ?? '?'}, ${delta.newPosition?.y ?? '?'})`
            : `Mover clase a (${delta.newPosition?.x ?? '?'}, ${delta.newPosition?.y ?? '?'})`;
        case 'delete': {
          const clsName = getClassName(delta.classId);
          return isEn
            ? (clsName ? `Delete class "${clsName}"` : 'Delete class')
            : (clsName ? `Eliminar clase "${clsName}"` : 'Eliminar clase');
        }
        case 'update': {
          const clsName = getClassName(delta.classId);
          const targetStr = clsName ? ` "${clsName}"` : '';
          if (delta.isAbstract !== undefined) {
            return isEn
              ? `Make class${targetStr} ${delta.isAbstract ? 'abstract' : 'concrete'}`
              : `Marcar clase${targetStr} como ${delta.isAbstract ? 'abstracta' : 'concreta'}`;
          }
          if (delta.classKind !== undefined) {
            return isEn
              ? `Set${targetStr} type to ${delta.classKind}`
              : `Cambiar tipo de${targetStr} a ${delta.classKind}`;
          }
          return isEn ? `Update class${targetStr}` : `Actualizar clase${targetStr}`;
        }
      }
      break;
    case 'member':
      switch (delta.op) {
        case 'addAttribute':
          return isEn
            ? `Add attribute "${delta.name ?? '?'}: ${delta.type ?? '?'}"`
            : `Agregar atributo "${delta.name ?? '?'}: ${delta.type ?? '?'}"`;
        case 'editAttribute':
          return isEn
            ? `Edit attribute to "${delta.name ?? '?'}: ${delta.type ?? '?'}"`
            : `Modificar atributo a "${delta.name ?? '?'}: ${delta.type ?? '?'}"`;
        case 'deleteAttribute':
          return isEn ? 'Delete attribute' : 'Eliminar atributo';
        case 'addMethod':
          return isEn
            ? `Add method "${delta.name ?? '?'}" returning "${delta.returnType ?? '?'}"`
            : `Agregar método "${delta.name ?? '?'}" que retorna "${delta.returnType ?? '?'}"`;
        case 'editMethod':
          return isEn
            ? `Edit method to "${delta.name ?? '?'}" returning "${delta.returnType ?? '?'}"`
            : `Modificar método a "${delta.name ?? '?'}" que retorna "${delta.returnType ?? '?'}"`;
        case 'deleteMethod':
          return isEn ? 'Delete method' : 'Eliminar método';
      }
      break;
    case 'association':
      switch (delta.op) {
        case 'create':
          return isEn ? 'Add association' : 'Crear asociación';
        case 'updateMultiplicity': {
          const parts: string[] = [];
          if (delta.aggregation) {
            const aggLabel = delta.aggregation === 'composite'
              ? (isEn ? 'composition' : 'composición')
              : delta.aggregation === 'shared'
              ? (isEn ? 'aggregation' : 'agregación')
              : (isEn ? 'simple association' : 'asociación simple');
            parts.push(isEn ? `Change relationship to ${aggLabel}` : `Cambiar relación a ${aggLabel}`);
          }
          if (delta.newSourceMultiplicity || delta.newTargetMultiplicity) {
            parts.push(
              isEn
                ? `Update multiplicities to "${delta.newSourceMultiplicity ?? '?'}" / "${delta.newTargetMultiplicity ?? '?'}"`
                : `Actualizar multiplicidades a "${delta.newSourceMultiplicity ?? '?'}" / "${delta.newTargetMultiplicity ?? '?'}"`
            );
          }
          if (parts.length > 0) return parts.join('; ');
          return isEn ? 'Update relationship' : 'Actualizar relación';
        }
        case 'delete':
          return isEn ? 'Delete association' : 'Eliminar asociación';
      }
      break;
    case 'batch':
      return isEn
        ? `Apply ${delta.deltas.length} changes: ${delta.deltas.map((inner) => describeDelta(inner, isEn)).join('; ')}`
        : `Aplicar ${delta.deltas.length} cambios: ${delta.deltas.map((inner) => describeDelta(inner, isEn)).join('; ')}`;
  }
}

export interface DeltaPreviewModalProps {
  delta: Delta;
  onConfirm: () => void;
  onReject: () => void;
}

/**
 * El modal se desmonta mientras una solicitud de confirmación/rechazo está en curso
 * (la aplicación traslada primero el intérprete a su fase `thinking`), por lo que los
 * botones no necesitan un estado deshabilitado por ocupado independiente.
 */
export function DeltaPreviewModal({ delta, onConfirm, onReject }: DeltaPreviewModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="delta-preview" role="dialog" aria-label="AI change preview">
        <h2>AI proposes this change</h2>
        <p className="delta-preview__summary">{describeDelta(delta)}</p>
        <div className="delta-preview__actions">
          <button type="button" onClick={onReject}>
            Reject
          </button>
          <button type="button" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
