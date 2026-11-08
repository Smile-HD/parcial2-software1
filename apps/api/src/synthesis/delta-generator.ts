import crypto from 'node:crypto';
import type { BatchDelta } from '@app/core';

export * from './types.js';
import type { SemanticDomainModel } from './types.js';

export * from './deltas/index.js';
import type { DeltaExpansionContext } from './deltas/context.js';
import {
  cleanClassName,
  toCanonicalKey,
  classExactOrPluralMatches,
  classWordMatches,
  extractExplicitRequestedClasses,
} from './deltas/delta-helpers.js';
import {
  applyClassRenames,
  applyClassAndMemberUpdates,
} from './deltas/delta-class-updates.js';
import {
  applyClassesDeltas,
} from './deltas/delta-classes.js';
import {
  applyHierarchyUpdates,
  applyGeneralizationsDeltas,
  applyRealizationsDeltas,
  applyDependenciesDeltas,
} from './deltas/delta-hierarchy.js';
import {
  applyRelationUpdates,
  applyAssociationsDeltas,
  applyIsolatedClassesHeuristic,
  applyNaryDeltas,
} from './deltas/delta-relations.js';
import { applyDeletionsDeltas } from './deltas/delta-deletions.js';

/**
 * Expande un modelo de dominio semántico a un BatchDelta formal de UML.
 * Orquesta la creación, actualización y eliminación de elementos respetando
 * las invariantes semánticas de OOAD y la precedencia estructural.
 */
