import crypto from 'node:crypto';
import type { DeltaExpansionContext } from './context.js';
import type { SemanticDomainModel, SemanticUpdates } from '../types.js';

/**
 * Procesa actualizaciones de generalizaciones, realizaciones y dependencias.
 */
export function applyHierarchyUpdates(ctx: DeltaExpansionContext, updates?: SemanticUpdates): void {
  if (!updates) return;
  const { diagramId, timestamp, deltas, currentDiagram, resolveClassId } = ctx;

  if (Array.isArray(updates.generalizations) && currentDiagram?.generalizations) {
    for (const u of updates.generalizations) {
      const subId = resolveClassId(u.subclass);
      const superId = resolveClassId(u.superclass);
      if (subId && superId) {
        const gen = currentDiagram.generalizations.find((g: any) => g.subClassId === subId && g.superClassId === superId);
        if (gen && u.name !== undefined) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'generalization',
            op: 'update',
            generalizationId: gen.id,
            name: u.name,
          });
        }
      }
    }
  }

  if (Array.isArray(updates.realizations) && currentDiagram?.realizations) {
    for (const u of updates.realizations) {
      const client = resolveClassId(u.clientClass);
      const supplier = resolveClassId(u.supplierInterface);
      if (client && supplier) {
        const r = currentDiagram.realizations.find((rel: any) => rel.clientClassId === client && rel.supplierInterfaceId === supplier);
        if (r && u.name !== undefined) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'realization',
            op: 'update',
            realizationId: r.id,
            name: u.name,
          });
        }
      }
    }
  }

  if (Array.isArray(updates.dependencies) && currentDiagram?.dependencies) {
    for (const u of updates.dependencies) {
      const client = resolveClassId(u.client);
      const supplier = resolveClassId(u.supplier);
      if (client && supplier) {
        const d = currentDiagram.dependencies.find((dep: any) => dep.clientClassId === client && dep.supplierClassId === supplier);
        if (d && u.name !== undefined) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'dependency',
            op: 'update',
            dependencyId: d.id,
            name: u.name,
          });
        }
      }
    }
  }
}

/**
 * Procesa generalizaciones (herencia OOAD: "is-a").
 * La herencia es la relación estructural más fuerte: tiene precedencia sobre asociaciones.
 */
export function applyGeneralizationsDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  const { diagramId, timestamp, deltas, seenConnectedPairs, currentDiagram, resolveClassId, getPairKey } = ctx;
  const pendingGeneralizations: Array<{ subclass: string; superclass: string; name?: string }> = [];

  if (Array.isArray(model.generalizations)) {
    for (const g of model.generalizations) {
      if (g.subclass && g.superclass) {
        pendingGeneralizations.push({
          subclass: g.subclass,
          superclass: g.superclass,
          name: g.name,
        });
      }
    }
  }

  // Si en model.associations el LLM etiquetó alguna relación como herencia/generalización
  if (Array.isArray(model.associations)) {
    for (const assoc of model.associations) {
      const isGen =
        (assoc.name && /^(generaliz|hered|herencia|is_a|subclass)/i.test(assoc.name)) ||
        ((assoc as any).type && /^(generaliz|hered|herencia|is_a|subclass)/i.test((assoc as any).type));
      if (isGen && assoc.source && assoc.target) {
        pendingGeneralizations.push({
          subclass: assoc.source,
          superclass: assoc.target,
          name: assoc.name,
        });
      }
    }
  }

  for (const gen of pendingGeneralizations) {
    const subId = resolveClassId(gen.subclass);
    const superId = resolveClassId(gen.superclass);
    if (!subId || !superId || subId === superId) continue;
    const pair = getPairKey(subId, superId);
    if (seenConnectedPairs.has(pair)) continue;

    // Podar asociaciones previas entre sub y super para evitar líneas redundantes
    const existingAssocsForGen = currentDiagram?.associations?.filter((a: any) =>
      (a.sourceClassId === subId && a.targetClassId === superId) ||
      (a.sourceClassId === superId && a.targetClassId === subId)
    ) || [];
    for (const ea of existingAssocsForGen) {
      if (!deltas.some((d: any) => d.kind === 'association' && d.op === 'delete' && d.associationId === ea.id)) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'association',
          op: 'delete',
          associationId: ea.id,
        });
      }
    }

    deltas.push({
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'generalization',
      op: 'create',
      generalizationId: crypto.randomUUID(),
      subClassId: subId,
      superClassId: superId,
      name: gen.name,
    });
    seenConnectedPairs.add(pair);
  }
}

/**
 * Procesa realizaciones explícitas (implementación de interfaz).
 */
export function applyRealizationsDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.realizations)) return;
  const { diagramId, timestamp, deltas, seenConnectedPairs, currentDiagram, resolveClassId, getPairKey } = ctx;

  model.realizations.forEach((r) => {
    const client = resolveClassId(r.clientClass);
    const supplier = resolveClassId(r.supplierInterface);
    if (!client || !supplier || client === supplier) return;
    const pair = getPairKey(client, supplier);
    if (seenConnectedPairs.has(pair)) return;

    const existingAssocsForRealiz = currentDiagram?.associations?.filter((a: any) =>
      (a.sourceClassId === client && a.targetClassId === supplier) ||
      (a.sourceClassId === supplier && a.targetClassId === client)
    ) || [];
    for (const ea of existingAssocsForRealiz) {
      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'delete',
        associationId: ea.id,
      });
    }

    deltas.push({
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'realization',
      op: 'create',
      realizationId: crypto.randomUUID(),
      clientClassId: client,
      supplierInterfaceId: supplier,
      name: r.name,
    });
    seenConnectedPairs.add(pair);
  });
}

/**
 * Procesa dependencias explícitas (uso o referencia funcional).
 */
export function applyDependenciesDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.dependencies)) return;
  const { diagramId, timestamp, deltas, seenConnectedPairs, currentDiagram, resolveClassId, getPairKey } = ctx;

  model.dependencies.forEach((d) => {
    const client = resolveClassId(d.clientClass || d.client);
    const supplier = resolveClassId(d.supplierClass || d.supplier);
    if (!client || !supplier || client === supplier) return;
    const pair = getPairKey(client, supplier);
    if (seenConnectedPairs.has(pair)) return;

    const existingAssocsForDep = currentDiagram?.associations?.filter((a: any) =>
      (a.sourceClassId === client && a.targetClassId === supplier) ||
      (a.sourceClassId === supplier && a.targetClassId === client)
    ) || [];
    for (const ea of existingAssocsForDep) {
      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'delete',
        associationId: ea.id,
      });
    }

    deltas.push({
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'dependency',
      op: 'create',
      dependencyId: crypto.randomUUID(),
      clientClassId: client,
      supplierClassId: supplier,
      name: d.name,
    });
    seenConnectedPairs.add(pair);
  });
}
