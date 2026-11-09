import crypto from 'node:crypto';
import type { DeltaExpansionContext } from './context.js';
import type { SemanticDeletions } from '../types.js';

/**
 * Procesa eliminaciones puntuales de asociaciones, generalizaciones, realizaciones,
 * dependencias, n-arias, atributos, métodos y clases en el orden semántico correcto.
 */
export function applyDeletionsDeltas(ctx: DeltaExpansionContext, deletions?: SemanticDeletions): void {
  if (!deletions) return;
  const { diagramId, timestamp, deltas, currentDiagram, existingClassesMap, resolveClassId } = ctx;

  // Borrado de asociaciones
  if (Array.isArray(deletions.associations) && currentDiagram?.associations) {
    deletions.associations.forEach((item) => {
      const srcId = resolveClassId(item.source);
      const tgtId = resolveClassId(item.target);
      if (srcId && tgtId) {
        const assoc = currentDiagram.associations.find(
          (a: any) =>
            (a.sourceClassId === srcId && a.targetClassId === tgtId) ||
            (a.sourceClassId === tgtId && a.targetClassId === srcId)
        );
        if (assoc && !deltas.some((d: any) => d.kind === 'association' && d.op === 'delete' && d.associationId === assoc.id)) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'association',
            op: 'delete',
            associationId: assoc.id,
          });
        }
      }
    });
  }

  // Borrado de generalizaciones
  if (Array.isArray(deletions.generalizations) && currentDiagram?.generalizations) {
    deletions.generalizations.forEach((item) => {
      const subId = resolveClassId(item.subclass);
      const superId = resolveClassId(item.superclass);
      if (subId && superId) {
        const gen = currentDiagram.generalizations.find(
          (g: any) =>
            (g.subClassId === subId && g.superClassId === superId) ||
            (g.subClassId === superId && g.superClassId === subId)
        );
        if (gen) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'generalization',
            op: 'delete',
            generalizationId: gen.id,
          });
        }
      }
    });
  }

  // Borrado de realizaciones
  if (Array.isArray(deletions.realizations) && currentDiagram?.realizations) {
    deletions.realizations.forEach((item) => {
      const client = resolveClassId(item.clientClass);
      const supplier = resolveClassId(item.supplierInterface);
      if (client && supplier) {
        const r = currentDiagram.realizations.find(
          (rel: any) =>
            (rel.clientClassId === client && rel.supplierInterfaceId === supplier) ||
            (rel.clientClassId === supplier && rel.supplierInterfaceId === client)
        );
        if (r) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'realization',
            op: 'delete',
            realizationId: r.id,
          });
        }
      }
    });
  }

  // Borrado de dependencias
  if (Array.isArray(deletions.dependencies) && currentDiagram?.dependencies) {
    deletions.dependencies.forEach((item) => {
      const client = resolveClassId(item.client);
      const supplier = resolveClassId(item.supplier);
      if (client && supplier) {
        const d = currentDiagram.dependencies.find(
          (dep: any) =>
            (dep.clientClassId === client && dep.supplierClassId === supplier) ||
            (dep.clientClassId === supplier && dep.supplierClassId === client)
        );
        if (d) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'dependency',
            op: 'delete',
            dependencyId: d.id,
          });
        }
      }
    });
  }

  // Borrado de asociaciones N-arias
  if (Array.isArray(deletions.naryAssociations) && currentDiagram?.naryAssociations) {
    deletions.naryAssociations.forEach((item) => {
      const nary = currentDiagram.naryAssociations.find((n: any) => n.id === item || (n.name && n.name.toLowerCase().trim() === item.toLowerCase().trim()));
      if (nary) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'naryAssociation',
          op: 'delete',
          naryAssociationId: nary.id,
        });
      }
    });
  }

  // Borrado de atributos
  if (Array.isArray(deletions.attributes)) {
    deletions.attributes.forEach((item) => {
      const cid = resolveClassId(item.class);
      const ec = cid ? Array.from(existingClassesMap.values()).find((c) => c.id === cid) : undefined;
      if (cid && ec && Array.isArray(ec.attributes)) {
        const attr = ec.attributes.find((a: any) => a.name && a.name.toLowerCase().trim() === item.attribute.toLowerCase().trim());
        if (attr) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'deleteAttribute',
            classId: cid,
            memberId: attr.id,
          });
        }
      }
    });
  }

  // Borrado de métodos
  if (Array.isArray(deletions.methods)) {
    deletions.methods.forEach((item) => {
      const cid = resolveClassId(item.class);
      const ec = cid ? Array.from(existingClassesMap.values()).find((c) => c.id === cid) : undefined;
      if (cid && ec && Array.isArray(ec.methods)) {
        const m = ec.methods.find((em: any) => em.name && em.name.toLowerCase().trim() === item.method.toLowerCase().trim());
        if (m) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'deleteMethod',
            classId: cid,
            memberId: m.id,
          });
        }
      }
    });
  }

  // Borrado de clases (al final para respetar orden de miembros)
  if (Array.isArray(deletions.classes)) {
    deletions.classes.forEach((cname) => {
      const cid = resolveClassId(cname);
      if (cid) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'class',
          op: 'delete',
          classId: cid,
        });
      }
    });
  }
}
