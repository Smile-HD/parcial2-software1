import type {
  AssociationDelta,
  BatchDelta,
  LlmResult,
} from '@app/core';
import { classIdByName, parseMultiplicities, deltaBase, type FakeLlmContext } from './helpers.js';

export function tryAssociationMutations(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

  // 7b. ACTUALIZACIÓN de multiplicidad / cardinalidad entre dos clases
  const isMultiplicityUpdate = /\b(?:cambi[aá]le|cambi[aá]|cambiar|modific[aá]|modificar|actualiz[aá]|actualizar|update|change)\b[\s\S]*?\b(?:multiplicidad|cardinalidad|multiplicity|cardinality)\b[\s\S]*?\b(?:entre|between|de)?\s*(?:la\s+relaci[oó]n\s+entre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([^\s,;]+(?:\s+(?:a|to)\s+[^\s,;]+)?)/i.exec(utterance);
  if (isMultiplicityUpdate) {
    const srcName = isMultiplicityUpdate[1]!;
    const tgtName = isMultiplicityUpdate[2]!;
    const sourceClassId = classIdByName(currentIr, srcName);
    const targetClassId = classIdByName(currentIr, tgtName);
    if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
    if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);
    const existingAssoc = (currentIr.associations ?? []).find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
    );
    if (!existingAssoc) {
      return refused(`No association found between "${srcName}" and "${tgtName}".`);
    }
    const mults = parseMultiplicities(isMultiplicityUpdate[3]!);
    if (!mults) {
      return refused(`Invalid multiplicity format "${isMultiplicityUpdate[3]}".`);
    }
    const isDirect = existingAssoc.sourceClassId === sourceClassId;
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'updateMultiplicity',
      ...deltaBase(currentIr),
      associationId: existingAssoc.id,
      newSourceMultiplicity: isDirect ? mults.source : mults.target,
      newTargetMultiplicity: isDirect ? mults.target : mults.source,
    };
    const nameMatch = /\b(?:llamada|llamado|nombrada|nombrado|named|called|con\s+(?:el\s+)?nombre|de\s+nombre|nombrala|nombralo)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);
    if (nameMatch) {
      const candidate = nameMatch[1]!;
      if (!/^(clase|tabla|entidad|asociacion|relacion|multiplicidad|muchos|uno)$/i.test(candidate)) {
        delta.name = candidate;
      }
    }
    return { kind: 'delta', value: delta };
  }

  // 7d. ACTUALIZACIÓN / CONVERSIÓN / RENOMBRE de relación entre dos clases
  const isRelationRename =
    /\b(?:renombr[aá]|renombrar|cambi[aá]le|cambi[aá]|cambiar|modific[aá]|modificar|pon[eé]le|pon[eé]|nombr[aá]|rename)\b[\s\S]*?(?:el\s+nombre|de\s+nombre)?[\s\S]*?\b(?:de\s+la\s+|a\s+la\s+)?(?:relaci[oó]n|asociaci[oó]n|arista|link|association|relationship)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:a|por|como|to|llamada|llamado)\s+(?:(?:un[ao]?|el|la)\s+)?(?:(?:relaci[oó]n|tipo)\s+(?:de\s+)?)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance) ||
    /\b(?:a\s+la\s+)?(?:relaci[oó]n|asociaci[oó]n|arista|link|association|relationship)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:cambi[aá]le|cambi[aá]|modific[aá]|renombr[aá]|llamala|llamalo|nombra)\b[\s\S]*?(?:el\s+nombre|de\s+nombre)?[\s\S]*?\b(?:a|por|como|to)\s+(?:(?:un[ao]?|el|la)\s+)?(?:(?:relaci[oó]n|tipo)\s+(?:de\s+)?)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);

  if (isRelationRename) {
    const srcName = isRelationRename[1]!;
    const tgtName = isRelationRename[2]!;
    const sourceClassId = classIdByName(currentIr, srcName);
    const targetClassId = classIdByName(currentIr, tgtName);
    if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
    if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

    const matchingAssocs = (currentIr.associations ?? []).filter(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
    );
    const matchingGens = (currentIr.generalizations ?? []).filter(
      (g) =>
        (g.subClassId === sourceClassId && g.superClassId === targetClassId) ||
        (g.subClassId === targetClassId && g.superClassId === sourceClassId),
    );
    const matchingRealizs = (currentIr.realizations ?? []).filter(
      (r) =>
        (r.clientClassId === sourceClassId && r.supplierInterfaceId === targetClassId) ||
        (r.clientClassId === targetClassId && r.supplierInterfaceId === sourceClassId),
    );

    let newName = isRelationRename[3]!;
    const stopWords = new Set(['un', 'una', 'uno', 'el', 'la', 'los', 'las', 'de', 'del', 'a', 'por', 'como', 'relacion', 'relación', 'tipo']);
    if (stopWords.has(newName.toLowerCase())) {
      const nextWordMatch = /(?:composici[oó]n|composite|agregaci[oó]n|shared|asociaci[oó]n|generalizaci[oó]n|generalizasi[oó]n|generalization|herencia|realizaci[oó]n|dependencia)/i.exec(utterance);
      if (nextWordMatch) {
        newName = nextWordMatch[0];
      }
    }

    const isGenChange = /^(?:generalizaci[oó]n|generalizasi[oó]n|generalization|herencia|inheritance)$/i.test(newName);
    const isRealizChange = /^(?:realizaci[oó]n|realizasi[oó]n|realization|implementaci[oó]n|implementation|interfaz|interface)$/i.test(newName);
    const isDepChange = /^(?:dependencia|dependency)$/i.test(newName);
    const isAggChange = /^(?:composici[oó]n|composite|agregaci[oó]n|shared|asociaci[oó]n|simple|none)$/i.test(newName);

    if (isGenChange) {
      const subId = sourceClassId;
      const superId = targetClassId;

      const deltas: any[] = [];
      for (const a of matchingAssocs) {
        deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
      }
      for (const r of matchingRealizs) {
        deltas.push({ kind: 'realization', op: 'delete', ...deltaBase(currentIr), realizationId: r.id });
      }
      if (matchingGens.length === 0) {
        deltas.push({
          kind: 'generalization',
          op: 'create',
          ...deltaBase(currentIr),
          generalizationId: crypto.randomUUID(),
          subClassId: subId,
          superClassId: superId,
        });
      }
      return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
    }

    if (isRealizChange) {
      const deltas: any[] = [];
      for (const a of matchingAssocs) {
        deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
      }
      for (const g of matchingGens) {
        deltas.push({ kind: 'generalization', op: 'delete', ...deltaBase(currentIr), generalizationId: g.id });
      }
      if (matchingRealizs.length === 0) {
        deltas.push({
          kind: 'realization',
          op: 'create',
          ...deltaBase(currentIr),
          realizationId: crypto.randomUUID(),
          clientClassId: sourceClassId,
          supplierInterfaceId: targetClassId,
        });
      }
      return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
    }

    if (isDepChange) {
      const deltas: any[] = [];
      for (const a of matchingAssocs) {
        deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
      }
      deltas.push({
        kind: 'dependency',
        op: 'create',
        ...deltaBase(currentIr),
        dependencyId: crypto.randomUUID(),
        clientClassId: sourceClassId,
        supplierClassId: targetClassId,
      });
      return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
    }

    if (isAggChange) {
      const isComposite = /^(?:composici[oó]n|composite)$/i.test(newName);
      const isShared = /^(?:agregaci[oó]n|shared)$/i.test(newName);
      const targetAgg: 'composite' | 'shared' | 'none' = isComposite ? 'composite' : (isShared ? 'shared' : 'none');

      const wholeMatch =
        /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
      const childPattern = /(?:detalle|item|\blinea\b|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;

      let wholeClassId: string = targetClassId;
      const n1 = srcName.toLowerCase();
      const n2 = tgtName.toLowerCase();
      if (wholeMatch) {
        const rawWhole = wholeMatch[1]!.toLowerCase();
        if (n1 === rawWhole || n1.startsWith(rawWhole) || rawWhole.startsWith(n1)) wholeClassId = sourceClassId;
        else if (n2 === rawWhole || n2.startsWith(rawWhole) || rawWhole.startsWith(n2)) wholeClassId = targetClassId;
      } else if (childPattern.test(n1) && !childPattern.test(n2)) {
        wholeClassId = targetClassId;
      } else if (childPattern.test(n2) && !childPattern.test(n1)) {
        wholeClassId = sourceClassId;
      }

      if (matchingAssocs.length > 0) {
        const primaryAssoc = matchingAssocs.find((a) => a.aggregation === targetAgg) || matchingAssocs[0]!;
        const duplicateDeletes = matchingAssocs.filter((a) => a.id !== primaryAssoc.id).map((a) => ({
          kind: 'association' as const,
          op: 'delete' as const,
          ...deltaBase(currentIr),
          associationId: a.id,
        }));

        const assocAggregationEnd = (isComposite || isShared)
          ? (wholeClassId === primaryAssoc.sourceClassId ? 'source' : 'target')
          : (primaryAssoc.aggregationEnd ?? 'source');

        const updateDelta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: primaryAssoc.id,
          aggregation: targetAgg,
          aggregationEnd: assocAggregationEnd,
          newSourceMultiplicity: isComposite ? (wholeClassId === primaryAssoc.sourceClassId ? '1' : '0..*') : '1',
          newTargetMultiplicity: isComposite ? (wholeClassId === primaryAssoc.targetClassId ? '1' : '0..*') : '1',
        };

        if (duplicateDeletes.length > 0) {
          return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas: [...duplicateDeletes, updateDelta] } };
        }
        return { kind: 'delta', value: updateDelta };
      }

      const deltas: any[] = [];
      for (const g of matchingGens) {
        deltas.push({ kind: 'generalization', op: 'delete', ...deltaBase(currentIr), generalizationId: g.id });
      }
      const deltaAggregationEnd = (isComposite || isShared)
        ? (wholeClassId === sourceClassId ? 'source' : 'target')
        : undefined;
      deltas.push({
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity: isComposite ? (wholeClassId === sourceClassId ? '1' : '0..*') : '1',
        targetMultiplicity: isComposite ? (wholeClassId === targetClassId ? '1' : '0..*') : '1',
        directed: false,
        aggregation: targetAgg,
        ...(deltaAggregationEnd ? { aggregationEnd: deltaAggregationEnd } : {}),
      });
      return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
    }

    const existingAssoc = matchingAssocs[0];
    if (!existingAssoc) {
      return refused(`No association found between "${srcName}" and "${tgtName}".`);
    }
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'updateMultiplicity',
      ...deltaBase(currentIr),
      associationId: existingAssoc.id,
      name: newName,
    };
    return { kind: 'delta', value: delta };
  }

  // 7e. INVERSIÓN de extremos, rombo, flecha o dirección entre dos clases o sobre una clase
  const isRelationInvert =
    /\b(?:invert[ií]|invierte|invertir|da\s+vuelta|dar\s+vuelta|dalo\s+vuelta|dala\s+vuelta|gira|girar|voltea|voltear|cambia\s+de\s+lado|flip|reverse|swap)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance) ||
    /\b(?:cambi[aá]|cambi[aá]le|pon[eé]|pon[eé]le|switch)\b[\s\S]*?\b(?:el\s+rombo|el\s+diamante|el\s+nodo|la\s+flecha|diamond|arrow)\b[\s\S]*?\b(?:a|hacia|en|to|on)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);

  if (isRelationInvert) {
    const srcName = isRelationInvert[1]!;
    const tgtName = isRelationInvert[2];

    if (tgtName) {
      const sourceClassId = classIdByName(currentIr, srcName);
      const targetClassId = classIdByName(currentIr, tgtName);
      if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
      if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

      const matchingAssocs = (currentIr.associations ?? []).filter(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
      );
      const matchingGens = (currentIr.generalizations ?? []).filter(
        (g) =>
          (g.subClassId === sourceClassId && g.superClassId === targetClassId) ||
          (g.subClassId === targetClassId && g.superClassId === sourceClassId),
      );

      if (matchingAssocs.length > 0) {
        const primaryAssoc = matchingAssocs.find((a) => a.aggregation === 'composite' || a.aggregation === 'shared') || matchingAssocs[0]!;
        const duplicateDeletes = matchingAssocs.filter((a) => a.id !== primaryAssoc.id).map((a) => ({
          kind: 'association' as const,
          op: 'delete' as const,
          ...deltaBase(currentIr),
          associationId: a.id,
        }));

        const currentEnd = primaryAssoc.aggregationEnd ?? (primaryAssoc.sourceMultiplicity === '1' && primaryAssoc.targetMultiplicity?.includes('*') ? 'source' : 'target');
        const flippedEnd: 'source' | 'target' = currentEnd === 'source' ? 'target' : 'source';

        const updateDelta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: primaryAssoc.id,
          aggregation: primaryAssoc.aggregation,
          aggregationEnd: flippedEnd,
          newSourceMultiplicity: primaryAssoc.targetMultiplicity || '1',
          newTargetMultiplicity: primaryAssoc.sourceMultiplicity || '1',
        };

        if (duplicateDeletes.length > 0) {
          return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas: [...duplicateDeletes, updateDelta] } };
        }
        return { kind: 'delta', value: updateDelta };
      }

      if (matchingGens.length > 0) {
        const gen = matchingGens[0]!;
        const batch: BatchDelta = {
          kind: 'batch',
          ...deltaBase(currentIr),
          deltas: [
            {
              kind: 'generalization',
              op: 'delete',
              ...deltaBase(currentIr),
              generalizationId: gen.id,
            },
            {
              kind: 'generalization',
              op: 'create',
              ...deltaBase(currentIr),
              generalizationId: crypto.randomUUID(),
              subClassId: gen.superClassId,
              superClassId: gen.subClassId,
            },
          ],
        };
        return { kind: 'delta', value: batch };
      }
    } else {
      const targetClassId = classIdByName(currentIr, srcName);
      if (targetClassId !== null) {
        const assoc = (currentIr.associations ?? []).find(
          (a) => (a.sourceClassId === targetClassId || a.targetClassId === targetClassId) && (a.aggregation === 'composite' || a.aggregation === 'shared')
        );
        if (assoc) {
          const isSource = assoc.sourceClassId === targetClassId;
          const updateDelta: AssociationDelta = {
            kind: 'association',
            op: 'updateMultiplicity',
            ...deltaBase(currentIr),
            associationId: assoc.id,
            aggregation: assoc.aggregation,
            aggregationEnd: isSource ? 'source' : 'target',
            newSourceMultiplicity: isSource ? '1' : '0..*',
            newTargetMultiplicity: isSource ? '0..*' : '1',
          };
          return { kind: 'delta', value: updateDelta };
        }
      }
    }
  }

  // 7c. ELIMINACIÓN de asociación / relación entre dos clases
  const isDeleteAssociation =
    /\b(?:delete|remove|elimina|eliminá|borra|borrá|sacar|sacá|saca|desvincula|desvinculá|unlink|detach)\b[\s\S]*?\b(?:asocia(?:ci[óo]n)?|association|link|relaci[oó]n|relations?|relationships?|enlace)\b[\s\S]*?\b(?:between|entre|de|from)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|with|y|e|de|con)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance) ||
    /\b(?:desvincula|desvinculá|unlink)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:de|from|con|with|y|and)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  if (isDeleteAssociation) {
    const sourceClassId = classIdByName(currentIr, isDeleteAssociation[1]!);
    const targetClassId = classIdByName(currentIr, isDeleteAssociation[2]!);
    if (sourceClassId === null) return refused(`Unknown class "${isDeleteAssociation[1]}"`);
    if (targetClassId === null) return refused(`Unknown class "${isDeleteAssociation[2]}"`);
    const existingAssoc = (currentIr.associations ?? []).find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
    );
    if (!existingAssoc) {
      return refused(`No association found between "${isDeleteAssociation[1]}" and "${isDeleteAssociation[2]}".`);
    }
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'delete',
      ...deltaBase(currentIr),
      associationId: existingAssoc.id,
    };
    return { kind: 'delta', value: delta };
  }

  return null;
}
