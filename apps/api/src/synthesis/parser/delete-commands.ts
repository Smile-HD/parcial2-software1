import type { SemanticDomainModel } from '../delta-generator.js';

/**
 * 1. Borrado agnóstico determinista (clases, relaciones, atributos, métodos y desvinculación de clase de asociación).
 */
export function parseDeleteCommands(
  cleanedText: string,
  text: string,
  normalized: string,
  currentDiagram: any,
  classes: Array<{ id: string; name: string }>,
  associations: Array<any>
): SemanticDomainModel | null {
  const isDeleteIntent = /\b(?:delete|remove|elimina|elimin(?:ar|[aá])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|borr(?:ar|[aá])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|sac(?:ar|[aá])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|quit(?:ar|[aá])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|desvincul(?:ar|[aáeé])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|desasoci(?:ar|[aáeé])?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|unlink|detach)\b/i.test(normalized);
  if (!isDeleteIntent) return null;

  const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
  const mentionedClasses = classes.filter((c) => {
    const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
    if (regex.test(normalized)) return true;
    if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
    return false;
  });

  // 1a. Borrado de atributo (si menciona atributo/campo o un atributo de clase)
  const isAttrTarget = /(?:atributo|campo|field|attribute|propiedad|property)/i.test(normalized);
  if (isAttrTarget) {
    const attrMatch = /(?:atributo|campo|field|attribute|propiedad|property)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(cleanedText || text);
    const requestedAttrName = attrMatch ? attrMatch[1]!.trim().toLowerCase() : undefined;

    let targetCls = mentionedClasses.length === 1 ? mentionedClasses[0] : undefined;
    const classInTextMatch = /(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(cleanedText || text);
    if (classInTextMatch) {
      const cCand = classes.find((c) => c.name.toLowerCase() === classInTextMatch[1]!.toLowerCase());
      if (cCand) targetCls = cCand;
    }

    const cleanAttr = (n: string) => n.toLowerCase().replace(/string|int|float|boolean|date$/i, '');

    if (requestedAttrName) {
      if (targetCls) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetCls!.id);
        const matchedAttr = fullCls?.attributes?.find((a: any) => {
          const an = a.name.toLowerCase();
          return an === requestedAttrName || cleanAttr(an) === requestedAttrName || an.startsWith(requestedAttrName);
        });
        if (matchedAttr) {
          return {
            action: 'modify',
            deletions: {
              attributes: [{ class: targetCls.name, attribute: matchedAttr.name }],
            },
          };
        }
        return {
          action: 'modify',
          deletions: {
            attributes: [],
          },
        };
      }
      for (const cls of classes) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        const matchedAttr = fullCls?.attributes?.find((a: any) => {
          const an = a.name.toLowerCase();
          return an === requestedAttrName || cleanAttr(an) === requestedAttrName || an.startsWith(requestedAttrName);
        });
        if (matchedAttr) {
          return {
            action: 'modify',
            deletions: {
              attributes: [{ class: cls.name, attribute: matchedAttr.name }],
            },
          };
        }
      }
      return {
        action: 'modify',
        deletions: {
          attributes: [],
        },
      };
    }

    const searchClasses = targetCls ? [targetCls] : classes;
    for (const cls of searchClasses) {
      const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
      if (fullCls && Array.isArray(fullCls.attributes)) {
        for (const attr of fullCls.attributes) {
          const aNorm = attr.name.toLowerCase();
          const attrRegex = new RegExp(`(?:\\b|["'])${aNorm}(?:\\b|["'])`, 'i');
          if (attrRegex.test(normalized)) {
            return {
              action: 'modify',
              deletions: {
                attributes: [{ class: cls.name, attribute: attr.name }],
              },
            };
          }
        }
      }
    }
  }

  // 1a2. Borrado de método (si menciona método/operación)
  const isMethodTarget = /(?:m[eé]todos?|methods?|operaci[oó]ne?s?|operations?|funcio?ne?s?|functions?)/i.test(normalized);
  if (isMethodTarget) {
    const methodMatch = /(?:m[eé]todos?|methods?|operaci[oó]ne?s?|operations?|funcio?ne?s?|functions?)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(cleanedText || text);
    const requestedMethodName = methodMatch ? methodMatch[1]!.trim().toLowerCase() : undefined;
    let targetCls = mentionedClasses.length === 1 ? mentionedClasses[0] : undefined;
    const classInTextMatch = /(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(cleanedText || text);
    if (classInTextMatch) {
      const cCand = classes.find((c) => c.name.toLowerCase() === classInTextMatch[1]!.toLowerCase());
      if (cCand) targetCls = cCand;
    }
    if (requestedMethodName) {
      const searchClasses = targetCls ? [targetCls] : classes;
      for (const cls of searchClasses) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        const matchedMethod = fullCls?.methods?.find((m: any) => m.name && m.name.toLowerCase().trim() === requestedMethodName);
        if (matchedMethod) {
          return {
            action: 'modify',
            deletions: {
              methods: [{ class: cls.name, method: matchedMethod.name }],
            },
          };
        }
      }
    }
  }

  // 1b. Si el usuario pide explícitamente borrar una CLASE específica
  const explicitClassTargetMatch = /(?:la\s+clase\s+|clase\s+|class\s+|tabla\s+|entidad\s+)([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(cleanedText || text);
  if (explicitClassTargetMatch) {
    const targetName = explicitClassTargetMatch[1]?.toLowerCase();
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetName);
    if (targetCls) {
      return {
        action: 'modify',
        deletions: {
          classes: [targetCls.name],
        },
      };
    }
  }

  // 1b2. Desvinculación limpia de clase de asociación (E4)
  const isUnlinkAssocClass =
    /(?:desvincul[aáeé]|quit[aáeé]|elimin[aáeé]|remover?|sac[aáeé])\s+(?:la\s+)?clase\s+de\s+asociaci[oó]n/i.test(normalized) ||
    /(?:unlink|detach|remove)\s+(?:the\s+)?association\s+class/i.test(normalized);

  if (isUnlinkAssocClass) {
    let targetAssoc: any = undefined;
    if (mentionedClasses.length >= 2) {
      const c1 = mentionedClasses[0]!;
      const c2 = mentionedClasses[1]!;
      targetAssoc = associations.find(
        (a) =>
          ((a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
           (a.sourceClassId === c2.id && a.targetClassId === c1.id)) &&
          a.associationClassId
      );
    } else if (mentionedClasses.length === 1) {
      const c1 = mentionedClasses[0]!;
      targetAssoc = associations.find(
        (a) =>
          (a.sourceClassId === c1.id || a.targetClassId === c1.id || a.associationClassId === c1.id) &&
          a.associationClassId
      );
    } else {
      targetAssoc = associations.find((a) => a.associationClassId);
    }

    if (targetAssoc) {
      const src = classes.find((c) => c.id === targetAssoc.sourceClassId);
      const tgt = classes.find((c) => c.id === targetAssoc.targetClassId);
      if (src && tgt) {
        return {
          action: 'modify',
          updates: {
            associations: [
              {
                source: src.name,
                target: tgt.name,
                associationClass: null,
              },
            ],
          },
        };
      }
    }
  }

  // 1c. Borrado de relación / asociación
  const isRelTarget = /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|enlace|link|relationship|association)/i.test(normalized);
  if (isRelTarget || mentionedClasses.length >= 2) {
    if (mentionedClasses.length >= 2) {
      const c1 = mentionedClasses[0]!;
      const c2 = mentionedClasses[1]!;
      const matchingAssoc = associations.find(
        (a) =>
          (a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
          (a.sourceClassId === c2.id && a.targetClassId === c1.id)
      );
      if (matchingAssoc) {
        const src = classes.find((c) => c.id === matchingAssoc.sourceClassId);
        const tgt = classes.find((c) => c.id === matchingAssoc.targetClassId);
        if (src && tgt) {
          return {
            action: 'modify',
            deletions: {
              associations: [{ source: src.name, target: tgt.name }],
            },
          };
        }
      }
    } else if (associations.length === 1 && isRelTarget) {
      const singleAssoc = associations[0]!;
      const src = classes.find((c) => c.id === singleAssoc.sourceClassId);
      const tgt = classes.find((c) => c.id === singleAssoc.targetClassId);
      if (src && tgt) {
        return {
          action: 'modify',
          deletions: {
            associations: [{ source: src.name, target: tgt.name }],
          },
        };
      }
    }
  }

  // 1d. Borrado de clase si se menciona exactamente una clase
  if (!isAttrTarget && !isRelTarget && !isMethodTarget && mentionedClasses.length === 1) {
    return {
      action: 'modify',
      deletions: {
        classes: [mentionedClasses[0]!.name],
      },
    };
  }

  return null;
}
