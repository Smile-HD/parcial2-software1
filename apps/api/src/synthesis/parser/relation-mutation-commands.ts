import {
  classExactOrPluralMatches,
  extractExplicitMultiplicities,
  type SemanticDomainModel,
} from '../delta-generator.js';

/**
 * 4. Mutación de relación (asociación <-> composición <-> agregación <-> generalización <-> realización <-> dependencia).
 */
export function parseRelationChangeCommands(
  text: string,
  normalized: string,
  currentDiagram: any,
  classes: Array<{ id: string; name: string }>,
  associations: Array<any>
): SemanticDomainModel | null {
  const isGeneralization = /(?:generalizaci[oó]n|generalization|herencia|hered[aáeé]|extends|subclase|superclase)/i.test(normalized);
  const isRealization = /(?:realizaci[oó]n|realization|implement[aáeé]|implements)/i.test(normalized);
  const isDependency = /(?:dependencia|dependency|depend[eé])/i.test(normalized);

  const isRelationChange =
    ((/(?:cambi|modific|hac|haz|convert|set|poner?|pon\b|que\s+sea|renombr|change|modify|switch|turn|make|conect|asoci|vincul|relacion|cre|agreg|a[ñn]ad).*?(?:relaci[oó]n|asociaci[oó]n|tipo\s+de\s+relaci[oó]n|v[ií]nculo|relation|relationship|association|link)/i.test(
      normalized
    ) && /(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance|realization|dependency|shared|composite|none)/i.test(normalized)) ||
    /(?:tipo\s+de\s+relaci[oó]n|cambia\s+el\s+tipo|relationship\s+type|change\s+type)\s+(?:a|por|to)\s+(?:una?\s+|an?\s+)?(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance)/i.test(
      normalized
    ) ||
    /(?:relaci[oó]n|relationship|association)\s+(?:entre|between)\s+["']?[A-Za-z_ñÑáéíóúÁÉÍÓÚ].*?\(.*?(?:composici|agregaci|asociaci|generaliz|hered|realiz|depend|composite|aggregation|association)/i.test(
      text
    ) ||
    /(?:a|por|to|into)\s+(?:una?\s+|an?\s+)?(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance)/i.test(
      normalized
    ) ||
    /(?:conect[aáeé]|asoci[aáeé]|vincul[aáeé]|relacion[aáeé]|connect|link|associate)\s+.*?(?:con\b|entre|between|y\b|and\b)/i.test(
      normalized
    ) ||
    ((isGeneralization || isRealization || isDependency) &&
      /(?:cambi|modific|pas[aá]|convert|turn|relaci[oó]n|hac|haz|sea|hered|subclase|superclase|extends|implement|depend|conect|asoci|vincul|cre|agreg|a[ñn]ad)/i.test(normalized)));

  if (!isRelationChange) return null;

  let targetAggregation: 'composite' | 'shared' | 'none' = 'none';
  if (/(?:composici[oó]n|composition|composite|compone|rombo\s+negro|black\s+diamond)/i.test(normalized)) {
    targetAggregation = 'composite';
  } else if (/(?:agregaci[oó]n|aggregation|shared|rombo\s+blanco|white\s+diamond)/i.test(normalized)) {
    targetAggregation = 'shared';
  } else if (/(?:asociaci[oó]n\s+simple|asociaci[oó]n\b|simple|plain\s+association)/i.test(normalized)) {
    targetAggregation = 'none';
  }

  const wholeMatch =
    /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
      text
    ) ||
    /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is|diamond\s+on)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
      text
    );
  const rawWholeName = wholeMatch ? wholeMatch[1]?.toLowerCase() : undefined;

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

  const resolveAggregationEnd = (sourceCls: { id: string; name: string }, targetCls: { id: string; name: string }, existingAssoc?: any): 'source' | 'target' => {
    if (rawWholeName) {
      const sNorm = sourceCls.name.toLowerCase();
      const tNorm = targetCls.name.toLowerCase();
      if (sNorm === rawWholeName || sNorm.startsWith(rawWholeName) || rawWholeName.startsWith(sNorm)) return 'source';
      if (tNorm === rawWholeName || tNorm.startsWith(rawWholeName) || rawWholeName.startsWith(tNorm)) return 'target';
    }
    const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;
    if (childPattern.test(sourceCls.name) && !childPattern.test(targetCls.name)) return 'target';
    if (childPattern.test(targetCls.name) && !childPattern.test(sourceCls.name)) return 'source';
    if (existingAssoc) {
      const sm = existingAssoc.sourceMultiplicity || '';
      const tm = existingAssoc.targetMultiplicity || '';
      if (sm === '1' && (tm.includes('*') || tm === '0..*' || tm === '1..*')) return 'source';
      if (tm === '1' && (sm.includes('*') || sm === '0..*' || sm === '1..*')) return 'target';
      if (existingAssoc.aggregationEnd) return existingAssoc.aggregationEnd;
    }
    return 'source';
  };

  const generalizations: Array<any> = currentDiagram?.generalizations || [];

  const resolveHierarchyOrder = (clsA: { id: string; name: string }, clsB: { id: string; name: string }): { subclass: { id: string; name: string }; superclass: { id: string; name: string } } => {
    const aNorm = clsA.name.toLowerCase();
    const bNorm = clsB.name.toLowerCase();
    if (new RegExp(`${aNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${bNorm}`, 'i').test(normalized)) {
      return { subclass: clsA, superclass: clsB };
    }
    if (new RegExp(`${bNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${aNorm}`, 'i').test(normalized)) {
      return { subclass: clsB, superclass: clsA };
    }
    if (new RegExp(`${bNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${aNorm}`, 'i').test(normalized)) {
      return { subclass: clsA, superclass: clsB };
    }
    if (new RegExp(`${aNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${bNorm}`, 'i').test(normalized)) {
      return { subclass: clsB, superclass: clsA };
    }
    // Patrones de roles: "con A como subclase", "subclase A", "superclase B"
    if (new RegExp(`(?:subclase|hijo|hija|child)\\s+(?:sea\\s+)?${aNorm}`, 'i').test(normalized) ||
        new RegExp(`${aNorm}\\s+(?:sea|como|es)\\s+(?:la\\s+)?(?:subclase|hijo|hija)`, 'i').test(normalized)) {
      return { subclass: clsA, superclass: clsB };
    }
    if (new RegExp(`(?:subclase|hijo|hija|child)\\s+(?:sea\\s+)?${bNorm}`, 'i').test(normalized) ||
        new RegExp(`${bNorm}\\s+(?:sea|como|es)\\s+(?:la\\s+)?(?:subclase|hijo|hija)`, 'i').test(normalized)) {
      return { subclass: clsB, superclass: clsA };
    }
    if (new RegExp(`(?:superclase|padre|madre|parent)\\s+(?:sea\\s+)?${bNorm}`, 'i').test(normalized) ||
        new RegExp(`${bNorm}\\s+(?:sea|como|es)\\s+(?:la\\s+)?(?:superclase|padre|madre)`, 'i').test(normalized)) {
      return { subclass: clsA, superclass: clsB };
    }
    if (new RegExp(`(?:superclase|padre|madre|parent)\\s+(?:sea\\s+)?${aNorm}`, 'i').test(normalized) ||
        new RegExp(`${aNorm}\\s+(?:sea|como|es)\\s+(?:la\\s+)?(?:superclase|padre|madre)`, 'i').test(normalized)) {
      return { subclass: clsB, superclass: clsA };
    }
    const posA = normalized.indexOf(aNorm);
    const posB = normalized.indexOf(bNorm);
    if (posA !== -1 && posB !== -1 && posA <= posB) {
      return { subclass: clsA, superclass: clsB };
    }
    return { subclass: clsB, superclass: clsA };
  };

  if (mentionedClasses.length >= 2) {
    let matchingAssoc: any = null;
    let matchingGen: any = null;
    let sourceCls: { id: string; name: string } | null = null;
    let targetCls: { id: string; name: string } | null = null;

    for (let i = 0; i < mentionedClasses.length; i++) {
      for (let j = i + 1; j < mentionedClasses.length; j++) {
        const ci = mentionedClasses[i]!;
        const cj = mentionedClasses[j]!;
        const foundAssoc = associations.find(
          (a) =>
            (a.sourceClassId === ci.id && a.targetClassId === cj.id) ||
            (a.sourceClassId === cj.id && a.targetClassId === ci.id)
        );
        if (foundAssoc) {
          matchingAssoc = foundAssoc;
          sourceCls = foundAssoc.sourceClassId === ci.id ? ci : cj;
          targetCls = foundAssoc.targetClassId === cj.id ? cj : ci;
          break;
        }
        const foundGen = generalizations.find(
          (g) =>
            (g.subClassId === ci.id && g.superClassId === cj.id) ||
            (g.subClassId === cj.id && g.superClassId === ci.id)
        );
        if (foundGen) {
          matchingGen = foundGen;
          sourceCls = ci;
          targetCls = cj;
          break;
        }
      }
      if (matchingAssoc || matchingGen) break;
    }

    let c1 = sourceCls || mentionedClasses[0]!;
    let c2 = targetCls || mentionedClasses[1]!;

    if (!sourceCls && !targetCls && mentionedClasses.length >= 2) {
      const pos1 = normalized.indexOf(c1.name.toLowerCase());
      const pos2 = normalized.indexOf(c2.name.toLowerCase());
      if (pos1 !== -1 && pos2 !== -1 && pos1 > pos2) {
        const temp = c1;
        c1 = c2;
        c2 = temp;
      }
    }

    // Caso 4A: Generalización / Herencia
    if (isGeneralization) {
      const hierarchy = resolveHierarchyOrder(c1, c2);
      const deletions: any = {};
      if (matchingAssoc) {
        const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
        const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
        if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
      }
      return {
        action: 'modify',
        deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
        generalizations: [
          {
            subclass: hierarchy.subclass.name,
            superclass: hierarchy.superclass.name,
          },
        ],
      };
    }

    // Caso 4B: Realización
    if (isRealization) {
      const hierarchy = resolveHierarchyOrder(c1, c2);
      const deletions: any = {};
      if (matchingAssoc) {
        const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
        const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
        if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
      }
      return {
        action: 'modify',
        deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
        realizations: [
          {
            clientClass: hierarchy.subclass.name,
            supplierInterface: hierarchy.superclass.name,
          },
        ],
      };
    }

    // Caso 4C: Dependencia
    if (isDependency) {
      const hierarchy = resolveHierarchyOrder(c1, c2);
      const deletions: any = {};
      if (matchingAssoc) {
        const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
        const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
        if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
      }
      return {
        action: 'modify',
        deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
        dependencies: [
          {
            clientClass: hierarchy.subclass.name,
            supplierClass: hierarchy.superclass.name,
          },
        ],
      };
    }

    // Caso 4D: Asociación / Agregación / Composición
    if (matchingGen) {
      const sub = classes.find((c) => c.id === matchingGen.subClassId);
      const sup = classes.find((c) => c.id === matchingGen.superClassId);
      if (sub && sup) {
        const calcEnd = resolveAggregationEnd(sub, sup);
        return {
          action: 'modify',
          deletions: {
            generalizations: [{ subclass: sub.name, superclass: sup.name }],
          },
          associations: [
            {
              source: sub.name,
              target: sup.name,
              aggregation: targetAggregation,
              aggregationEnd: calcEnd,
              sourceMultiplicity: '1',
              targetMultiplicity: '1..*',
            },
          ],
        };
      }
    }

    if (matchingAssoc && sourceCls && targetCls) {
      const calcEnd = resolveAggregationEnd(sourceCls, targetCls, matchingAssoc);
      const explicit = extractExplicitMultiplicities(text, sourceCls.name, targetCls.name);
      const updateAssoc: any = {
        source: sourceCls.name,
        target: targetCls.name,
        aggregation: targetAggregation,
        aggregationEnd: calcEnd,
      };
      if (explicit?.sourceMultiplicity) updateAssoc.sourceMultiplicity = explicit.sourceMultiplicity;
      if (explicit?.targetMultiplicity) updateAssoc.targetMultiplicity = explicit.targetMultiplicity;

      // Invariante OOAD M:N: si la relación resultante es muchos a muchos y no tiene clase de asociación, asignarla
      const finalSrc = updateAssoc.sourceMultiplicity || matchingAssoc.sourceMultiplicity;
      const finalTgt = updateAssoc.targetMultiplicity || matchingAssoc.targetMultiplicity;
      const isMtoN = (finalSrc === '0..*' || finalSrc === '1..*' || finalSrc === '*') &&
                     (finalTgt === '0..*' || finalTgt === '1..*' || finalTgt === '*');
      if (isMtoN && !matchingAssoc.associationClassId) {
        updateAssoc.associationClass = `${sourceCls.name}_${targetCls.name}`;
      }

      return {
        action: 'modify',
        updates: {
          associations: [updateAssoc],
        },
      };
    }

    const calcEnd = resolveAggregationEnd(c1, c2);
    let srcMult = '1';
    let tgtMult = '1..*';
    const explicit = extractExplicitMultiplicities(text, c1.name, c2.name);
    if (explicit) {
      if (explicit.sourceMultiplicity) srcMult = explicit.sourceMultiplicity;
      if (explicit.targetMultiplicity) tgtMult = explicit.targetMultiplicity;
    }

    const isNewAssocMtoN = (srcMult === '0..*' || srcMult === '1..*' || srcMult === '*') &&
                           (tgtMult === '0..*' || tgtMult === '1..*' || tgtMult === '*');
    const newAssocClass = isNewAssocMtoN ? `${c1.name}_${c2.name}` : undefined;

    return {
      action: 'modify',
      associations: [
        {
          source: c1.name,
          target: c2.name,
          sourceMultiplicity: srcMult,
          targetMultiplicity: tgtMult,
          aggregation: targetAggregation,
          aggregationEnd: calcEnd,
          ...(newAssocClass ? { associationClass: newAssocClass } : {}),
        },
      ],
    };
  } else if (mentionedClasses.length === 1) {
    const c = mentionedClasses[0]!;
    const touchingAssocs = associations.filter(
      (a) => a.sourceClassId === c.id || a.targetClassId === c.id
    );
    if (touchingAssocs.length === 1) {
      const singleAssoc = touchingAssocs[0]!;
      const src = classes.find((cls) => cls.id === singleAssoc.sourceClassId);
      const tgt = classes.find((cls) => cls.id === singleAssoc.targetClassId);
      if (src && tgt) {
        if (isGeneralization) {
          const hierarchy = resolveHierarchyOrder(src, tgt);
          return {
            action: 'modify',
            deletions: {
              associations: [{ source: src.name, target: tgt.name }],
            },
            generalizations: [
              {
                subclass: hierarchy.subclass.name,
                superclass: hierarchy.superclass.name,
              },
            ],
          };
        }
        const calcEnd = resolveAggregationEnd(src, tgt, singleAssoc);
        return {
          action: 'modify',
          updates: {
            associations: [
              {
                source: src.name,
                target: tgt.name,
                aggregation: targetAggregation,
                aggregationEnd: calcEnd,
              },
            ],
          },
        };
      }
    }
  } else if (associations.length === 1) {
    const singleAssoc = associations[0]!;
    const src = classes.find((c) => c.id === singleAssoc.sourceClassId);
    const tgt = classes.find((c) => c.id === singleAssoc.targetClassId);
    if (src && tgt) {
      if (isGeneralization) {
        const hierarchy = resolveHierarchyOrder(src, tgt);
        return {
          action: 'modify',
          deletions: {
            associations: [{ source: src.name, target: tgt.name }],
          },
          generalizations: [
            {
              subclass: hierarchy.subclass.name,
              superclass: hierarchy.superclass.name,
            },
          ],
        };
      }
      const calcEnd = resolveAggregationEnd(src, tgt, singleAssoc);
      return {
        action: 'modify',
        updates: {
          associations: [
            {
              source: src.name,
              target: tgt.name,
              aggregation: targetAggregation,
              aggregationEnd: calcEnd,
            },
          ],
        },
      };
    }
  }

  return null;
}
