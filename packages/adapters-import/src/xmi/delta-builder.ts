import { randomUUID } from 'crypto';
import { gridLayout } from '../xmi21-layout.js';
import type {
  Delta,
  BatchDelta,
  ClassDelta,
  MemberDelta,
  AssociationDelta,
  GeneralizationDelta,
  RealizationDelta,
  DependencyDelta,
  NaryAssociationDelta,
} from '@app/core';
import type { XmiModel } from './types.js';
import { normalizeVisibility } from './types.js';

export function xmiToDeltaBatch(model: XmiModel, diagramId: string): BatchDelta {
  // Promover clasificadores destino de una realización a tipo 'interface'
  // para que el motor aplique la realización sin fallar con RealizationTargetNotInterfaceError.
  const realizationSuppliers = new Set(model.realizations.map(r => r.supplierId));
  for (const c of model.classes) {
    if (realizationSuppliers.has(c.id) && c.kind === 'class') {
      c.kind = 'interface';
      c.isAbstract = true;
    }
  }

  // Construir remapeo de id XMI → UUID para todas las clases
  const classIdMap = new Map<string, string>();
  for (const c of model.classes) {
    classIdMap.set(c.id, randomUUID());
  }

  // Construir clases posicionadas para el diseño en cuadrícula
  const positioned = model.classes.map(c => ({ id: c.id, x: 0, y: 0 }));
  gridLayout(positioned, 150);
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const p of positioned) {
    positionMap.set(p.id, { x: p.x, y: p.y });
  }

  const now = new Date().toISOString();
  const deltas: Delta[] = [];

  // Clases
  for (const c of model.classes) {
    const uuid = classIdMap.get(c.id)!;
    const pos = positionMap.get(c.id)!;
    deltas.push({
      kind: 'class',
      id: randomUUID(),
      diagramId,
      timestamp: now,
      op: 'create',
      classId: uuid,
      name: c.name,
      classKind: c.kind,
      isAbstract: c.isAbstract,
      position: { x: pos.x, y: pos.y },
    } as ClassDelta);

    // La operación create del motor deliberadamente no persiste isAbstract (unidad
    // 12.4: la marca abstracta viaja en un delta `update` de clase).
    if (c.isAbstract) {
      deltas.push({
        kind: 'class',
        id: randomUUID(),
        diagramId,
        timestamp: now,
        op: 'update',
        classId: uuid,
        isAbstract: true,
      } as ClassDelta);
    }

    // Invariante de nombres únicos de miembros por clase
    const usedMemberNames = new Set<string>();

    // Atributos
    for (const attr of c.attributes) {
      let attrName = attr.name;
      if (usedMemberNames.has(attrName)) {
        let counter = 2;
        while (usedMemberNames.has(`${attrName}_${counter}`)) {
          counter++;
        }
        attrName = `${attrName}_${counter}`;
      }
      usedMemberNames.add(attrName);

      deltas.push({
        kind: 'member',
        id: randomUUID(),
        diagramId,
        timestamp: now,
        op: 'addAttribute',
        classId: uuid,
        memberId: randomUUID(),
        name: attrName,
        type: attr.type,
        visibility: normalizeVisibility(attr.visibility),
        ...(attr.isStatic !== undefined ? { isStatic: attr.isStatic } : {}),
        ...(attr.isDerived !== undefined ? { isDerived: attr.isDerived } : {}),
        ...(attr.multiplicity !== undefined ? { multiplicity: attr.multiplicity } : {}),
      } as MemberDelta);
    }

    // Métodos
    for (const method of c.methods) {
      let methodName = method.name;
      if (usedMemberNames.has(methodName)) {
        let counter = 2;
        while (usedMemberNames.has(`${methodName}_${counter}`)) {
          counter++;
        }
        methodName = `${methodName}_${counter}`;
      }
      usedMemberNames.add(methodName);

      deltas.push({
        kind: 'member',
        id: randomUUID(),
        diagramId,
        timestamp: now,
        op: 'addMethod',
        classId: uuid,
        memberId: randomUUID(),
        name: methodName,
        returnType: method.returnType,
        parameters: method.parameters,
        visibility: normalizeVisibility(method.visibility),
        ...(method.isStatic !== undefined ? { isStatic: method.isStatic } : {}),
      } as MemberDelta);
    }
  }

  // Asociaciones
  const seenAssociations = new Set<string>();
  for (const a of model.associations) {
    const sourceUuid = classIdMap.get(a.source);
    const targetUuid = classIdMap.get(a.target);
    if (!sourceUuid || !targetUuid) continue;

    // Deduplicación de asociaciones idénticas (mismo id de elemento en XMI)
    if (a.id && seenAssociations.has(a.id)) continue;
    if (a.id) seenAssociations.add(a.id);

    deltas.push({
      kind: 'association',
      id: randomUUID(),
      diagramId,
      timestamp: now,
      op: 'create',
      associationId: randomUUID(),
      sourceClassId: sourceUuid,
      targetClassId: targetUuid,
      ...(a.name !== undefined ? { name: a.name } : {}),
      ...(a.sourceRole !== undefined ? { sourceRole: a.sourceRole } : {}),
      ...(a.targetRole !== undefined ? { targetRole: a.targetRole } : {}),
      ...(a.sourceMultiplicity !== undefined ? { sourceMultiplicity: a.sourceMultiplicity } : {}),
      ...(a.targetMultiplicity !== undefined ? { targetMultiplicity: a.targetMultiplicity } : {}),
      aggregation: a.aggregation,
      aggregationEnd: a.aggregationEnd,
      ...(a.associationClassId && classIdMap.get(a.associationClassId) ? { associationClassId: classIdMap.get(a.associationClassId) } : {}),
      directed: false,
    } as AssociationDelta);
  }

  // Generalizaciones
  const seenGeneralizations = new Set<string>();
  const genAdj = new Map<string, string[]>();

  function wouldCycle(sub: string, sup: string): boolean {
    if (sub === sup) return true;
    const visited = new Set<string>();
    const stack = [sup];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (curr === sub) return true;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const nexts = genAdj.get(curr) || [];
      for (const n of nexts) stack.push(n);
    }
    return false;
  }

  for (const g of model.generalizations) {
    const subUuid = classIdMap.get(g.subClassId);
    const superUuid = classIdMap.get(g.superClassId);
    if (!subUuid || !superUuid) continue;
    const key = `${subUuid}->${superUuid}`;
    if (seenGeneralizations.has(key)) continue;
    if (wouldCycle(subUuid, superUuid)) continue;
    seenGeneralizations.add(key);
    if (!genAdj.has(subUuid)) genAdj.set(subUuid, []);
    genAdj.get(subUuid)!.push(superUuid);

    deltas.push({
      kind: 'generalization',
      id: randomUUID(),
      diagramId,
      timestamp: now,
      op: 'create',
      generalizationId: randomUUID(),
      subClassId: subUuid,
      superClassId: superUuid,
      ...(g.name !== undefined ? { name: g.name } : {}),
    } as GeneralizationDelta);
  }

  // Realizaciones
  const seenRealizations = new Set<string>();
  for (const r of model.realizations) {
    const clientUuid = classIdMap.get(r.clientId);
    const supplierUuid = classIdMap.get(r.supplierId);
    if (!clientUuid || !supplierUuid || clientUuid === supplierUuid) continue;
    const key = `${clientUuid}->${supplierUuid}`;
    if (seenRealizations.has(key)) continue;
    seenRealizations.add(key);

    deltas.push({
      kind: 'realization',
      id: randomUUID(),
      diagramId,
      timestamp: now,
      op: 'create',
      realizationId: randomUUID(),
      clientClassId: clientUuid,
      supplierInterfaceId: supplierUuid,
      ...(r.name !== undefined ? { name: r.name } : {}),
    } as RealizationDelta);
  }

  // Dependencias
  const seenDependencies = new Set<string>();
  for (const d of model.dependencies) {
    const clientUuid = classIdMap.get(d.clientId);
    const supplierUuid = classIdMap.get(d.supplierId);
    if (!clientUuid || !supplierUuid) continue;
    const key = `${clientUuid}->${supplierUuid}`;
    if (seenDependencies.has(key)) continue;
    seenDependencies.add(key);

    deltas.push({
      kind: 'dependency',
      id: randomUUID(),
      diagramId,
      timestamp: now,
      op: 'create',
      dependencyId: randomUUID(),
      clientClassId: clientUuid,
      supplierClassId: supplierUuid,
      ...(d.name !== undefined ? { name: d.name } : {}),
    } as DependencyDelta);
  }

  // N-arias
  for (const n of model.naryAssociations) {
    const memberEnds = n.memberEnds
      .map(end => {
        const classUuid = classIdMap.get(end.classId);
        if (!classUuid) return null;
        return {
          classId: classUuid,
          multiplicity: end.multiplicity ?? '1',
          ...(end.role !== undefined ? { role: end.role } : {}),
        };
      })
      .filter((end): end is { classId: string; multiplicity: string; role?: string } => end !== null);

    if (memberEnds.length >= 3) {
      deltas.push({
        kind: 'naryAssociation',
        id: randomUUID(),
        diagramId,
        timestamp: now,
        op: 'create',
        naryAssociationId: randomUUID(),
        memberEnds,
        ...(n.name !== undefined ? { name: n.name } : {}),
      } as NaryAssociationDelta);
    }
  }

  return {
    kind: 'batch',
    id: randomUUID(),
    diagramId,
    timestamp: now,
    deltas,
  } as BatchDelta;
}
