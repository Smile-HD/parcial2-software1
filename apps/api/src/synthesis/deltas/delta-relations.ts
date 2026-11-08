import crypto from 'node:crypto';
import type { DeltaExpansionContext } from './context.js';
import type { SemanticDomainModel, SemanticUpdates } from '../types.js';
import {
  cleanMultiplicity,
  cleanClassName,
  toCanonicalKey,
  extractExplicitMultiplicities,
  isHeuristicComposition,
  generateDefaultAttributesForClass,
} from './delta-helpers.js';

/**
 * Procesa actualizaciones de asociaciones simples y n-arias.
 */
export function applyRelationUpdates(
  ctx: DeltaExpansionContext,
  updates?: SemanticUpdates,
  model?: SemanticDomainModel
): void {
  if (!updates) return;
  const { diagramId, timestamp, deltas, classIdMap, currentDiagram, resolveClassId, getPairKey, seenConnectedPairs } = ctx;

  if (Array.isArray(updates.associations)) {
    for (const u of updates.associations) {
      const sourceId = resolveClassId(u.source);
      const targetId = resolveClassId(u.target);
      if (sourceId && targetId) {
        const isRecursive = sourceId === targetId;
        const existingAssoc = currentDiagram?.associations?.find((a: any) => {
          if (isRecursive) return a.sourceClassId === sourceId && a.targetClassId === sourceId;
          return (
            (a.sourceClassId === sourceId && a.targetClassId === targetId) ||
            (a.sourceClassId === targetId && a.targetClassId === sourceId)
          );
        });
        if (existingAssoc) {
          let assocClassId = u.associationClass ? resolveClassId(u.associationClass) : undefined;
          if (u.associationClass && !assocClassId && model?.classes) {
            const mc = model.classes.find((c) => c.name.toLowerCase() === u.associationClass!.toLowerCase());
            if (mc) {
              assocClassId = crypto.randomUUID();
              const clean = cleanClassName(mc.name);
              classIdMap.set(toCanonicalKey(clean), assocClassId);
              classIdMap.set(clean.toLowerCase(), assocClassId);
            }
          }
          const updateDelta: any = {
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'association',
            op: 'updateMultiplicity',
            associationId: existingAssoc.id,
            aggregation: u.aggregation ?? existingAssoc.aggregation ?? 'none',
            aggregationEnd: u.aggregationEnd ?? existingAssoc.aggregationEnd ?? 'source',
          };
          if (u.sourceMultiplicity) updateDelta.newSourceMultiplicity = cleanMultiplicity(u.sourceMultiplicity);
          if (u.targetMultiplicity) updateDelta.newTargetMultiplicity = cleanMultiplicity(u.targetMultiplicity);
          if (u.name !== undefined) updateDelta.name = u.name;
          if (u.sourceRole !== undefined) updateDelta.sourceRole = u.sourceRole;
          if (u.targetRole !== undefined) updateDelta.targetRole = u.targetRole;
          if (assocClassId) {
            updateDelta.newAssociationClassId = assocClassId;
            updateDelta.associationClassId = assocClassId;
          } else if (u.associationClass === null) {
            updateDelta.newAssociationClassId = null;
          }
          deltas.push(updateDelta);
          const pair = isRecursive ? `${sourceId}::${sourceId}` : getPairKey(sourceId, targetId);
          seenConnectedPairs.add(pair);
        }
      }
    }
  }

  if (Array.isArray(updates.naryAssociations) && currentDiagram?.naryAssociations) {
    for (const u of updates.naryAssociations) {
      const nary = currentDiagram.naryAssociations.find(
        (n: any) => (u.naryAssociationId && n.id === u.naryAssociationId) || (u.name && n.name === u.name)
      );
      if (nary) {
        const updateDelta: any = {
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'naryAssociation',
          op: 'update',
          naryAssociationId: nary.id,
        };
        if (u.name !== undefined) updateDelta.name = u.name;
        if (Array.isArray(u.memberEnds)) {
          const mappedEnds: any[] = [];
          for (const me of u.memberEnds) {
            const cid = resolveClassId(me.class);
            if (cid) {
              mappedEnds.push({
                classId: cid,
                multiplicity: cleanMultiplicity(me.multiplicity, '1'),
                role: me.role,
              });
            }
          }
          if (mappedEnds.length >= 3) {
            updateDelta.memberEnds = mappedEnds;
          }
        }
        deltas.push(updateDelta);
      }
    }
  }
}

