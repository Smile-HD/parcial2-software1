import {
  classExactOrPluralMatches,
  type SemanticDomainModel,
} from '../delta-generator.js';

/**
 * 3c. Mutación de multiplicidades, roles y clases de asociación en relaciones existentes.
 */
export function parseMultiplicityOrRoleCommands(
  text: string,
  normalized: string,
  classes: Array<{ id: string; name: string }>,
  associations: Array<any>
): SemanticDomainModel | null {
  const isMultiplicityOrRoleIntent =
    /(?:multiplicidad|cardinalidad|multiplicity|cardinality|rol\b|role\b|clase\s+de\s+asociaci[oó]n)/i.test(normalized) ||
    (/(?:cambi|modific|pon|set|change|modify|ajust)/i.test(normalized) &&
      /(?:1\.\.\*|0\.\.\*|0\.\.1|\b1\b\s+a\s+\*|\b1\b\s+a\s+muchos|muchos\s+a\s+\b1\b|muchos\s+a\s+muchos|uno\s+a\s+muchos|muchos\s+a\s+uno|uno\s+a\s+uno)/i.test(normalized));

  if (!isMultiplicityOrRoleIntent || associations.length === 0) return null;

  const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
  const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  const mentionedClasses = classes.filter((c) => {
    const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
    if (regex.test(normalized)) return true;
    if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
    if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
    return false;
  });
  mentionedClasses.sort((a, b) => b.name.length - a.name.length);

  let matchingAssoc: any = null;
  let sourceCls: { id: string; name: string } | null = null;
  let targetCls: { id: string; name: string } | null = null;

  if (mentionedClasses.length >= 2) {
    for (let i = 0; i < mentionedClasses.length; i++) {
      for (let j = i + 1; j < mentionedClasses.length; j++) {
        const ci = mentionedClasses[i]!;
        const cj = mentionedClasses[j]!;
        const found = associations.find(
          (a) =>
            (a.sourceClassId === ci.id && a.targetClassId === cj.id) ||
            (a.sourceClassId === cj.id && a.targetClassId === ci.id)
        );
        if (found) {
          matchingAssoc = found;
          sourceCls = found.sourceClassId === ci.id ? ci : cj;
          targetCls = found.targetClassId === cj.id ? cj : ci;
          break;
        }
      }
      if (matchingAssoc) break;
    }
  } else if (associations.length === 1) {
    matchingAssoc = associations[0]!;
    sourceCls = classes.find((c) => c.id === matchingAssoc.sourceClassId) || null;
    targetCls = classes.find((c) => c.id === matchingAssoc.targetClassId) || null;
  }

  if (matchingAssoc && sourceCls && targetCls) {
    let sourceMultiplicity: string | undefined;
    let targetMultiplicity: string | undefined;

    const multPairMatch = /(1\.\.\*|0\.\.\*|0\.\.1|\*|1)\s*(?:a|y|-|\/)\s*(1\.\.\*|0\.\.\*|0\.\.1|\*|1)/i.exec(text);
    if (multPairMatch) {
      sourceMultiplicity = multPairMatch[1] === '*' ? '1..*' : multPairMatch[1];
      targetMultiplicity = multPairMatch[2] === '*' ? '1..*' : multPairMatch[2];
    } else if (/(?:uno|1)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '1..*';
    } else if (/(?:muchos|\*)\s+a\s+(?:uno|1)/i.test(normalized)) {
      sourceMultiplicity = '1..*';
      targetMultiplicity = '1';
    } else if (/(?:muchos|\*)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
      sourceMultiplicity = '1..*';
      targetMultiplicity = '1..*';
    } else if (/(?:uno|1)\s+a\s+(?:uno|1)/i.test(normalized)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '1';
    } else if (/(?:cero|0)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '0..*';
    } else if (/(?:cero|0)\s+a\s+(?:uno|1)/i.test(normalized)) {
      sourceMultiplicity = '1';
      targetMultiplicity = '0..1';
    }

    if (!sourceMultiplicity && !targetMultiplicity) {
      const singleMultMatch = /(?:multiplicidad\s+(?:sea\s+|a\s+|por\s+)?|a\s+)(1\.\.\*|0\.\.\*|0\.\.1|\*|1)/i.exec(text);
      if (singleMultMatch) {
        const val = singleMultMatch[1] === '*' ? '1..*' : singleMultMatch[1]!;
        targetMultiplicity = val;
      }
    }

    let sourceRole: string | undefined;
    let targetRole: string | undefined;
    const roleOriginMatch = /(?:rol\s+origen|source\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
    if (roleOriginMatch) sourceRole = roleOriginMatch[1];
    const roleDestMatch = /(?:rol\s+destino|target\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
    if (roleDestMatch) targetRole = roleDestMatch[1];

    let assocClass: string | undefined;
    const assocClassMatch = /(?:clase\s+de\s+asociaci[oó]n|association\s+class)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
    if (assocClassMatch) {
      const candClass = assocClassMatch[1]!;
      const foundAssocCls = classes.find((c) => c.name.toLowerCase() === candClass.toLowerCase());
      if (foundAssocCls) assocClass = foundAssocCls.name;
    }

    let assocName: string | undefined;
    const assocNameMatch = /(?:llamada|llamado|nombrada|nombrado|named|called|con\s+(?:el\s+)?nombre|de\s+nombre|nombre\s+(?:sea|es))\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
    if (assocNameMatch) {
      const candidate = assocNameMatch[1]!;
      if (!/^(clase|tabla|entidad|asociacion|relacion|multiplicidad|muchos|uno)$/i.test(candidate)) {
        assocName = candidate;
      }
    }

    if (sourceMultiplicity || targetMultiplicity || sourceRole || targetRole || assocClass || assocName) {
      return {
        action: 'modify',
        updates: {
          associations: [
            {
              source: sourceCls.name,
              target: targetCls.name,
              sourceMultiplicity: sourceMultiplicity || matchingAssoc.sourceMultiplicity || '1',
              targetMultiplicity: targetMultiplicity || matchingAssoc.targetMultiplicity || '1',
              sourceRole,
              targetRole,
              associationClass: assocClass,
              ...(assocName ? { name: assocName } : {}),
            },
          ],
        },
      };
    }
  }

  return null;
}

/**
 * 3d. Adición o vinculación de Clase de Asociación / Tabla Intermedia.
 */
export function parseAssociationClassCommands(
  text: string,
  normalized: string,
  classes: Array<{ id: string; name: string }>,
  associations: Array<any>
): SemanticDomainModel | null {
  const isAssocClassCreate =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[oó]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table)/i.test(normalized) &&
    /(?:agreg[aáeé]|a[ñn]ad[eé]|cre[aáeé]|pon[eé]?|sum[aá]|add|insert|asoci[aáeé]|asign[aáeé]|convert|link|connect)/i.test(normalized);

  if (!isAssocClassCreate || classes.length < 2) return null;

  const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
  const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  const mentionedClasses = classes.filter((c) => {
    const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
    if (regex.test(normalized)) return true;
    if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
    if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
    return false;
  });

  if (mentionedClasses.length >= 2) {
    const c1 = mentionedClasses[0]!;
    const c2 = mentionedClasses[1]!;

    let assocClassName: string | undefined;
    const explicitNameMatch =
      /(?:llamada|nombrada|con\s+el\s+nombre|named)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text) ||
      /(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?\s+(?:entre|between)/i.exec(text) ||
      /(?:mediante|a\s+trav[eé]s\s+de|via|using|through)\s+(?:(?:la|una|the|an?)\s+)?(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);

    if (explicitNameMatch) {
      assocClassName = explicitNameMatch[1];
    } else {
      assocClassName = `${c1.name}${c2.name}`;
    }

    const matchingAssoc = associations.find(
      (a) =>
        (a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
        (a.sourceClassId === c2.id && a.targetClassId === c1.id)
    );

    const createdClasses: any[] = [];
    if (!classes.some((c) => c.name.toLowerCase() === assocClassName!.toLowerCase())) {
      createdClasses.push({
        name: assocClassName,
        attributes: [],
        methods: [],
      });
    }

    if (matchingAssoc) {
      const src = classes.find((c) => c.id === matchingAssoc.sourceClassId) || c1;
      const tgt = classes.find((c) => c.id === matchingAssoc.targetClassId) || c2;
      return {
        action: 'modify',
        classes: createdClasses.length > 0 ? createdClasses : undefined,
        updates: {
          associations: [
            {
              source: src.name,
              target: tgt.name,
              associationClass: assocClassName,
            },
          ],
        },
      };
    } else {
      return {
        action: 'modify',
        classes: createdClasses.length > 0 ? createdClasses : undefined,
        associations: [
          {
            source: c1.name,
            target: c2.name,
            sourceMultiplicity: '1..*',
            targetMultiplicity: '1..*',
            associationClass: assocClassName,
          },
        ],
      };
    }
  }

  return null;
}

/**
 * 3e. Adición de Asociación N-aria (diamante central conectando 3+ clases).
 */
export function parseNaryAssociationCommands(
  text: string,
  normalized: string,
  classes: Array<{ id: string; name: string }>
): SemanticDomainModel | null {
  const isNaryCreate =
    /(?:n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized) &&
    /(?:cre[aáeé]|agreg[aáeé]|a[ñn]ad[eé]|pon[eé]|conect[aáeé]|arm[aáeé]|hac[eé]|haz)/i.test(normalized);

  if (!isNaryCreate || classes.length < 3) return null;

  const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
  const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  const mentionedClasses = classes.filter((c) => {
    const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
    if (regex.test(normalized)) return true;
    if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
    if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
    return false;
  });

  if (mentionedClasses.length >= 3) {
    let naryName: string | undefined;
    const naryNameMatch = /(?:llamada|nombrada|con\s+el\s+nombre|named)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
    if (naryNameMatch) naryName = naryNameMatch[1];

    return {
      action: 'modify',
      naryAssociations: [
        {
          name: naryName,
          members: mentionedClasses.map((c) => ({
            class: c.name,
            multiplicity: '1',
          })),
        },
      ],
    };
  }

  return null;
}

/**
 * 3d / inversión: Inversión de relación / rombo / dirección / multiplicidad.
 */
export function parseRelationInvertCommands(
  normalized: string,
  currentDiagram: any,
  classes: Array<{ id: string; name: string }>,
  associations: Array<any>
): SemanticDomainModel | null {
  const isRelationInvert =
    /(?:(?:invert[ií]|invierte|inviert|invierta|invertir)(?:me|te|le|les|nos)?(?:l[oas]{1,2})?|da(?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:la\s+|el\s+)?vuelta|dalo\s+vuelta|dala\s+vuelta|dalos\s+vuelta|dalas\s+vuelta|dar\s+vuelta|gir[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|girar|volte[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|voltear|rot[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|rotar|cambi[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:de\s+)?lado|pon(?:e|é)?(?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:al\s+rev[eé]s|del\s+otro\s+lado)|flip|reverse|swap)\b/i.test(
      normalized
    ) &&
    /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|generalizaci[oó]n|herencia|multiplicidad|cardinalidad|rombo|nodo|flecha|lado|sentido|direccion|direcci[oó]n|diamond|arrow|relation|association|composition|aggregation|generalization|inheritance|multiplicity)/i.test(
      normalized
    );

  if (!isRelationInvert) return null;

  const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
  const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
  const mentionedClasses = classes.filter((c) => {
    const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
    if (regex.test(normalized)) return true;
    if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
    if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
    return false;
  });

  let targetAssoc: any = null;
  let targetGen: any = null;
  const wantsGen = /(?:generalizaci[oó]n|generalizasion|herencia|inheritance)/i.test(normalized);

  if (mentionedClasses.length >= 2) {
    for (let i = 0; i < mentionedClasses.length; i++) {
      for (let j = i + 1; j < mentionedClasses.length; j++) {
        const ci = mentionedClasses[i]!;
        const cj = mentionedClasses[j]!;
        const fg = (currentDiagram?.generalizations || []).find(
          (g: any) =>
            (g.subClassId === ci.id && g.superClassId === cj.id) ||
            (g.subClassId === cj.id && g.superClassId === ci.id)
        );
        if (fg && (wantsGen || !targetGen)) {
          targetGen = fg;
          if (wantsGen) break;
        }
        const fa = associations.find(
          (a) =>
            (a.sourceClassId === ci.id && a.targetClassId === cj.id) ||
            (a.sourceClassId === cj.id && a.targetClassId === ci.id)
        );
        if (fa && (!wantsGen || !targetAssoc)) {
          targetAssoc = fa;
          if (!wantsGen) break;
        }
      }
      if (wantsGen && targetGen) {
        targetAssoc = null;
        break;
      }
      if (!wantsGen && targetAssoc) {
        break;
      }
    }
  } else if (mentionedClasses.length === 1) {
    const c = mentionedClasses[0]!;
    const fa = associations.find(
      (a) => a.sourceClassId === c.id || a.targetClassId === c.id
    );
    if (fa) targetAssoc = fa;
    const fg = (currentDiagram?.generalizations || []).find(
      (g: any) => g.subClassId === c.id || g.superClassId === c.id
    );
    if (fg) targetGen = fg;
  }

  if (!targetAssoc && !targetGen) {
    if (associations.length === 1) targetAssoc = associations[0];
    else if ((currentDiagram?.generalizations || []).length === 1) targetGen = currentDiagram.generalizations[0];
  }

  if (targetAssoc) {
    const currentAgg = targetAssoc.aggregation ?? 'composite';
    const currentEnd = targetAssoc.aggregationEnd ?? 'source';
    const newEnd = currentEnd === 'source' ? 'target' : 'source';
    const srcCls = classes.find((c) => c.id === targetAssoc.sourceClassId);
    const tgtCls = classes.find((c) => c.id === targetAssoc.targetClassId);
    if (srcCls && tgtCls) {
      let newSrcMult = targetAssoc.targetMultiplicity || '1';
      let newTgtMult = targetAssoc.sourceMultiplicity || '0..*';
      if (newSrcMult === '*' || newSrcMult.includes('*')) {
        newSrcMult = '1';
        newTgtMult = '0..*';
      }
      return {
        action: 'modify',
        updates: {
          associations: [
            {
              source: srcCls.name,
              target: tgtCls.name,
              aggregation: currentAgg,
              aggregationEnd: newEnd,
              sourceMultiplicity: newSrcMult,
              targetMultiplicity: newTgtMult,
            },
          ],
        },
      };
    }
  } else if (targetGen) {
    const subCls = classes.find((c) => c.id === targetGen.subClassId);
    const supCls = classes.find((c) => c.id === targetGen.superClassId);
    if (subCls && supCls) {
      return {
        action: 'modify',
        deletions: {
          generalizations: [{ subclass: subCls.name, superclass: supCls.name }],
        },
        generalizations: [
          {
            subclass: supCls.name,
            superclass: subCls.name,
          },
        ],
      };
    }
  }

  return null;
}
