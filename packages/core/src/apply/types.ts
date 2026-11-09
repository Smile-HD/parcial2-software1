/**
 * Tipos y funciones de resultado para el motor de aplicación de deltas.
 */

/**
 * Unión discriminada de todos los posibles errores de aplicación de deltas.
 * Cada error transporta datos estructurados para un manejo preciso.
 */
export type ApplyError =
  | { kind: 'DuplicateClassError'; className: string; classId?: string }
  | { kind: 'ClassNotFoundError'; classId: string }
  | { kind: 'AssociationNotFoundError'; associationId: string }
  | { kind: 'InvalidMultiplicityError'; multiplicity: string }
  | { kind: 'InvalidOperationError'; reason: string }
  | { kind: 'MemberNotFoundError'; memberId: string; classId: string }
  | { kind: 'DuplicateMemberError'; memberName: string; classId: string }
  | { kind: 'DuplicateGeneralizationError'; subClassId: string; superClassId: string }
  | { kind: 'GeneralizationNotFoundError'; generalizationId: string }
  | { kind: 'GeneralizationCycleError'; subClassId: string; superClassId: string }
  | { kind: 'DuplicateRealizationError'; clientClassId: string; supplierInterfaceId: string }
  | { kind: 'RealizationNotFoundError'; realizationId: string }
  | { kind: 'RealizationTargetNotInterfaceError'; supplierClassId: string }
  | { kind: 'DuplicateDependencyError'; clientClassId: string; supplierClassId: string }
  | { kind: 'DependencyNotFoundError'; dependencyId: string }
  | { kind: 'NaryAssociationNotFoundError'; naryAssociationId: string }
  | { kind: 'NaryAssociationMinEndsError'; count: number }
  | { kind: 'DuplicateNaryMemberError'; classId: string }
  | { kind: 'BatchError'; error: ApplyError; failedDeltaIndex: number };

/**
 * Predicado de tipo (guard) para ApplyError.
 */
export function isApplyError(value: unknown): value is ApplyError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as Record<string, unknown>).kind === 'string'
  );
}

/**
 * Tipo de resultado para applyDelta — unión discriminada de éxito o error.
 */
export type ApplyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApplyError };

/**
 * Crea un resultado exitoso.
 */
export function ok<T>(value: T): ApplyResult<T> {
  return { ok: true, value };
}

/**
 * Crea un resultado con error.
 */
export function err(error: ApplyError): ApplyResult<never> {
  return { ok: false, error };
}