/**
 * Procesa asociaciones, composiciones y agregaciones binarias y recursivas.
 */
export function applyAssociationsDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.associations)) return;
  const { diagramId, timestamp, deltas, classIdMap, seenConnectedPairs, currentDiagram, originText, resolveClassId, getPairKey } = ctx;

  model.associations.forEach((assoc) => {
    // Si era una generalización o realización ya procesada
    const isGen =
      (assoc.name && /^(generaliz|hered|herencia|is_a|subclass)/i.test(assoc.name)) ||
      ((assoc as any).type && /^(generaliz|hered|herencia|is_a|subclass)/i.test((assoc as any).type));
    if (isGen) return;

    const isRealiz = assoc.name && /^(implement|realiz)/i.test(assoc.name);
    if (isRealiz) return;

    const isDep = assoc.name && /^(depend|usa|uses)/i.test(assoc.name);
    if (isDep) return;

    const sourceId = resolveClassId(assoc.source);
    const targetId = resolveClassId(assoc.target);

    if (!sourceId || !targetId) return;

    const isRecursive = sourceId === targetId;
    const pair = isRecursive ? `${sourceId}::${sourceId}` : getPairKey(sourceId, targetId);
    // CERO DUPLICADOS: Si este par ya tiene generalización, realización o asociación previa en ESTE LOTE, DESCARTAR
    if (seenConnectedPairs.has(pair)) return;

    let assocClassId = assoc.associationClass
      ? resolveClassId(assoc.associationClass)
      : undefined;

    // Si la clase de asociación intermedia no fue creada aún, crearla explícitamente en el lote
    if (assoc.associationClass && !assocClassId) {
      const acName = cleanClassName(assoc.associationClass);
      const acLower = acName.toLowerCase();
      const acCanon = toCanonicalKey(acName);
      assocClassId = crypto.randomUUID();
      classIdMap.set(acCanon, assocClassId);
      classIdMap.set(acLower, assocClassId);
      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'class',
        op: 'create',
        classId: assocClassId,
        name: acName,
        classKind: 'class',
        isAbstract: false,
        position: { x: 360, y: 380 },
      });
      const defaultAttrs = generateDefaultAttributesForClass(acName);
      for (const da of defaultAttrs) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'member',
          op: 'addAttribute',
          classId: assocClassId,
          memberId: crypto.randomUUID(),
          name: da.name,
          type: da.type,
          visibility: '+',
          isStatic: false,
          isDerived: false,
        });
      }
    }

    // 1. Obtener nombres reales de las entidades para validar semántica OOAD
    const sourceName = currentDiagram?.classes?.find((c: any) => c.id === sourceId)?.name || assoc.source;
    const targetName = currentDiagram?.classes?.find((c: any) => c.id === targetId)?.name || assoc.target;

    // 2. Guardrail de Composición: nunca permitir composición en reflexivas ni entre entidades independientes
    const isRequestedComposite = assoc.aggregation === 'composite' || (assoc as any).type === 'composition';
    const isRequestedShared = assoc.aggregation === 'shared' || (assoc as any).type === 'aggregation';

    const isExplicitInText = !!originText && /(?:composici[oó]n|composision|composite)\b/i.test(originText);
    const canBeComposite = isRequestedComposite && !isRecursive && (isExplicitInText || isHeuristicComposition(sourceName, targetName, !!assocClassId || !!assoc.associationClass) || isHeuristicComposition(targetName, sourceName, !!assocClassId || !!assoc.associationClass));
    const targetAggregation = canBeComposite ? 'composite' : (isRequestedShared ? 'shared' : 'none');
    const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;
    const targetEnd = (canBeComposite || isRequestedShared)
      ? (assoc.aggregationEnd ?? (childPattern.test(sourceName) && !childPattern.test(targetName) ? 'target' : 'source'))
      : 'source';

    // 3. Verificar si ya existe una asociación entre este par en el lienzo actual
    const existingAssoc = currentDiagram?.associations?.find((a: any) => {
      if (isRecursive) {
        return a.sourceClassId === sourceId && a.targetClassId === sourceId;
      }
      return (
        (a.sourceClassId === sourceId && a.targetClassId === targetId) ||
        (a.sourceClassId === targetId && a.targetClassId === sourceId)
      );
    });

    if (existingAssoc) {
      // Cero duplicados: Si existían múltiples asociaciones paralelas entre este mismo par, eliminamos los zombies
      const duplicateAssocs = currentDiagram?.associations?.filter((a: any) =>
        a.id !== existingAssoc.id &&
        ((a.sourceClassId === sourceId && a.targetClassId === targetId) ||
         (a.sourceClassId === targetId && a.targetClassId === sourceId))
      ) || [];
      for (const dup of duplicateAssocs) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'association',
          op: 'delete',
          associationId: dup.id,
        });
      }

      // Sanitizar nombres inválidos que son palabras funcionales o tipos de relación
      const invalidAssocNames = /^(?:un|una|el|la|los|las|por|de|a|con|para|generalizaci[oó]n|composici[oó]n|agregaci[oó]n|asociaci[oó]n|realizaci[oó]n|dependencia|inheritance|composition|aggregation|association|dependency|realization)$/i;
      const sanitizedAssocName = (assoc.name && !invalidAssocNames.test(assoc.name.trim())) ? assoc.name : undefined;

      // Verificar si la relación propuesta realmente introduce cambios respecto a la del lienzo
      let newSourceMult = assoc.sourceMultiplicity ? cleanMultiplicity(assoc.sourceMultiplicity, isRecursive ? '0..1' : '1') : undefined;
      let newTargetMult = assoc.targetMultiplicity ? cleanMultiplicity(assoc.targetMultiplicity, isRecursive ? '0..*' : '0..*') : undefined;

      if (originText) {
        const explicit = extractExplicitMultiplicities(originText, sourceName, targetName);
        if (explicit) {
          if (explicit.sourceMultiplicity) newSourceMult = explicit.sourceMultiplicity;
          if (explicit.targetMultiplicity) newTargetMult = explicit.targetMultiplicity;
        }
      }

      if (targetAggregation === 'composite' && newSourceMult) {
        if (newSourceMult === '*' || newSourceMult === '0..*' || newSourceMult === '1..*') {
          newSourceMult = '1';
        }
      }

      const aggregationChanged = targetAggregation !== (existingAssoc.aggregation ?? 'none');
      const endChanged = targetEnd !== existingAssoc.aggregationEnd;
      const multChanged = (newSourceMult !== undefined && newSourceMult !== existingAssoc.sourceMultiplicity) ||
                          (newTargetMult !== undefined && newTargetMult !== existingAssoc.targetMultiplicity);
      const metaChanged = (sanitizedAssocName !== undefined && sanitizedAssocName !== existingAssoc.name) ||
                          (assoc.sourceRole !== undefined && assoc.sourceRole !== existingAssoc.sourceRole) ||
                          (assoc.targetRole !== undefined && assoc.targetRole !== existingAssoc.targetRole) ||
                          (assocClassId !== undefined && assocClassId !== existingAssoc.associationClassId);

      if (aggregationChanged || endChanged || multChanged || metaChanged) {
        const updateDelta: any = {
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'association',
          op: 'updateMultiplicity',
          associationId: existingAssoc.id,
          aggregation: targetAggregation,
          aggregationEnd: targetEnd,
        };

        if (newSourceMult) updateDelta.newSourceMultiplicity = newSourceMult;
        if (newTargetMult) updateDelta.newTargetMultiplicity = newTargetMult;
        if (sanitizedAssocName !== undefined) updateDelta.name = sanitizedAssocName;
        if (assoc.sourceRole !== undefined) updateDelta.sourceRole = assoc.sourceRole;
        if (assoc.targetRole !== undefined) updateDelta.targetRole = assoc.targetRole;
        if (assocClassId) {
          updateDelta.newAssociationClassId = assocClassId;
        } else if (assoc.associationClass === null) {
          updateDelta.newAssociationClassId = null;
        }

        deltas.push(updateDelta);
      }

      seenConnectedPairs.add(pair);
      return;
    }

    // Si no existía previamente, crear la asociación
    let finalSrcMult = cleanMultiplicity(assoc.sourceMultiplicity, isRecursive ? '0..1' : '1');
    let finalTgtMult = cleanMultiplicity(assoc.targetMultiplicity, isRecursive ? '0..*' : '0..*');

    if (originText) {
      const explicit = extractExplicitMultiplicities(originText, sourceName, targetName);
      if (explicit) {
        if (explicit.sourceMultiplicity) finalSrcMult = explicit.sourceMultiplicity;
        if (explicit.targetMultiplicity) finalTgtMult = explicit.targetMultiplicity;
      }
    }

    // Invariante UML 2.5.1: si la relación es Composición, el extremo contenedor (source) NUNCA puede ser *
    if (targetAggregation === 'composite') {
      if (finalSrcMult === '*' || finalSrcMult === '0..*' || finalSrcMult === '1..*') {
        finalSrcMult = '1';
      }
    }

    const assocDelta: any = {
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'association',
      op: 'create',
      associationId: crypto.randomUUID(),
      sourceClassId: sourceId,
      targetClassId: targetId,
      sourceMultiplicity: finalSrcMult,
      targetMultiplicity: finalTgtMult,
      directed: assoc.directed ?? false,
      aggregation: targetAggregation,
      aggregationEnd: targetEnd,
    };

    if (assoc.name) assocDelta.name = assoc.name;
    if (assoc.sourceRole) assocDelta.sourceRole = assoc.sourceRole;
    if (assoc.targetRole) assocDelta.targetRole = assoc.targetRole;
    if (assocClassId) assocDelta.associationClassId = assocClassId;

    deltas.push(assocDelta);
    seenConnectedPairs.add(pair);
  });
}

