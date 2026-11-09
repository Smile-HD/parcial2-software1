import type {
  AssociationDelta,
  NaryAssociationDelta,
  ClassDelta,
  LlmResult,
} from '@app/core';
import { classIdByName, nextPosition, deltaBase, type FakeLlmContext } from './helpers.js';

export function tryRelationshipCommands(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

  // 6b. Asociación N-ARIA
  const naryAssociation = /\b(?:(?:ternary|ternaria|n-ary|nary)\b[\s\S]*?\b(?:association|asociaci[óo]n)\b|(?:association|asociaci[óo]n)\b[\s\S]*?\b(?:ternary|ternaria|n-ary|nary)\b)[\s\S]*?\b(?:between|entre)\s+([A-Za-z_]\w*(?:(?:\s*,\s*|\s+(?:and|y)\s+)[A-Za-z_]\w*)+)/i.exec(utterance);
  if (naryAssociation) {
    const names = naryAssociation[1]!
      .split(/\s*,\s*|\s+(?:and|y)\s+/i)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (names.length < 3) {
      return refused('An n-ary association needs at least three member classes.');
    }
    const memberEnds: { classId: string; multiplicity: string }[] = [];
    for (const name of names) {
      const classId = classIdByName(currentIr, name);
      if (classId === null) return refused(`Unknown class "${name}"`);
      memberEnds.push({ classId, multiplicity: '1' });
    }
    const delta: NaryAssociationDelta = {
      kind: 'naryAssociation',
      op: 'create',
      ...deltaBase(currentIr),
      naryAssociationId: crypto.randomUUID(),
      memberEnds,
    };
    return { kind: 'delta', value: delta };
  }

  // 6c. Asociación con CLASE DE ASOCIACIÓN / TABLA INTERMEDIA
  const assignAssocClassPattern =
    /(?:(?:hac[eé]|haz|make|set|convert[ií]|volv[eé]|pon(?:e|ele)?|transform[aá]|marc[aá]|asign[aá]|link|connect|conecta|conectá|asocia|asociá)\s+(?:que\s+|q\s+)?(?:(?:la|una|el|un|the|an?)\s+)?(?:class\s+|clase\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:sea|en|como|to\s+be|as|a\s+la\s+asociaci[óo]n\s+entre|to\s+(?:the\s+)?association\s+between)\s+(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table)?\s*(?:entre|between)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)|^(?:(?:la|el|the)\s+)?(?:class\s+|clase\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:sea|es|is)\s+(?:(?:la|una|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia)\s+(?:entre|between)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*))/i.exec(utterance);

  const assocClassPattern = !assignAssocClassPattern &&
    /(?:^|\b)(?:cre[aá]|crear|add|agrega|agregá|inserta|insertá|pon|ponele)?\s*(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table|linking\s+table)\s+(?:llamada\s+|llamado\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:between|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);

  const assocClassViaPattern = !assignAssocClassPattern && !assocClassPattern &&
    /\b(?:link|connect|conecta|conectá|asocia|asociá)\b[\s\S]*?\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:with|con|y|and)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:mediante|a\s+trav[eé]s\s+de|via|using|through)\s+(?:(?:la|una|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table|association\s+table)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);

  const anonAssocClassPattern = !assignAssocClassPattern && !assocClassPattern && !assocClassViaPattern &&
    /(?:^|\b)(?:cre[aá]|crear|add|agrega|agregá|inserta|insertá|pon|ponele|sumale|mete|metele)?\s*(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table|linking\s+table)\s+(?:between|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);

  if (assignAssocClassPattern || assocClassPattern || assocClassViaPattern || anonAssocClassPattern) {
    let assocClassName: string;
    let srcName: string;
    let tgtName: string;

    if (assignAssocClassPattern) {
      assocClassName = assignAssocClassPattern[1] || assignAssocClassPattern[4]!;
      srcName = assignAssocClassPattern[2] || assignAssocClassPattern[5]!;
      tgtName = assignAssocClassPattern[3] || assignAssocClassPattern[6]!;
    } else if (assocClassPattern) {
      assocClassName = assocClassPattern[1]!;
      srcName = assocClassPattern[2]!;
      tgtName = assocClassPattern[3]!;
    } else if (assocClassViaPattern) {
      assocClassName = assocClassViaPattern[3]!;
      srcName = assocClassViaPattern[1]!;
      tgtName = assocClassViaPattern[2]!;
    } else {
      srcName = anonAssocClassPattern![1]!;
      tgtName = anonAssocClassPattern![2]!;
      assocClassName = `${srcName.charAt(0).toUpperCase()}${srcName.slice(1)}${tgtName.charAt(0).toUpperCase()}${tgtName.slice(1)}`;
    }

    const sourceClassId = classIdByName(currentIr, srcName);
    const targetClassId = classIdByName(currentIr, tgtName);
    if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
    if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

    let assocClassId = classIdByName(currentIr, assocClassName);
    let createClassDelta: ClassDelta | undefined;
    if (assocClassId === null) {
      assocClassId = crypto.randomUUID();
      createClassDelta = {
        kind: 'class',
        op: 'create',
        ...deltaBase(currentIr),
        classId: assocClassId,
        name: assocClassName,
        position: nextPosition(currentIr),
      };
    }

    const existingAssoc = (currentIr.associations ?? []).find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
    );

    if (existingAssoc) {
      const updateDelta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        newAssociationClassId: assocClassId,
      };

      if (createClassDelta) {
        return {
          kind: 'delta',
          value: {
            kind: 'batch',
            ...deltaBase(currentIr),
            deltas: [createClassDelta, updateDelta],
          },
        };
      }
      return { kind: 'delta', value: updateDelta };
    }

    const assocDelta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId,
      targetClassId,
      sourceMultiplicity: '0..*',
      targetMultiplicity: '0..*',
      directed: false,
      associationClassId: assocClassId,
    };

    if (createClassDelta) {
      return {
        kind: 'delta',
        value: {
          kind: 'batch',
          ...deltaBase(currentIr),
          deltas: [createClassDelta, assocDelta],
        },
      };
    }
    return { kind: 'delta', value: assocDelta };
  }

  // 6d. Vincular clase existente a asociación como clase de asociación
  const linkAssocClassPattern = /\b(?:link|connect|conecta|conectá|asocia|asociá)\s+(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:to\s+(?:association|relation)\s+between|a\s+(?:la\s+)?(?:asociaci[óo]n|relaci[oó]n)\s+entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);
  if (linkAssocClassPattern) {
    const className = linkAssocClassPattern[1]!;
    const srcName = linkAssocClassPattern[2]!;
    const tgtName = linkAssocClassPattern[3]!;
    const classId = classIdByName(currentIr, className);
    const srcId = classIdByName(currentIr, srcName);
    const tgtId = classIdByName(currentIr, tgtName);
    if (classId === null) return refused(`Unknown class "${className}"`);
    if (srcId === null) return refused(`Unknown class "${srcName}"`);
    if (tgtId === null) return refused(`Unknown class "${tgtName}"`);

    const existingAssoc = currentIr.associations.find(
      (a) =>
        (a.sourceClassId === srcId && a.targetClassId === tgtId) ||
        (a.sourceClassId === tgtId && a.targetClassId === srcId),
    );
    if (!existingAssoc) {
      return refused(`No association found between "${srcName}" and "${tgtName}".`);
    }

    const delta: AssociationDelta = {
      kind: 'association',
      op: 'updateMultiplicity',
      ...deltaBase(currentIr),
      associationId: existingAssoc.id,
      newAssociationClassId: classId,
    };
    return { kind: 'delta', value: delta };
  }

  // 7. Asociación nombrada con roles
  const namedAssociation = /\b(?:association|link|asocia(?:ci[óo]n)?)\b[\s\S]*?\b([A-Za-z_]\w*)\s+(?:(?:with|con|y|and)\s+)?([A-Za-z_]\w*)\s+(?:named|called|llama(?:da)?)\s+([A-Za-z_]\w*)(?:(?:\s+(?:role|rol)\s+([A-Za-z_]\w*))?(?:\s+(?:role|rol)\s+([A-Za-z_]\w*))?)?/i.exec(utterance);
  if (namedAssociation) {
    const sourceClassId = classIdByName(currentIr, namedAssociation[1]!);
    const targetClassId = classIdByName(currentIr, namedAssociation[2]!);
    if (sourceClassId === null) return refused(`Unknown class "${namedAssociation[1]}"`);
    if (targetClassId === null) return refused(`Unknown class "${namedAssociation[2]}"`);
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId,
      targetClassId,
      sourceMultiplicity: '1',
      targetMultiplicity: '1',
      directed: false,
      name: namedAssociation[3]!,
      sourceRole: namedAssociation[4] || undefined,
      targetRole: namedAssociation[5] || undefined,
    };
    return { kind: 'delta', value: delta };
  }

  // 7b. Asociación reflexiva
  const reflexiveAssoc = /\b(?:link|conecta|conectá|asocia|asociá|asociaci[óo]n|association|connect)\b[\s\S]*?\b([A-Za-z_]\w*)\s+(?:consigo\s+misma|consigo\s+mismo|to\s+itself|reflexively|reflexive)/i.exec(utterance);
  if (reflexiveAssoc) {
    const classId = classIdByName(currentIr, reflexiveAssoc[1]!);
    if (classId === null) return refused(`Unknown class "${reflexiveAssoc[1]}"`);
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId: classId,
      targetClassId: classId,
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
      directed: false,
      aggregation: 'none',
    };
    return { kind: 'delta', value: delta };
  }

  // 8. Asociación entre dos clases (simple o con cardinalidad)
  const isDeleteAssocIntent = /\b(?:delete|remove|elimina|eliminá|borra|borrá|sacar|sacá|saca|desvincula|desvinculá)\b/i.test(utterance);
  const isAssocClassIntent = /\b(?:clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|association\s+class|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table)\b/i.test(utterance);
  const association = !isDeleteAssocIntent && !isAssocClassIntent
    ? /\b(?:link|conecta|conectá|asocia|asociá|associate|relate|relaciona|relacioná|asociaci[óo]n|association|connect|composici[óo]n|agregaci[óo]n)\b[\s\S]*?\b(?:entre\s+|between\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:with|con|y|and|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance)
    : null;
  if (association) {
    const sourceClassId = classIdByName(currentIr, association[1]!);
    const targetClassId = classIdByName(currentIr, association[2]!);
    if (sourceClassId === null) return refused(`Unknown class "${association[1]}"`);
    if (targetClassId === null) return refused(`Unknown class "${association[2]}"`);

    const isComposite = /\b(?:composici[oó]n|composite|composicion)\b/i.test(utterance);
    const isShared = /\b(?:agregaci[oó]n|shared|agregacion)\b/i.test(utterance);
    const aggregation: 'composite' | 'shared' | 'none' = isComposite ? 'composite' : (isShared ? 'shared' : 'none');

    const wholeMatch =
      /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance) ||
      /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is|diamond\s+on)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);

    const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;

    let wholeClassId: string = targetClassId;
    const name1 = association[1]!.toLowerCase();
    const name2 = association[2]!.toLowerCase();

    if (wholeMatch) {
      const rawWhole = wholeMatch[1]!.toLowerCase();
      if (name1 === rawWhole || name1.startsWith(rawWhole) || rawWhole.startsWith(name1)) {
        wholeClassId = sourceClassId;
      } else if (name2 === rawWhole || name2.startsWith(rawWhole) || rawWhole.startsWith(name2)) {
        wholeClassId = targetClassId;
      }
    } else if (childPattern.test(name1) && !childPattern.test(name2)) {
      wholeClassId = targetClassId;
    } else if (childPattern.test(name2) && !childPattern.test(name1)) {
      wholeClassId = sourceClassId;
    }

    let sourceMultiplicity = isComposite ? (wholeClassId === sourceClassId ? '1' : '0..*') : '1';
    let targetMultiplicity = isComposite ? (wholeClassId === targetClassId ? '1' : '0..*') : '1';

    const explicitMultiplicities = /(?:from\s+)?(\d+(?:\.\.(?:\d+|\*))?|\*)\s+(?:to|a)\s+(\d+(?:\.\.(?:\d+|\*))?|\*)/i.exec(utterance);
    if (explicitMultiplicities) {
      sourceMultiplicity = explicitMultiplicities[1]!;
      targetMultiplicity = explicitMultiplicities[2]!;
    } else if (/\b(?:1\s+(?:a|to)\s+[nN\*]|(?:uno|one)\s+(?:a|to)\s+(?:muchos|many)|1\s*:\s*[nN\*])\b/i.test(utterance)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '0..*';
    } else if (/\b(?:[nN\*]\s+(?:a|to)\s+1|(?:muchos|many)\s+(?:a|to)\s+(?:uno|one)|[nN\*]\s*:\s*1)\b/i.test(utterance)) {
      sourceMultiplicity = '0..*';
      targetMultiplicity = '1';
    } else if (/\b(?:[nN\*]\s+(?:a|to)\s+[nNmM\*]|(?:muchos|many)\s+(?:a|to)\s+(?:muchos|many)|[nN\*]\s*:\s*[nNmM\*])\b/i.test(utterance)) {
      sourceMultiplicity = '0..*';
      targetMultiplicity = '0..*';
    } else if (/\b(?:1\s+(?:a|to)\s+1|(?:uno|one)\s+(?:a|to)\s+(?:uno|one)|1\s*:\s*1)\b/i.test(utterance)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '1';
    }

    const nameMatch = /\b(?:llamada|llamado|nombrada|nombrado|named|called|con\s+(?:el\s+)?nombre|de\s+nombre)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);
    let assocName: string | undefined;
    if (nameMatch) {
      const candidate = nameMatch[1]!;
      if (!/^(clase|tabla|entidad|asociacion|relacion|multiplicidad|muchos|uno)$/i.test(candidate) &&
          candidate.toLowerCase() !== association[1]!.toLowerCase() &&
          candidate.toLowerCase() !== association[2]!.toLowerCase()) {
        assocName = candidate;
      }
    }

    const existingAssoc = currentIr.associations.find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
    );

    const isExplicitChange = /(?:cambia|modifica|pasa|actualiza|change|update|haz\s+que|hace\s+que)/i.test(utterance);

    if (existingAssoc && isExplicitChange) {
      const isReversed = existingAssoc.sourceClassId === targetClassId;
      const assocAggregationEnd = (isComposite || isShared)
        ? (wholeClassId === existingAssoc.sourceClassId ? 'source' : 'target')
        : (existingAssoc.aggregationEnd ?? 'source');

      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        aggregation,
        aggregationEnd: assocAggregationEnd,
        newSourceMultiplicity: isReversed ? targetMultiplicity : sourceMultiplicity,
        newTargetMultiplicity: isReversed ? sourceMultiplicity : targetMultiplicity,
        ...(assocName ? { name: assocName } : {}),
      };
      return { kind: 'delta', value: delta };
    }

    const deltaAggregationEnd = (isComposite || isShared)
      ? (wholeClassId === sourceClassId ? 'source' : 'target')
      : undefined;

    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId,
      targetClassId,
      sourceMultiplicity,
      targetMultiplicity,
      directed: false,
      aggregation,
      ...(deltaAggregationEnd ? { aggregationEnd: deltaAggregationEnd } : {}),
      ...(assocName ? { name: assocName } : {}),
    };
    return { kind: 'delta', value: delta };
  }

  // 9. Composición: "X is composed of Y"
  const composition = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:is\s+)?(?:composed\s+of|composes|compone)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  if (composition) {
    const sourceClassId = classIdByName(currentIr, composition[1]!);
    const targetClassId = classIdByName(currentIr, composition[2]!);
    if (sourceClassId === null) return refused(`Unknown class "${composition[1]}"`);
    if (targetClassId === null) return refused(`Unknown class "${composition[2]}"`);
    const existingAssoc = currentIr.associations.find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
    );
    if (existingAssoc) {
      const isReversed = existingAssoc.sourceClassId === targetClassId;
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        aggregation: 'composite',
        aggregationEnd: isReversed ? 'target' : 'source',
        newSourceMultiplicity: isReversed ? '0..*' : '1',
        newTargetMultiplicity: isReversed ? '1' : '0..*',
      };
      return { kind: 'delta', value: delta };
    }
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId,
      targetClassId,
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
      directed: false,
      aggregation: 'composite',
      aggregationEnd: 'source',
    };
    return { kind: 'delta', value: delta };
  }

  // 9b. Fraseo inverso de composición: "X is part of Y"
  const partOf = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:is\s+)?(?:part\s+of|belongs\s+to|es\s+parte\s+de|pertenece\s+a)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  if (partOf) {
    const partClassId = classIdByName(currentIr, partOf[1]!);
    const wholeClassId = classIdByName(currentIr, partOf[2]!);
    if (partClassId === null) return refused(`Unknown class "${partOf[1]}"`);
    if (wholeClassId === null) return refused(`Unknown class "${partOf[2]}"`);
    const existingAssoc = currentIr.associations.find(
      (a) =>
        (a.sourceClassId === partClassId && a.targetClassId === wholeClassId) ||
        (a.sourceClassId === wholeClassId && a.targetClassId === partClassId)
    );
    if (existingAssoc) {
      const isReversed = existingAssoc.sourceClassId === wholeClassId;
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        aggregation: 'composite',
        aggregationEnd: isReversed ? 'source' : 'target',
        newSourceMultiplicity: isReversed ? '1' : '0..*',
        newTargetMultiplicity: isReversed ? '0..*' : '1',
      };
      return { kind: 'delta', value: delta };
    }
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId: partClassId,
      targetClassId: wholeClassId,
      sourceMultiplicity: '0..*',
      targetMultiplicity: '1',
      directed: false,
      aggregation: 'composite',
      aggregationEnd: 'target',
    };
    return { kind: 'delta', value: delta };
  }

  // 10. Agregación compartida
  const sharedAgg = /\b(?:aggregation|shared|agregaci[oó]n)\b[\s\S]*?\b(?:between|entre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:and|with|y|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  if (sharedAgg) {
    const sourceClassId = classIdByName(currentIr, sharedAgg[1]!);
    const targetClassId = classIdByName(currentIr, sharedAgg[2]!);
    if (sourceClassId === null) return refused(`Unknown class "${sharedAgg[1]}"`);
    if (targetClassId === null) return refused(`Unknown class "${sharedAgg[2]}"`);
    const existingAssoc = currentIr.associations.find(
      (a) =>
        (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
        (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
    );
    if (existingAssoc) {
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        aggregation: 'shared',
        aggregationEnd: existingAssoc.sourceClassId === sourceClassId ? 'source' : 'target',
      };
      return { kind: 'delta', value: delta };
    }
    const delta: AssociationDelta = {
      kind: 'association',
      op: 'create',
      ...deltaBase(currentIr),
      associationId: crypto.randomUUID(),
      sourceClassId,
      targetClassId,
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
      directed: false,
      aggregation: 'shared',
      aggregationEnd: 'source',
    };
    return { kind: 'delta', value: delta };
  }

  return null;
}
