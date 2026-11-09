import type * as Y from 'yjs';
import {
  type ApplyError,
  type ApplyResult,
  type AssociationDelta,
  type ClassDelta,
  type DependencyDelta,
  type Diagram,
  type GeneralizationDelta,
  type RealizationDelta,
  MultiplicitySchema,
  projectYDocToDiagram,
} from '@app/core';
import { applyDeltaToYDoc } from '../applyDeltaToYDoc.js';
import { t } from '../../i18n.js';
import type { PaletteEdgeTool } from '../paletteTools.js';

export type EditorEdgeType = 'association' | 'generalization' | 'realization' | 'dependency';

export function isEditorEdgeType(type: string | undefined): type is EditorEdgeType {
  return type === 'association' || type === 'generalization' || type === 'realization' || type === 'dependency';
}

/** editor:R4 - enlace entre dos clases existentes; las multiplicidades son editables por extremo. */
export interface AssociationLink {
  sourceClassId: string;
  targetClassId: string;
  directed: boolean;
  /**
   * unidad 13c — preajuste de tipo de agregación opcional (herramientas de Agregación /
   * Composición de la paleta). Omitido = asociación simple ('none' mediante el
   * valor predeterminado de la IR), de modo que cada llamador existente permanece idéntico byte a byte.
   */
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  name?: string;
  sourceRole?: string;
  targetRole?: string;
  associationClassId?: string;
}

/**
 * editor:R4 - emite un delta `create` de asociación vía applyDeltaToYDoc.
 * Protecciones antes de emitir: el esquema del delta arroja excepción ante entrada inválida,
 * por lo que ningún id de clase vacío lo alcanza. Las asociaciones autorreferenciales (recursivas)
 * — la misma clase en ambos extremos — son UML válido y están permitidas por el motor central
 * (la ruta de arrastrar para conectar de la paleta agrega su propia protección de extremos distintos).
 * unidad 13b: retorna el resultado del motor (null cuando la protección local rechaza)
 * para que la ruta de arrastrar para conectar pueda exponer los rechazos; quienes llaman a esto
 * actualmente ignoran el valor de retorno.
 */