export function expandSemanticDomainToDelta(
  model: SemanticDomainModel,
  diagramId: string,
  currentDiagram?: any,
  originText?: string
): BatchDelta | null {
  const hasClasses = Array.isArray(model.classes) && model.classes.length > 0;
  const hasAssociations = Array.isArray(model.associations) && model.associations.length > 0;
  const hasGeneralizations = Array.isArray(model.generalizations) && model.generalizations.length > 0;
  const hasRealizations = Array.isArray(model.realizations) && model.realizations.length > 0;
  const hasDependencies = Array.isArray(model.dependencies) && model.dependencies.length > 0;
  const hasNary = Array.isArray(model.naryAssociations) && model.naryAssociations.length > 0;
  const hasRenames = !!model.renames && (
    (Array.isArray(model.renames.classes) && model.renames.classes.length > 0) ||
    (Array.isArray(model.renames.attributes) && model.renames.attributes.length > 0) ||
    (Array.isArray(model.renames.methods) && model.renames.methods.length > 0)
  );
  const hasUpdates = !!model.updates && (
    (Array.isArray(model.updates.classes) && model.updates.classes.length > 0) ||
    (Array.isArray(model.updates.attributes) && model.updates.attributes.length > 0) ||
    (Array.isArray(model.updates.methods) && model.updates.methods.length > 0) ||
    (Array.isArray(model.updates.associations) && model.updates.associations.length > 0) ||
    (Array.isArray(model.updates.generalizations) && model.updates.generalizations.length > 0) ||
    (Array.isArray(model.updates.realizations) && model.updates.realizations.length > 0) ||
    (Array.isArray(model.updates.dependencies) && model.updates.dependencies.length > 0) ||
    (Array.isArray(model.updates.naryAssociations) && model.updates.naryAssociations.length > 0) ||
    (Array.isArray(model.updates.positions) && model.updates.positions.length > 0)
  );
  const hasDeletions = !!model.deletions && (
    (Array.isArray(model.deletions.classes) && model.deletions.classes.length > 0) ||
    (Array.isArray(model.deletions.attributes) && model.deletions.attributes.length > 0) ||
    (Array.isArray(model.deletions.methods) && model.deletions.methods.length > 0) ||
    (Array.isArray(model.deletions.associations) && model.deletions.associations.length > 0) ||
    (Array.isArray(model.deletions.generalizations) && model.deletions.generalizations.length > 0) ||
    (Array.isArray(model.deletions.realizations) && model.deletions.realizations.length > 0) ||
    (Array.isArray(model.deletions.dependencies) && model.deletions.dependencies.length > 0) ||
    (Array.isArray(model.deletions.naryAssociations) && model.deletions.naryAssociations.length > 0)
  );

  if (!hasClasses && !hasAssociations && !hasGeneralizations && !hasRealizations && !hasDependencies && !hasNary && !hasRenames && !hasUpdates && !hasDeletions) {
    return null;
  }

  // 0. Si el usuario solicitó clases específicas de forma explícita, podar clases alucinadas y normalizar nombres contaminados
  if (originText && model.classes && model.classes.length > 0) {
    const explicitClasses = extractExplicitRequestedClasses(originText);
    if (explicitClasses.length > 0) {
      const lowerOrigin = originText.toLowerCase();

      // Si el modelo devolvió la misma cantidad de clases pero con nombres alterados por pocos disparos (ej. Pedido -> Factura)
      if (model.classes.length === explicitClasses.length) {
        for (let i = 0; i < model.classes.length; i++) {
          const c = model.classes[i]!;
          const match = explicitClasses.find((ec) => classExactOrPluralMatches(c.name, ec));
          if (!match) {
            const unassigned = explicitClasses.find((ec) => !model.classes!.some((mc) => classExactOrPluralMatches(mc.name, ec)));
            if (unassigned) {
              const oldName = c.name;
              c.name = unassigned;
              if (model.associations) {
                for (const a of model.associations) {
                  if (a.source === oldName) a.source = unassigned;
                  if (a.target === oldName) a.target = unassigned;
                }
              }
            }
          }
        }
      } else if (model.classes.length > explicitClasses.length) {
        // Filtrar clases fantasmas no solicitadas (ej. Cliente cuando sólo se pidió ReservaDeLibro)
        model.classes = model.classes.filter((c) => {
          const cName = cleanClassName(c.name).toLowerCase();
          if (explicitClasses.some((ec) => classWordMatches(cName, ec))) return true;
          if (lowerOrigin.includes(cName)) return true;
          if (currentDiagram?.classes?.some((dc: any) => dc.name.toLowerCase() === cName)) return true;
          return false;
        });
      }
    }
  }

  const timestamp = new Date().toISOString();
  const classIdMap = new Map<string, string>();
  const deltas: any[] = [];

  // Registrar clases existentes para resolver asociaciones mixtas y actualizar atributos existentes
  const existingClassesMap = new Map<string, any>();
  if (currentDiagram?.classes && Array.isArray(currentDiagram.classes)) {
    for (const ec of currentDiagram.classes) {
      if (ec.id && ec.name) {
        const cleaned = cleanClassName(ec.name);
        const lower = cleaned.toLowerCase();
        const canon = toCanonicalKey(cleaned);
        classIdMap.set(canon, ec.id);
        classIdMap.set(lower, ec.id);
        existingClassesMap.set(canon, ec);
        existingClassesMap.set(lower, ec);
      }
    }
  }

  const resolveClassId = (rawName?: string): string | undefined => {
    if (!rawName) return undefined;
    const cleaned = cleanClassName(rawName);
    const lower = cleaned.toLowerCase();
    const canon = toCanonicalKey(cleaned);
    if (classIdMap.has(canon)) return classIdMap.get(canon);
    if (classIdMap.has(lower)) return classIdMap.get(lower);
    if (lower.endsWith('es') && classIdMap.has(lower.slice(0, -2))) return classIdMap.get(lower.slice(0, -2));
    if (lower.endsWith('s') && classIdMap.has(lower.slice(0, -1))) return classIdMap.get(lower.slice(0, -1));
    if (classIdMap.has(lower + 's')) return classIdMap.get(lower + 's');
    if (classIdMap.has(lower + 'es')) return classIdMap.get(lower + 'es');
    return undefined;
  };

  // Clave canónica de pares para asegurar unicidad absoluta de aristas entre dos clases
  const getPairKey = (idA: string, idB: string): string => [idA, idB].sort().join('::');
  const seenConnectedPairs = new Set<string>();

  // Pre-cargar relaciones existentes para no crear aristas redundantes
  if (currentDiagram?.generalizations && Array.isArray(currentDiagram.generalizations)) {
    for (const g of currentDiagram.generalizations) {
      if (g.subClassId && g.superClassId) {
        const isBeingDeleted = model.deletions?.generalizations?.some((dg) => {
          const sId = resolveClassId(dg.subclass);
          const supId = resolveClassId(dg.superclass);
          return (sId === g.subClassId && supId === g.superClassId) || (sId === g.superClassId && supId === g.subClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(g.subClassId, g.superClassId));
        }
      }
    }
  }
  if (currentDiagram?.realizations && Array.isArray(currentDiagram.realizations)) {
    for (const r of currentDiagram.realizations) {
      if (r.clientClassId && r.supplierInterfaceId) {
        const isBeingDeleted = model.deletions?.realizations?.some((dr) => {
          const cId = resolveClassId(dr.clientClass);
          const supId = resolveClassId(dr.supplierInterface);
          return (cId === r.clientClassId && supId === r.supplierInterfaceId) || (cId === r.supplierInterfaceId && supId === r.clientClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(r.clientClassId, r.supplierInterfaceId));
        }
      }
    }
  }
  if (currentDiagram?.dependencies && Array.isArray(currentDiagram.dependencies)) {
    for (const d of currentDiagram.dependencies) {
      if (d.clientClassId && d.supplierClassId) {
        const isBeingDeleted = model.deletions?.dependencies?.some((dd) => {
          const cId = resolveClassId(dd.clientClass);
          const supId = resolveClassId(dd.supplierClass);
          return (cId === d.clientClassId && supId === d.supplierClassId) || (cId === d.supplierClassId && supId === d.clientClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(d.clientClassId, d.supplierClassId));
        }
      }
    }
  }

  const ctx: DeltaExpansionContext = {
    diagramId,
    timestamp,
    deltas,
    classIdMap,
    existingClassesMap,
    seenConnectedPairs,
    resolveClassId,
    getPairKey,
    currentDiagram,
    originText,
  };

  // 1. Renombrados de Clases, Atributos y Métodos
  applyClassRenames(ctx, model.renames);

  // 2. Actualizaciones explícitas
  applyClassAndMemberUpdates(ctx, model.updates);
  applyRelationUpdates(ctx, model.updates, model);
  applyHierarchyUpdates(ctx, model.updates);

  // 3. Creación y modificación de clases y miembros
  applyClassesDeltas(ctx, model);

  // 4. Jerarquía estructural: Generalizaciones ("is-a"), Realizaciones e interfaces, Dependencias
  applyGeneralizationsDeltas(ctx, model);
  applyRealizationsDeltas(ctx, model);
  applyDependenciesDeltas(ctx, model);

  // 5. Asociaciones, composiciones y n-arias
  applyAssociationsDeltas(ctx, model);
  applyIsolatedClassesHeuristic(ctx, model);
  applyNaryDeltas(ctx, model);

  // 6. Eliminaciones puntuales
  applyDeletionsDeltas(ctx, model.deletions);

  return {
    id: crypto.randomUUID(),
    diagramId,
    timestamp,
    kind: 'batch',
    deltas,
  };
}
