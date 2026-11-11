import { DeltaSchema } from '@app/core';
import { repairModelIdentifiers, UUID_RE, RFC3339_RE } from '../repair.js';
import { collapseTernaryHubs, linkAssociationClasses } from './heuristics.js';
export { SYSTEM_PROMPT } from './prompts.js';

/**
 * Limpia y aísla la carga JSON descartando bloques de código markdown
 * o preámbulos/postámbulos conversacionales.
 */
export function cleanAndExtractJson(text: string): string {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/**
 * Normaliza la carga cruda del lote de visión:
 * - Asegura campos base de lote
 * - Mapea nombres de clase a IDs
 * - Asigna coordenadas razonables si faltan
 * - Repara identificadores con repairModelIdentifiers
 */
export function normalizeBatchPayload(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.deltas) && obj.kind !== 'batch') {
    return raw;
  }

  const batchId = typeof obj.id === 'string' && UUID_RE.test(obj.id) ? obj.id : crypto.randomUUID();
  const diagramId =
    typeof obj.diagramId === 'string' && UUID_RE.test(obj.diagramId) ? obj.diagramId : crypto.randomUUID();
  const timestamp =
    typeof obj.timestamp === 'string' && RFC3339_RE.test(obj.timestamp)
      ? obj.timestamp
      : new Date().toISOString();

  const rawDeltas = Array.isArray(obj.deltas) ? obj.deltas : [];

  // 1. Identifica y de-duplica clases para crear un mapa de nombres a IDs
  const nameToId = new Map<string, string>();
  const seenClassNames = new Map<string, string>();
  const validClassIds = new Set<string>();
  const deduplicatedClassDeltas: Record<string, unknown>[] = [];
  const extractedMemberDeltas: Record<string, unknown>[] = [];

  let classIndex = 0;
  for (const item of rawDeltas) {
    if (typeof item === 'object' && item !== null) {
      const d = { ...(item as Record<string, unknown>) };
      if (d.kind === 'class') {
        const rawName = typeof d.name === 'string' ? d.name.trim() : '';
        const normName = rawName.toLowerCase();

        if (normName && seenClassNames.has(normName)) {
          const existingId = seenClassNames.get(normName)!;
          if (typeof d.classId === 'string') {
            nameToId.set(d.classId.toLowerCase().trim(), existingId);
            nameToId.set(d.classId.trim(), existingId);
          }
          continue;
        }

        const classId =
          typeof d.classId === 'string' && d.classId.trim().length > 0
            ? d.classId
            : rawName.length > 0
            ? rawName
            : `class_${classIndex + 1}`;
        d.classId = classId;
        d.op = 'create';

        if (rawName) {
          seenClassNames.set(normName, classId);
          nameToId.set(normName, classId);
          nameToId.set(rawName, classId);
        }
        nameToId.set(classId.toLowerCase().trim(), classId);
        nameToId.set(classId.trim(), classId);
        validClassIds.add(classId);

        if (Array.isArray(d.attributes)) {
          for (const attr of d.attributes) {
            if (typeof attr === 'object' && attr !== null) {
              extractedMemberDeltas.push({ ...(attr as Record<string, unknown>), kind: 'attribute', classId });
            }
          }
        }
        if (Array.isArray(d.methods)) {
          for (const meth of d.methods) {
            if (typeof meth === 'object' && meth !== null) {
              extractedMemberDeltas.push({ ...(meth as Record<string, unknown>), kind: 'method', classId });
            }
          }
        }
        if (Array.isArray(d.members)) {
          for (const m of d.members) {
            if (typeof m === 'object' && m !== null) {
              extractedMemberDeltas.push({ ...(m as Record<string, unknown>), classId });
            }
          }
        }

        const cleanClass: Record<string, unknown> = {
          kind: 'class',
          op: 'create',
          classId,
        };
        if (rawName) cleanClass.name = rawName;
        if (d.position && typeof d.position === 'object') cleanClass.position = d.position;
        if (d.classKind === 'class' || d.classKind === 'interface') cleanClass.classKind = d.classKind;
        if (typeof d.isAbstract === 'boolean') cleanClass.isAbstract = d.isAbstract;
        if (typeof d.id === 'string') cleanClass.id = d.id;
        if (typeof d.diagramId === 'string') cleanClass.diagramId = d.diagramId;
        if (typeof d.timestamp === 'string') cleanClass.timestamp = d.timestamp;

        deduplicatedClassDeltas.push(cleanClass);
        classIndex++;
      }
    }
  }

  // 2. Resuelve referencias a IDs conocidos con coincidencia flexible
  const resolveId = (idCandidate: unknown): string | undefined => {
    if (typeof idCandidate !== 'string') return undefined;
    const raw = idCandidate.trim();
    if (!raw) return undefined;

    const direct = nameToId.get(raw.toLowerCase()) ?? nameToId.get(raw);
    if (direct && (validClassIds.size === 0 || validClassIds.has(direct))) {
      return direct;
    }

    const cleanKey = raw
      .replace(/^(?:class_|cls_|class\s+|interface\s+|<<interface>>\s*|<<abstract>>\s*)/i, '')
      .replace(/[:"']/g, '')
      .trim()
      .toLowerCase();

    const cleanMatch = nameToId.get(cleanKey);
    if (cleanMatch && (validClassIds.size === 0 || validClassIds.has(cleanMatch))) {
      return cleanMatch;
    }

    if (cleanKey.endsWith('es') && cleanKey.length > 3) {
      const singular = cleanKey.slice(0, -2);
      const m = nameToId.get(singular);
      if (m && (validClassIds.size === 0 || validClassIds.has(m))) return m;
    }
    if (cleanKey.endsWith('s') && cleanKey.length > 2) {
      const singular = cleanKey.slice(0, -1);
      const m = nameToId.get(singular);
      if (m && (validClassIds.size === 0 || validClassIds.has(m))) return m;
    }

    if (cleanKey.length >= 3) {
      const matches: string[] = [];
      for (const [normName, cid] of seenClassNames.entries()) {
        if (normName === cleanKey || normName.startsWith(cleanKey) || cleanKey.startsWith(normName)) {
          if (!matches.includes(cid)) matches.push(cid);
        }
      }
      if (matches.length === 1) {
        return matches[0];
      }
    }

    if (validClassIds.size === 0) return raw;
    return validClassIds.has(raw) ? raw : undefined;
  };

  const multRegex = /^\*|^\d+$|^\d+\.\.\d+$|^\d+\.\.\*$/;
  const cleanMultiplicity = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    let s = val.replace(/\s+/g, '');
    if (!s) return undefined;
    s = s.replace(/\b[nNmM]\b/g, '*');
    s = s.replace(/\.\.[nNmM]/g, '..*');
    s = s.replace(/[nNmM]\.\./g, '*..');
    return multRegex.test(s) ? s : undefined;
  };

  let placedCount = 0;
  const normalizedClassDeltas = deduplicatedClassDeltas.map((d) => {
    d.id = typeof d.id === 'string' && UUID_RE.test(d.id) ? d.id : crypto.randomUUID();
    d.diagramId = diagramId;
    d.timestamp =
      typeof d.timestamp === 'string' && RFC3339_RE.test(d.timestamp) ? d.timestamp : timestamp;

    const pos = d.position as Record<string, unknown> | undefined;
    if (
      !pos ||
      typeof pos !== 'object' ||
      typeof pos.x !== 'number' ||
      !Number.isFinite(pos.x) ||
      typeof pos.y !== 'number' ||
      !Number.isFinite(pos.y)
    ) {
      d.position = {
        x: 100 + (placedCount % 3) * 280,
        y: 100 + Math.floor(placedCount / 3) * 220,
      };
    }
    placedCount++;
    return d;
  });

  const memberDeltas: Record<string, unknown>[] = [];
  const generalizationDeltas: Record<string, unknown>[] = [];
  const realizationDeltas: Record<string, unknown>[] = [];
  const associationDeltas: Record<string, unknown>[] = [];
  const dependencyDeltas: Record<string, unknown>[] = [];
  const naryAssociationDeltas: Record<string, unknown>[] = [];
  const otherDeltas: Record<string, unknown>[] = [];

  const allItemsToProcess = [...rawDeltas, ...extractedMemberDeltas];

  for (const item of allItemsToProcess) {
    if (typeof item !== 'object' || item === null) continue;
    const d = { ...(item as Record<string, unknown>) };
    if (d.kind === 'class') {
      continue;
    }

    d.id = typeof d.id === 'string' && UUID_RE.test(d.id) ? d.id : crypto.randomUUID();
    d.diagramId = diagramId;
    d.timestamp =
      typeof d.timestamp === 'string' && RFC3339_RE.test(d.timestamp) ? d.timestamp : timestamp;

    const isMemberKind =
      d.kind === 'member' ||
      d.kind === 'attribute' ||
      d.kind === 'method' ||
      d.kind === 'property' ||
      d.kind === 'field' ||
      d.kind === 'operation' ||
      d.kind === 'function';

    if (isMemberKind) {
      const rawCid =
        d.classId ?? d.className ?? d.class ?? d.targetClassId ?? d.ownerClassId ?? d.table ?? d.entity;
      const resolvedClassId = resolveId(rawCid);
      if (resolvedClassId) {
        const isExplicitMethodKind =
          d.kind === 'method' || d.kind === 'operation' || d.kind === 'function';
        const isExplicitAttrKind =
          d.kind === 'attribute' || d.kind === 'property' || d.kind === 'field';
        const memberType = String(d.memberType ?? d.type ?? '').toLowerCase();
        const hasMethodOp =
          d.op === 'addMethod' || d.op === 'editMethod' || d.op === 'deleteMethod';
        const hasReturnType = typeof d.returnType === 'string' && d.returnType.trim().length > 0;
        const hasParams =
          (Array.isArray(d.parameters) && d.parameters.length > 0) ||
          (Array.isArray(d.params) && d.params.length > 0) ||
          (Array.isArray(d.args) && d.args.length > 0);
        const rawName = typeof d.name === 'string' ? d.name.trim() : '';
        const nameLooksLikeMethod = /\(.*\)/.test(rawName);

        const isMethod =
          !isExplicitAttrKind &&
          (isExplicitMethodKind ||
            memberType === 'method' ||
            hasMethodOp ||
            hasReturnType ||
            hasParams ||
            nameLooksLikeMethod);

        let cleanOp:
          | 'addAttribute'
          | 'editAttribute'
          | 'deleteAttribute'
          | 'addMethod'
          | 'editMethod'
          | 'deleteMethod' = isMethod ? 'addMethod' : 'addAttribute';
        if (d.op === 'editMethod' || d.op === 'deleteMethod') cleanOp = d.op;
        if (d.op === 'editAttribute' || d.op === 'deleteAttribute') cleanOp = d.op;

        let cleanName = rawName;
        const inlineParams: { name: string; type: string }[] = [];
        if (nameLooksLikeMethod) {
          const match = rawName.match(/^([^(]+)\((.*)\)$/);
          if (match) {
            cleanName = match[1].trim();
            const paramStr = match[2].trim();
            if (paramStr) {
              const paramParts = paramStr.split(',');
              for (const part of paramParts) {
                const [pName, pType] = part.split(':');
                if (pName && pName.trim()) {
                  inlineParams.push({
                    name: pName.trim(),
                    type: pType ? pType.trim() : 'any',
                  });
                }
              }
            }
          }
        }
        if (!cleanName) {
          cleanName = isMethod ? 'method' : 'attribute';
        }

        const memberId =
          typeof d.memberId === 'string' && UUID_RE.test(d.memberId)
            ? d.memberId
            : typeof d.memberId === 'string' && d.memberId.trim()
            ? d.memberId.trim()
            : crypto.randomUUID();

        let visibility: '+' | '-' | '#' | '~' | undefined;
        const rawVis = String(d.visibility ?? '').trim().toLowerCase();
        if (rawVis === '+' || rawVis === 'public') visibility = '+';
        else if (rawVis === '-' || rawVis === 'private') visibility = '-';
        else if (rawVis === '#' || rawVis === 'protected') visibility = '#';
        else if (rawVis === '~' || rawVis === 'package' || rawVis === 'internal') visibility = '~';

        const cleanMember: Record<string, unknown> = {
          kind: 'member',
          op: cleanOp,
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          classId: resolvedClassId,
          memberId,
          name: cleanName,
        };

        if (isMethod) {
          const returnType =
            typeof d.returnType === 'string' && d.returnType.trim()
              ? d.returnType.trim()
              : typeof d.type === 'string' && d.type.trim() && d.type.trim().toLowerCase() !== 'method'
              ? d.type.trim()
              : 'void';
          cleanMember.returnType = returnType;

          const rawParams = Array.isArray(d.parameters)
            ? d.parameters
            : Array.isArray(d.params)
            ? d.params
            : Array.isArray(d.args)
            ? d.args
            : inlineParams;

          const cleanParams: { name: string; type: string }[] = [];
          for (const p of rawParams) {
            if (typeof p === 'object' && p !== null) {
              const pObj = p as Record<string, unknown>;
              const pName = typeof pObj.name === 'string' && pObj.name.trim() ? pObj.name.trim() : 'arg';
              const pType = typeof pObj.type === 'string' && pObj.type.trim() ? pObj.type.trim() : 'any';
              cleanParams.push({ name: pName, type: pType });
            } else if (typeof p === 'string' && p.trim()) {
              const parts = p.split(':');
              cleanParams.push({
                name: parts[0]?.trim() || 'arg',
                type: parts[1]?.trim() || 'any',
              });
            }
          }
          cleanMember.parameters = cleanParams;
        } else {
          const type =
            typeof d.type === 'string' && d.type.trim() && d.type.trim().toLowerCase() !== 'attribute'
              ? d.type.trim()
              : typeof d.dataType === 'string' && d.dataType.trim()
              ? d.dataType.trim()
              : 'String';
          cleanMember.type = type;
        }

        if (visibility) cleanMember.visibility = visibility;
        if (typeof d.isStatic === 'boolean') cleanMember.isStatic = d.isStatic;
        if (typeof d.isDerived === 'boolean') cleanMember.isDerived = d.isDerived;
        if (typeof d.multiplicity === 'string' && d.multiplicity.trim()) {
          const m = cleanMultiplicity(d.multiplicity);
          if (m) cleanMember.multiplicity = m;
        }

        memberDeltas.push(cleanMember);
      }
    } else if (
      d.kind === 'generalization' ||
      d.kind === 'inheritance' ||
      d.kind === 'extends' ||
      d.kind === 'generalize'
    ) {
      const rawSub = d.subClassId ?? d.sub ?? d.child ?? d.source ?? d.sourceClassId;
      const rawSup = d.superClassId ?? d.super ?? d.parent ?? d.target ?? d.targetClassId;
      const sub = resolveId(rawSub);
      const sup = resolveId(rawSup);
      if (sub && sup && sub !== sup) {
        const cleanGen: Record<string, unknown> = {
          kind: 'generalization',
          op: 'create',
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          generalizationId: typeof d.generalizationId === 'string' && UUID_RE.test(d.generalizationId)
            ? d.generalizationId
            : crypto.randomUUID(),
          subClassId: sub,
          superClassId: sup,
        };
        if (typeof d.name === 'string' && d.name.trim()) cleanGen.name = d.name.trim();
        generalizationDeltas.push(cleanGen);
      }
    } else if (
      d.kind === 'realization' ||
      d.kind === 'implementation' ||
      d.kind === 'implements' ||
      d.kind === 'realize'
    ) {
      const rawClient = d.clientClassId ?? d.client ?? d.source ?? d.sourceClassId;
      const rawSupplier = d.supplierInterfaceId ?? d.supplier ?? d.interface ?? d.target ?? d.targetClassId;
      const client = resolveId(rawClient);
      const supplier = resolveId(rawSupplier);
      if (client && supplier) {
        const cleanReal: Record<string, unknown> = {
          kind: 'realization',
          op: 'create',
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          realizationId: typeof d.realizationId === 'string' && UUID_RE.test(d.realizationId)
            ? d.realizationId
            : crypto.randomUUID(),
          clientClassId: client,
          supplierInterfaceId: supplier,
        };
        if (typeof d.name === 'string' && d.name.trim()) cleanReal.name = d.name.trim();
        realizationDeltas.push(cleanReal);
      }
    } else if (
      d.kind === 'association' ||
      d.kind === 'composition' ||
      d.kind === 'aggregation' ||
      d.kind === 'relation' ||
      d.kind === 'relationship' ||
      d.kind === 'binaryAssociation' ||
      d.kind === 'link' ||
      d.kind === 'edge' ||
      d.kind === 'connection' ||
      d.kind === 'associationClass' ||
      d.kind === 'association_class'
    ) {
      const rawSrc = d.sourceClassId ?? d.sourceId ?? d.source ?? d.from ?? d.clientClassId ?? d.client;
      const rawTgt = d.targetClassId ?? d.targetId ?? d.target ?? d.to ?? d.supplierClassId ?? d.supplier;
      const src = resolveId(rawSrc);
      const tgt = resolveId(rawTgt);
      if (src && tgt) {
        const rawAgg = String(
          d.aggregation ??
          (d.kind === 'composition' ? 'composite' : d.kind === 'aggregation' ? 'shared' : ''),
        ).toLowerCase();

        let aggKind: 'none' | 'shared' | 'composite' = 'none';
        if (rawAgg === 'composite' || rawAgg === 'composition') {
          aggKind = 'composite';
        } else if (rawAgg === 'shared' || rawAgg === 'aggregation') {
          aggKind = 'shared';
        }

        const cleanAssoc: Record<string, unknown> = {
          kind: 'association',
          op: 'create',
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          associationId: typeof d.associationId === 'string' && UUID_RE.test(d.associationId)
            ? d.associationId
            : crypto.randomUUID(),
          sourceClassId: src,
          targetClassId: tgt,
          // En UML 2.5.1, una asociación por defecto es no dirigida (línea simple sin flechas)
          directed: typeof d.directed === 'boolean' ? d.directed : false,
          aggregation: aggKind,
        };

        if (aggKind !== 'none') {
          cleanAssoc.aggregationEnd = d.aggregationEnd === 'target' ? 'target' : 'source';
        }

        const sm = cleanMultiplicity(d.sourceMultiplicity);
        if (sm) cleanAssoc.sourceMultiplicity = sm;
        const tm = cleanMultiplicity(d.targetMultiplicity);
        if (tm) cleanAssoc.targetMultiplicity = tm;

        const rawAssocClass =
          d.associationClassId ??
          d.associationClass ??
          d.association_class ??
          (String(d.kind).toLowerCase().includes('associationclass') ? (d.classId ?? d.assocClass) : undefined);
        const assocClass = resolveId(rawAssocClass);
        if (assocClass) {
          cleanAssoc.associationClassId = assocClass;
        }

        if (typeof d.name === 'string' && d.name.trim()) cleanAssoc.name = d.name.trim();
        if (typeof d.sourceRole === 'string' && d.sourceRole.trim()) cleanAssoc.sourceRole = d.sourceRole.trim();
        if (typeof d.targetRole === 'string' && d.targetRole.trim()) cleanAssoc.targetRole = d.targetRole.trim();

        associationDeltas.push(cleanAssoc);
      }
    } else if (d.kind === 'dependency' || d.kind === 'depends' || d.kind === 'depend') {
      const rawClient = d.clientClassId ?? d.client ?? d.source ?? d.sourceClassId;
      const rawSupplier = d.supplierClassId ?? d.supplier ?? d.target ?? d.targetClassId;
      const client = resolveId(rawClient);
      const supplier = resolveId(rawSupplier);
      if (client && supplier) {
        const cleanDep: Record<string, unknown> = {
          kind: 'dependency',
          op: 'create',
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          dependencyId: typeof d.dependencyId === 'string' && UUID_RE.test(d.dependencyId)
            ? d.dependencyId
            : crypto.randomUUID(),
          clientClassId: client,
          supplierClassId: supplier,
        };
        if (typeof d.name === 'string' && d.name.trim()) cleanDep.name = d.name.trim();
        dependencyDeltas.push(cleanDep);
      }
    } else if (
      (d.kind === 'naryAssociation' || d.kind === 'ternary' || d.kind === 'ternaryAssociation' || d.kind === 'nary') &&
      Array.isArray(d.memberEnds)
    ) {
      const seenEnds = new Set<string>();
      const survivingEnds = (d.memberEnds as Record<string, unknown>[])
        .map((end) => {
          const cid = resolveId(end.classId);
          if (!cid || seenEnds.has(cid)) return null;
          seenEnds.add(cid);
          const mult = cleanMultiplicity(end.multiplicity) ?? '1';
          const role = typeof end.role === 'string' && end.role.trim() ? end.role.trim() : undefined;
          return {
            classId: cid,
            multiplicity: mult,
            ...(role ? { role } : {}),
          };
        })
        .filter((end): end is { classId: string; multiplicity: string; role?: string } => end !== null);
      if (survivingEnds.length >= 3) {
        const cleanNary: Record<string, unknown> = {
          kind: 'naryAssociation',
          op: 'create',
          id: d.id,
          diagramId: d.diagramId,
          timestamp: d.timestamp,
          naryAssociationId: typeof d.naryAssociationId === 'string' && UUID_RE.test(d.naryAssociationId)
            ? d.naryAssociationId
            : crypto.randomUUID(),
          memberEnds: survivingEnds,
        };
        if (typeof d.name === 'string' && d.name.trim()) cleanNary.name = d.name.trim();
        naryAssociationDeltas.push(cleanNary);
      }
    } else {
      otherDeltas.push(d);
    }
  }

  // Detección y colapso heurístico de rombos ternarios/n-arios
  collapseTernaryHubs(
    normalizedClassDeltas,
    memberDeltas,
    associationDeltas,
    naryAssociationDeltas,
    diagramId,
    timestamp,
    cleanMultiplicity,
  );

  // Detección y enlace heurístico de clases de asociación
  linkAssociationClasses(
    normalizedClassDeltas,
    associationDeltas,
    dependencyDeltas,
    generalizationDeltas,
    realizationDeltas,
    naryAssociationDeltas,
  );

  const validOtherDeltas: Record<string, unknown>[] = [];
  for (const od of otherDeltas) {
    if (typeof od === 'object' && od !== null && typeof (od as Record<string, unknown>).kind === 'string') {
      const parsed = DeltaSchema.safeParse(od);
      if (parsed.success) {
        validOtherDeltas.push(od);
      }
    }
  }

  const normalizedDeltas = [
    ...normalizedClassDeltas,
    ...memberDeltas,
    ...generalizationDeltas,
    ...realizationDeltas,
    ...associationDeltas,
    ...dependencyDeltas,
    ...naryAssociationDeltas,
    ...validOtherDeltas,
  ];

  const normalizedBatch = {
    kind: 'batch',
    id: batchId,
    diagramId,
    timestamp,
    deltas: normalizedDeltas,
  };

  return repairModelIdentifiers(normalizedBatch);
}