export function handleCreateAssociation(
  doc: Y.Doc,
  diagramId: string,
  link: AssociationLink,
): ApplyResult<Diagram> | null {
  if (link.sourceClassId === '' || link.targetClassId === '') {
    return null;
  }
  // unidad 13d corrección C — los preajustes de Agregación/Composición inician con multiplicidades
  // NO ESPECIFICADAS (extremos vacíos, según la convención UML: un nuevo conector no
  // asume multiplicidad predeterminada). La herramienta de Asociación simple conserva su
  // valor predeterminado documentado '1'/'1'; las rutas comparten esta función pero bifurcan según el preajuste.
  const presetAggregation = link.aggregation !== undefined && link.aggregation !== 'none';
  const delta: AssociationDelta = {
    kind: 'association',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    associationId: crypto.randomUUID(),
    sourceClassId: link.sourceClassId,
    targetClassId: link.targetClassId,
    ...(presetAggregation
      ? (link.sourceMultiplicity ? { sourceMultiplicity: link.sourceMultiplicity } : {})
      : { sourceMultiplicity: link.sourceMultiplicity ?? '1' }),
    ...(presetAggregation
      ? (link.targetMultiplicity ? { targetMultiplicity: link.targetMultiplicity } : {})
      : { targetMultiplicity: link.targetMultiplicity ?? '1' }),
    directed: link.directed,
    // Herramientas de Agregación/Composición: el diamante se ubica en el extremo destino
    // por defecto (aggregationEnd='target') para que al arrastrar de A a B el rombo apunte a B.
    ...(presetAggregation
      ? { aggregation: link.aggregation, aggregationEnd: link.aggregationEnd ?? 'target' }
      : (link.aggregation ? { aggregation: link.aggregation, aggregationEnd: link.aggregationEnd } : {})),
    ...(link.name ? { name: link.name } : {}),
    ...(link.sourceRole ? { sourceRole: link.sourceRole } : {}),
    ...(link.targetRole ? { targetRole: link.targetRole } : {}),
    ...(link.associationClassId ? { associationClassId: link.associationClassId } : {}),
  };
  return applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R4 - edición de multiplicidad por extremo, protegida contra valores fuera
 * del enum. La protección reside AQUÍ (antes de emitir): `DeltaSchema.parse` en
 * core ARROJA excepción ante multiplicidades inválidas, por lo que `3..7` nunca debe
 * llegar a applyDeltaToYDoc o la aplicación fallará. La entrada inválida se rechaza
 * silenciosamente y el valor anterior se conserva (no se emite delta).
 * unidad 13d corrección C — un valor VACÍO (o de solo espacios) RESTABLECE el extremo
 * a no especificado mediante un portador `null` (el tri-estado de core: undefined conserva,
 * string establece, null limpia). Los valores basura aún se rechazan.
 */
export function handleUpdateMultiplicity(
  doc: Y.Doc,
  diagramId: string,
  associationId: string,
  endpoint: 'source' | 'target',
  value: string,
): void {
  const trimmed = value.trim();
  if (trimmed === '') {
    // Limpiar a no especificado — el editor debe permitir vaciar una multiplicidad.
    const clearDelta: AssociationDelta = {
      kind: 'association',
      op: 'updateMultiplicity',
      id: crypto.randomUUID(),
      diagramId,
      timestamp: new Date().toISOString(),
      associationId,
      ...(endpoint === 'source'
        ? { newSourceMultiplicity: null }
        : { newTargetMultiplicity: null }),
    };
    applyDeltaToYDoc(doc, clearDelta);
    return;
  }
  // unidad 9 — gramática completa de multiplicidad UML 2.5.1 (*, enteros, m..n, m..*);
  // los valores no válidos se rechazan y el valor anterior se conserva (editor:R4).
  const parsed = MultiplicitySchema.safeParse(trimmed);
  if (!parsed.success) {
    return;
  }
  const multiplicity = parsed.data;
  const delta: AssociationDelta = {
    kind: 'association',
    op: 'updateMultiplicity',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    associationId,
    ...(endpoint === 'source'
      ? { newSourceMultiplicity: multiplicity }
      : { newTargetMultiplicity: multiplicity }),
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * Unidad 10 — actualiza el tipo de agregación, nombre, roles y aggregationEnd de la asociación.
 * Los valores de agregación inválidos se rechazan (no se emite delta).
 */
export function handleUpdateAssociationMeta(
  doc: Y.Doc,
  diagramId: string,
  associationId: string,
  updates: {
    aggregation?: 'none' | 'shared' | 'composite';
    aggregationEnd?: 'source' | 'target';
    name?: string;
    sourceRole?: string;
    targetRole?: string;
    associationClassId?: string | null;
  },
): void {
  // Validar agregación si se proporciona
  if (updates.aggregation !== undefined && !['none', 'shared', 'composite'].includes(updates.aggregation)) {
    return;
  }
  // Validar aggregationEnd si se proporciona
  if (updates.aggregationEnd !== undefined && !['source', 'target'].includes(updates.aggregationEnd)) {
    return;
  }
  const delta: AssociationDelta = {
    kind: 'association',
    op: 'updateMultiplicity', // reutiliza el tipo de op existente para retrocompatibilidad; los campos son opcionales
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    associationId,
    ...(updates.aggregation !== undefined ? { aggregation: updates.aggregation } : {}),
    ...(updates.aggregationEnd !== undefined ? { aggregationEnd: updates.aggregationEnd } : {}),
    ...(updates.name !== undefined ? { name: updates.name || undefined } : {}),
    ...(updates.sourceRole !== undefined ? { sourceRole: updates.sourceRole || undefined } : {}),
    ...(updates.targetRole !== undefined ? { targetRole: updates.targetRole || undefined } : {}),
    ...(updates.associationClassId !== undefined
      ? { newAssociationClassId: updates.associationClassId ? updates.associationClassId : null }
      : {}),
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R4 — elimina una asociación emitiendo un delta `delete` de asociación.
 * La operación existe en core desde la Unidad 6; esto la conecta a la UI para que
 * las asociaciones puedan eliminarse sin borrar una clase miembro.
 */
export function handleDeleteAssociation(
  doc: Y.Doc,
  diagramId: string,
  associationId: string,
): void {
  const delta: AssociationDelta = {
    kind: 'association',
    op: 'delete',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    associationId,
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Generalización (unidad 11.4) — emite un delta `create` de generalización
 * (subClass → superClass). Los invariantes del motor (existencia, duplicados, ciclos)
 * son impuestos por applyDelta; un delta rechazado deja el Y.Doc sin cambios.
 * unidad 13b: retorna el resultado del motor para que la ruta de arrastrar para conectar
 * pueda exponer rechazos por ciclo/duplicado; los llamadores existentes lo ignoran.
 */
export function handleCreateGeneralization(
  doc: Y.Doc,
  diagramId: string,
  link: { subClassId: string; superClassId: string },
): ApplyResult<Diagram> | null {
  if (link.subClassId === '' || link.superClassId === '') {
    return null;
  }
  const delta: GeneralizationDelta = {
    kind: 'generalization',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    generalizationId: crypto.randomUUID(),
    subClassId: link.subClassId,
    superClassId: link.superClassId,
  };
  return applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Generalización (unidad 11.4) — emite un delta `delete` de generalización.
 */
export function handleDeleteGeneralization(
  doc: Y.Doc,
  diagramId: string,
  generalizationId: string,
): void {
  const delta: GeneralizationDelta = {
    kind: 'generalization',
    op: 'delete',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    generalizationId,
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Interfaces (unidad 12.2/12.4) — emite un delta `create` de realización
 * (clase cliente → interfaz proveedora). Los invariantes del motor (existencia,
 * destino de tipo interfaz, duplicados) son impuestos por applyDelta; un delta
 * rechazado deja el Y.Doc sin cambios.
 * unidad 13b: retorna el resultado del motor para que la ruta de arrastrar para conectar
 * pueda exponer rechazos; los llamadores existentes lo ignoran.
 */
export function handleCreateRealization(
  doc: Y.Doc,
  diagramId: string,
  link: { clientClassId: string; supplierInterfaceId: string },
): ApplyResult<Diagram> | null {
  if (link.clientClassId === '' || link.supplierInterfaceId === '') {
    return null;
  }
  const delta: RealizationDelta = {
    kind: 'realization',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    realizationId: crypto.randomUUID(),
    clientClassId: link.clientClassId,
    supplierInterfaceId: link.supplierInterfaceId,
  };
  return applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Interfaces (unidad 12.4) — emite un delta `delete` de realización.
 */
export function handleDeleteRealization(
  doc: Y.Doc,
  diagramId: string,
  realizationId: string,
): void {
  const delta: RealizationDelta = {
    kind: 'realization',
    op: 'delete',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    realizationId,
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Interfaces (unidad 12.2/12.4 — mitad 12b) — emite un delta
 * `create` de dependencia (clase cliente → clase o interfaz proveedora). Los invariantes
 * del motor (existencia, duplicados) son impuestos por applyDelta; un delta
 * rechazado deja el Y.Doc sin cambios.
 * unidad 13b: retorna el resultado del motor para que la ruta de arrastrar para conectar
 * pueda exponer rechazos; los llamadores existentes lo ignoran.
 */
export function handleCreateDependency(
  doc: Y.Doc,
  diagramId: string,
  link: { clientClassId: string; supplierClassId: string },
): ApplyResult<Diagram> | null {
  if (link.clientClassId === '' || link.supplierClassId === '') {
    return null;
  }
  const delta: DependencyDelta = {
    kind: 'dependency',
    op: 'create',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    dependencyId: crypto.randomUUID(),
    clientClassId: link.clientClassId,
    supplierClassId: link.supplierClassId,
  };
  return applyDeltaToYDoc(doc, delta);
}

/**
 * editor:R Interfaces (unidad 12.4 — mitad 12b) — emite un delta `delete` de dependencia.
 */
export function handleDeleteDependency(
  doc: Y.Doc,
  diagramId: string,
  dependencyId: string,
): void {
  const delta: DependencyDelta = {
    kind: 'dependency',
    op: 'delete',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    dependencyId,
  };
  applyDeltaToYDoc(doc, delta);
}

/**
 * unidad 13c — actualiza la etiqueta editable de una generalización vía el delta de nombre
 * `update` de core. Una cadena vacía borra la etiqueta (el motor mapea '' → undefined).
 */
export function handleUpdateGeneralizationLabel(
  doc: Y.Doc,
  diagramId: string,
  generalizationId: string,
  name: string,
): void {
  const delta: GeneralizationDelta = {
    kind: 'generalization',
    op: 'update',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    generalizationId,
    name,
  };
  applyDeltaToYDoc(doc, delta);
}

/** unidad 13c — actualiza la etiqueta editable de una realización (ver gemelo de generalización). */
export function handleUpdateRealizationLabel(
  doc: Y.Doc,
  diagramId: string,
  realizationId: string,
  name: string,
): void {
  const delta: RealizationDelta = {
    kind: 'realization',
    op: 'update',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    realizationId,
    name,
  };
  applyDeltaToYDoc(doc, delta);
}

/** unidad 13c — actualiza la etiqueta editable de una dependencia (ver gemelo de generalización). */
export function handleUpdateDependencyLabel(
  doc: Y.Doc,
  diagramId: string,
  dependencyId: string,
  name: string,
): void {
  const delta: DependencyDelta = {
    kind: 'dependency',
    op: 'update',
    id: crypto.randomUUID(),
    diagramId,
    timestamp: new Date().toISOString(),
    dependencyId,
    name,
  };
  applyDeltaToYDoc(doc, delta);
}

/** Resultado de un arrastrar para conectar protegido: ok, o rechazado con un mensaje para el usuario. */
export interface ConnectGuardResult {
  ok: boolean;
  message?: string;
}

/**
 * Razón legible por humanos para un rechazo del motor mostrada en la UI.
 * unidad 13e.10 — `t()` a nivel de módulo en tiempo de LLAMADA: estos se ejecutan dentro
 * de controladores de eventos (no de renderizado), y `t` lee el idioma actual en cada llamada.
 */
export function describeApplyError(error: ApplyError): string {
  switch (error.kind) {
    case 'GeneralizationCycleError':
      return t('reason.cycle');
    case 'DuplicateGeneralizationError':
      return t('reason.duplicateGeneralization');
    case 'RealizationTargetNotInterfaceError':
      return t('reason.realizationNotInterface');
    case 'DuplicateRealizationError':
      return t('reason.duplicateRealization');
    case 'DuplicateDependencyError':
      return t('reason.duplicateDependency');
    case 'ClassNotFoundError':
      return t('reason.classNotFound');
    default:
      return t('reason.unknown');
  }
}

export function engineGuardResult(result: ApplyResult<Diagram> | null, label: string): ConnectGuardResult {
  if (result === null) {
    return { ok: false, message: t('guard.invalidEndpoints', { label }) };
  }
  if (result.ok) {
    return { ok: true };
  }
  return { ok: false, message: t('guard.rejectedReason', { label, reason: describeApplyError(result.error) }) };
}

/**
 * unidad 13b (editor:R Asociaciones/Generalización/Realización/Dependencia) —
 * el núcleo de arrastrar para conectar: dada la herramienta de arista ARMADA y una
 * conexión de React Flow (nodo origen → nodo destino), impone los invariantes de nivel de UI
 * que el motor también impone y emite el delta correspondiente.
 */
export function handleConnectWithTool(
  doc: Y.Doc,
  diagramId: string,
  tool: PaletteEdgeTool | null,
  connection: { source: string | null; target: string | null },
  classifiers: readonly { id: string; kind: 'class' | 'interface' }[],
): ConnectGuardResult {
  if (tool === null) {
    return { ok: false };
  }
  const { source, target } = connection;
  if (source === null || target === null) {
    return { ok: false, message: t('guard.bothEndsClasses') };
  }
  const sourceCls = classifiers.find((cls) => cls.id === source);
  const targetCls = classifiers.find((cls) => cls.id === target);
  if (sourceCls === undefined || targetCls === undefined) {
    return { ok: false, message: t('guard.endpointsExist') };
  }

  switch (tool) {
    case 'association': {
      const result = handleCreateAssociation(doc, diagramId, {
        sourceClassId: source,
        targetClassId: target,
        directed: false,
      });
      return engineGuardResult(result, t('tool.association'));
    }
    case 'associationClass': {
      const live = projectYDocToDiagram(doc);
      const sNode = live.classes.find((c) => c.id === source);
      const tNode = live.classes.find((c) => c.id === target);
      const posX = sNode && tNode ? Math.round((sNode.position.x + tNode.position.x) / 2) : 200;
      const posY = sNode && tNode ? Math.round((sNode.position.y + tNode.position.y) / 2) - 100 : 150;

      const assocClassId = crypto.randomUUID();
      const sName = sNode?.name ?? 'Source';
      const tName = tNode?.name ?? 'Target';
      const assocClassName = `${sName}${tName}`;

      const classDelta: ClassDelta = {
        kind: 'class',
        op: 'create',
        id: crypto.randomUUID(),
        diagramId,
        timestamp: new Date().toISOString(),
        classId: assocClassId,
        name: assocClassName,
        position: { x: posX, y: posY },
      };
      applyDeltaToYDoc(doc, classDelta);

      const result = handleCreateAssociation(doc, diagramId, {
        sourceClassId: source,
        targetClassId: target,
        directed: false,
        associationClassId: assocClassId,
      });
      return engineGuardResult(result, t('tool.associationClass'));
    }
    case 'aggregation':
    case 'composition': {
      const result = handleCreateAssociation(doc, diagramId, {
        sourceClassId: source,
        targetClassId: target,
        directed: false,
        aggregation: tool === 'aggregation' ? 'shared' : 'composite',
      });
      return engineGuardResult(result, tool === 'aggregation' ? t('tool.aggregation') : t('tool.composition'));
    }
    case 'generalization': {
      if (source === target) {
        return { ok: false, message: t('guard.noSelfInheritance') };
      }
      const result = handleCreateGeneralization(doc, diagramId, {
        subClassId: source,
        superClassId: target,
      });
      return engineGuardResult(result, t('tool.generalization'));
    }
    case 'realization': {
      if (targetCls.kind !== 'interface') {
        return { ok: false, message: t('guard.realizationTarget') };
      }
      const result = handleCreateRealization(doc, diagramId, {
        clientClassId: source,
        supplierInterfaceId: target,
      });
      return engineGuardResult(result, t('tool.realization'));
    }
    case 'dependency': {
      const result = handleCreateDependency(doc, diagramId, {
        clientClassId: source,
        supplierClassId: target,
      });
      return engineGuardResult(result, t('tool.dependency'));
    }
  }
}

/**
 * unidad 13f — StarUML style dynamic handle allocation: picks optimal perimeter sides
 * based on relative positions of source and target to avoid wrapping around nodes.
 */
export function getOptimalHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  isSelf = false,
): { sourceHandle: string | undefined; targetHandle: string | undefined } {
  if (isSelf) {
    return { sourceHandle: undefined, targetHandle: undefined };
  }
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: undefined, targetHandle: undefined } // Right -> Left
      : { sourceHandle: 'left-source', targetHandle: 'right-target' }; // Left -> Right
  } else {
    return dy >= 0
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' } // Bottom -> Top
      : { sourceHandle: 'top-source', targetHandle: 'bottom-target' }; // Top -> Bottom
  }
}