/**
 * Conectividad del grafo: garantiza que ninguna clase creada quede aislada sin relación.
 */
export function applyIsolatedClassesHeuristic(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.classes) || model.classes.length <= 1) return;
  const { diagramId, timestamp, deltas, seenConnectedPairs, currentDiagram, getPairKey } = ctx;

  const createdClassIds = Array.from(new Set(
    deltas.filter((d: any) => d.kind === 'class' && d.op === 'create').map((d: any) => d.classId)
  ));

  const anchorClassId = createdClassIds[0] || (currentDiagram?.classes?.[0]?.id as string | undefined);

  if (anchorClassId) {
    for (const cid of createdClassIds) {
      if (cid === anchorClassId) continue;
      let hasAnyConnection = false;
      for (const pair of seenConnectedPairs) {
        if (pair.includes(cid)) {
          hasAnyConnection = true;
          break;
        }
      }

      if (!hasAnyConnection) {
        const pair = getPairKey(anchorClassId, cid);
        if (!seenConnectedPairs.has(pair)) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'association',
            op: 'create',
            associationId: crypto.randomUUID(),
            sourceClassId: anchorClassId,
            targetClassId: cid,
            sourceMultiplicity: '1',
            targetMultiplicity: '0..*',
            directed: false,
            aggregation: 'none',
            aggregationEnd: 'source',
          });
          seenConnectedPairs.add(pair);
        }
      }
    }
  }
}

/**
 * Procesa asociaciones N-arias (3 o más extremos con rombo central).
 */
export function applyNaryDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.naryAssociations)) return;
  const { diagramId, timestamp, deltas, resolveClassId } = ctx;

  model.naryAssociations.forEach((n) => {
    if (!Array.isArray(n.members) || n.members.length < 3) return;
    const memberEnds: any[] = [];
    for (const m of n.members) {
      const cid = resolveClassId(m.class);
      if (cid && !memberEnds.some((e) => e.classId === cid)) {
        memberEnds.push({
          classId: cid,
          multiplicity: m.multiplicity || '1',
          role: m.role,
        });
      }
    }
    if (memberEnds.length >= 3) {
      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'naryAssociation',
        op: 'create',
        naryAssociationId: crypto.randomUUID(),
        memberEnds,
        name: n.name,
      });
    }
  });
}
