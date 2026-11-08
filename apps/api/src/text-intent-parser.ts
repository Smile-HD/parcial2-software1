import { stripAccents, findClosestClassName, normalizeUmlUtterance } from '@app/adapters-ai';
import {
  cleanClassName,
  cleanMultiplicity,
  toCanonicalKey,
  sanitizeAttributeNameAndType,
  parseAttributesFromProse,
  generateDefaultAttributesForClass,
  classExactOrPluralMatches,
  classWordMatches,
  extractExplicitMultiplicities,
  extractExplicitRequestedClasses,
  isHeuristicComposition,
  type SemanticDomainModel,
  type SemanticClass,
  type SemanticAttribute,
  type SemanticMethod,
  type SemanticAssociation,
  type SemanticGeneralization,
  type SemanticRealization,
  type SemanticDependency,
  type SemanticNaryAssociation,
  type SemanticRenames,
  type SemanticClassUpdate,
  type SemanticAttributeUpdate,
  type SemanticMethodUpdate,
  type SemanticAssociationUpdate,
  type SemanticGeneralizationUpdate,
  type SemanticRealizationUpdate,
  type SemanticDependencyUpdate,
  type SemanticNaryAssociationUpdate,
  type SemanticReposition,
  type SemanticUpdates,
  type SemanticDeletions,
} from './delta-generator.js';

/**
 * Extrae mutaciones explícitas de relaciones y clases solicitadas por el usuario o formuladas en el chat.
 * Soporta cambios de agregación (composición, agregación, asociación), modificaciones de clase (abstracta, interfaz)
 * y renombrados directos, vinculándolos con las clases y relaciones reales presentes en el lienzo.
 */
export function extractExplicitModelMutations(text: string, currentDiagram?: any): SemanticDomainModel | null {
  if (!text || !currentDiagram) return null;
  const cleanedText = normalizeUmlUtterance(text);
  const normalized = cleanedText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bcomposision\b/g, 'composicion')
    .replace(/\bgeneralizasion\b/g, 'generalizacion')
    .replace(/\bagregasion\b/g, 'agregacion')
    .replace(/\brealizasion\b/g, 'realizacion')
    .replace(/\brelasion\b/g, 'relacion')
    .replace(/\basosia\b/g, 'asocia')
    .replace(/\b(asisetncia|asistensia)\b/g, 'asistencia')
    .replace(/\balunmo\b/g, 'alumno')
    .replace(/\bnodo\s+de\s+relaci[oó]n\b/gi, 'relacion');

  const classes: Array<{ id: string; name: string }> = currentDiagram.classes || [];
  const associations: Array<any> = currentDiagram.associations || [];

  // 0. Creación determinista de una nueva clase con atributos explícitos y/o asociación
  // Ej: "crea la clase Especialidad con matricula:string y activa:boolean"
  // Ej: "crear la clase Autor con nombre:string, nacionalidad:string y asociala con Publicacion 1 a N"
  // Ej: "crea la clase Editorial con nombre:string y fundacion:date"
  const isSpecialClassIntent =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class|n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized);

  const createClassIntent = !isSpecialClassIntent
    ? /^\s*(?:(?:cre[aáeé]|crear|create|a[ñn]ad[eé]|agreg[aáeé]|insert[aáeé]|hac[eé]|haz|arm[aáeé]|gener[aáeé]|defin[eíi]|model[aáeé]|dise[ñn][aáeé])(?:me|te|le|les|nos)?(?:l[oas]{1,2})?|add|new|make)\s+(?:la|el|una|un|nueva|nuevo)?\s*(?:clase|calse|clse|class|tabla|entidad)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?(.*)$/i.exec(
        cleanedText
      ) ||
      (!isSpecialClassIntent
        ? /^\s*(?:(?:cre[aáeé]|crear|create|a[ñn]ad[eé]|agreg[aáeé]|insert[aáeé]|hac[eé]|haz|arm[aáeé]|gener[aáeé]|defin[eíi]|model[aáeé]|dise[ñn][aáeé])(?:me|te|le|les|nos)?(?:l[oas]{1,2})?|add|new|make)\s+(?:la|el|una|un|nueva|nuevo)?\s*(?:clase|calse|clse|class|tabla|entidad)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?(.*)$/i.exec(
            text.replace(/^@\w+\s*/, '')
          )
        : null)
    : null;

  if (createClassIntent) {
    const rawClassName = createClassIntent[1]!.trim();
    const className = cleanClassName(rawClassName);
    const remainder = createClassIntent[2]?.trim() || '';

    let attrsText = remainder;
    let targetAssocClass: string | undefined;
    let assocRemainder = '';

    const assocMatch = /(?:y\s+)?(?:asoci[aáeé]l[ao]|conect[aáeé]l[ao]|vincul[aáeé]l[ao]|relacion[aáeé]l[ao]|link(?:ed)?\s+(?:it\s+)?with|associate(?:\s+it)?\s+with)\s+(?:con\s+)?(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(.*)$/i.exec(remainder);
    if (assocMatch) {
      targetAssocClass = cleanClassName(assocMatch[1]);
      assocRemainder = assocMatch[2]?.trim() || '';
      attrsText = remainder.slice(0, assocMatch.index).trim();
    }

    attrsText = attrsText.replace(/^(?:con|with|teniendo|having)\s+/i, '').trim();
    const attributes = parseAttributesFromProse(attrsText);

    const createdClasses = [
      {
        name: className,
        attributes: attributes.length > 0 ? attributes : undefined,
        methods: [],
      },
    ];

    const associationsToCreate: any[] = [];
    if (targetAssocClass) {
      const mults = extractExplicitMultiplicities(assocRemainder || remainder, className, targetAssocClass) || {
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
      };
      associationsToCreate.push({
        source: className,
        target: targetAssocClass,
        sourceMultiplicity: mults.sourceMultiplicity || '1',
        targetMultiplicity: mults.targetMultiplicity || '0..*',
        aggregation: 'none',
      });
    }

    return {
      action: 'modify',
      classes: createdClasses,
      associations: associationsToCreate.length > 0 ? associationsToCreate : undefined,
    };
  }

  // 0b. Agregar atributo a una clase existente deterministamente
  // Ej: "agregá telefono:string a la clase Especialidad"
  // Ej: "agregale el atributo telefono:string a Especialidad"
  // Ej: "a la clase Especialidad agregale el campo telefono:string"
  const addAttrMatch =
    /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|insert[aáeéí]|sum[aáeéí]|met[eé]|add)(?:me|le|les|nos)?(?:l[oas]{1,2})?\s+(?:(?:el|la|un|una)\s+)?(?:(?:atributo|campo|columna|attribute|field|propiedad|property)\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?::|\bde\s+tipo\b|\bof\s+type\b)\s*([A-Za-z_][\w.]*)\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
      cleanedText || text
    ) ||
    /(?:a|en|para)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|insert[aáeéí]|sum[aáeéí]|met[eé]|add)(?:me|le|les|nos)?(?:l[oas]{1,2})?\s+(?:(?:el|la|un|una)\s+)?(?:(?:atributo|campo|columna|attribute|field|propiedad|property)\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?::|\bde\s+tipo\b|\bof\s+type\b)\s*([A-Za-z_][\w.]*)/i.exec(
      cleanedText || text
    );
  if (addAttrMatch) {
    const isClassFirst = Boolean(
      /(?:a|en|para)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+|entidad\s+)?/i.test(addAttrMatch[0])
    );
    const rawAttrName = isClassFirst ? addAttrMatch[2]!.trim() : addAttrMatch[1]!.trim();
    const rawAttrType = isClassFirst ? addAttrMatch[3]!.trim().toLowerCase() : addAttrMatch[2]!.trim().toLowerCase();
    const targetClassName = isClassFirst ? addAttrMatch[1]!.trim() : addAttrMatch[3]!.trim();
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      return {
        action: 'modify',
        classes: [
          {
            name: targetCls.name,
            attributes: [{ name: rawAttrName, type: rawAttrType }],
          },
        ],
      };
    }
  }

  // 0c. Cambiar tipo de atributo deterministamente
  // Ej: "cambiá el tipo de anio en Tirada a string"
  const changeAttrTypeMatch = /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|convert[ií]|set|update)(?:me|le|les|nos)?(?:l[oas]{1,2})?\s+(?:el\s+)?tipo\s+de(?:l\s+atributo)?\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|para)\s+(?:(?:la|el)\s+)?(?:clase\s+|tabla\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_][\w.]*)/i.exec(cleanedText || text);
  if (changeAttrTypeMatch) {
    const attrName = changeAttrTypeMatch[1]!.trim();
    const targetClassName = changeAttrTypeMatch[2]!.trim();
    const newType = changeAttrTypeMatch[3]!.trim().toLowerCase();
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      return {
        action: 'modify',
        updates: {
          attributes: [{ class: targetCls.name, name: attrName, type: newType }],
        },
      };
    }
  }

  // 0d. Renombrar atributo o pasar a minúsculas
  // Ej: "renombra el atributo total a monto en Factura"
  // Ej: "poné en minúsculas el atributo nombre en Autor"
  // Ej: "rename attribute fullName to nombreCompleto in Customer"
  const renameAttrToIn = /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+de|rename)(?:me|le|les|nos)?(?:l[oas]{1,2})?\s+(?:el\s+|the\s+)?(?:atributos?|campos?|attributes?|fields?|columnas?|propiedad(?:es)?)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(cleanedText || text);
  const renameAttrInClass = !renameAttrToIn && /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+de|pon[eé]\s+en\s+min[uú]sculas|rename)(?:me|le|les|nos)?(?:l[oas]{1,2})?\s+(?:el\s+|the\s+)?(?:atributos?|campos?|attributes?|fields?|columnas?|propiedad(?:es)?)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(cleanedText || text);

  const matchedRename = renameAttrToIn
    ? { attrName: renameAttrToIn[1]!.trim(), className: renameAttrToIn[3]!.trim(), toName: renameAttrToIn[2]!.trim() }
    : renameAttrInClass
      ? { attrName: renameAttrInClass[1]!.trim(), className: renameAttrInClass[2]!.trim(), toName: renameAttrInClass[3]?.trim() }
      : null;

  if (matchedRename) {
    const attrName = matchedRename.attrName;
    const targetClassName = matchedRename.className;
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetCls.id);
      const existingAttr = fullCls?.attributes?.find((a: any) => a.name.toLowerCase() === attrName.toLowerCase());
      const toName = /min[uú]sculas/i.test(text)
        ? (existingAttr?.name.toLowerCase() || attrName.toLowerCase())
        : (matchedRename.toName || existingAttr?.name || attrName);
      return {
        action: 'modify',
        renames: {
          attributes: [{ class: targetCls.name, from: existingAttr?.name || attrName, to: toName }],
        },
      };
    }
  }

  // 0e. Agregar método deterministamente
  // Ej: "agregá el método cancelar(motivo:string):boolean a Especialidad"
  // Ej: "sumale a Especialidad el método atender():void"
  const addMethodDirectMatch = /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|sum[aáeéí]|insert[aáeéí]|add)(?:le)?\s+(?:el\s+|the\s+)?(?:m[ée]todo|operaci[oó]n|method|operation)\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\bque retorna\b|\bdevuelve\b|\breturns\b)?\s*([A-Za-z_][\w.]*)?\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
  const addMethodInvertedMatch = !addMethodDirectMatch && /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|sum[aáeéí]|insert[aáeéí]|add)(?:le)?\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:el\s+|the\s+)?(?:m[ée]todo|operaci[oó]n|method|operation)\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\bque retorna\b|\bdevuelve\b|\breturns\b)?\s*([A-Za-z_][\w.]*)?/i.exec(text);

  const matchedMethodInfo = addMethodDirectMatch
    ? { targetClass: addMethodDirectMatch[4]!.trim(), name: addMethodDirectMatch[1]!.trim(), rawParams: addMethodDirectMatch[2], retType: addMethodDirectMatch[3] }
    : addMethodInvertedMatch
      ? { targetClass: addMethodInvertedMatch[1]!.trim(), name: addMethodInvertedMatch[2]!.trim(), rawParams: addMethodInvertedMatch[3], retType: addMethodInvertedMatch[4] }
      : null;

  if (matchedMethodInfo) {
    const targetCls = classes.find((c) => c.name.toLowerCase() === matchedMethodInfo.targetClass.toLowerCase());
    if (targetCls) {
      const params: Array<{ name: string; type: string }> = [];
      if (matchedMethodInfo.rawParams && matchedMethodInfo.rawParams.trim().length > 0) {
        const parts = matchedMethodInfo.rawParams.split(',');
        for (const p of parts) {
          const m = /^\s*([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_][\w.]*))?\s*$/.exec(p);
          if (m) params.push({ name: m[1]!, type: m[2] || 'string' });
        }
      }
      return {
        action: 'modify',
        classes: [
          {
            name: targetCls.name,
            methods: [
              {
                name: matchedMethodInfo.name,
                returnType: matchedMethodInfo.retType || 'void',
                parameters: params,
              },
            ],
          },
        ],
      };
    }
  }

  if (classes.length === 0) return null;

  // 1. Borrado agnóstico determinista (clases, relaciones, atributos)
  const isDeleteIntent = /\b(?:delete|remove|elimina|elimin[aá]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|borr[aá]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|sac[aá]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|quit[aá]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|desvincul[aáeé]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|desasoci[aáeé]?(?:me|te|le|nos|les)?(?:l[oas]{1,2})?|unlink|detach)\b/i.test(normalized);
  if (isDeleteIntent) {
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
      // 1. Extraer nombre explícito del atributo si se especificó: ej. "elimina el atributo nacionalidad [en/de Autor]"
      const attrMatch = /(?:atributo|campo|field|attribute|propiedad|property)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(cleanedText || text);
      const requestedAttrName = attrMatch ? attrMatch[1]!.trim().toLowerCase() : undefined;

      // 2. Extraer clase objetivo si se especificó: ej. "en/de/para [la clase] Autor"
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
          // Si el atributo explícito solicitado no existe en la clase especificada,
          // EVITAR fallthrough catastrófico que borre la clase. Devolver deleciones vacías controladas.
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
        // Si no se encontró en ninguna clase, no borrar clases por error
        return {
          action: 'modify',
          deletions: {
            attributes: [],
          },
        };
      }

      // Fallback: si no hubo match explícito de "atributo <nombre>", buscar si algún atributo coincide
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

    // 1b. Si el usuario pide explícitamente borrar una CLASE específica (ej. "elimina la clase Multa que esta relacionada con Libro")
    const explicitClassTargetMatch = /(?:la\s+clase\s+|clase\s+|class\s+|tabla\s+|entidad\s+)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(cleanedText || text);
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

    // 1b2. Desvinculación limpia de clase de asociación (E4: "desvincula la clase de asociacion de Publicacion y Autor" o "quita la clase de asociacion")
    // Preserva la asociación binaria y las clases en el lienzo, restableciendo associationClassId a null.
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

    // 1d. Borrado de clase si se menciona exactamente una clase (y no era una orden de borrar atributo, método o relación)
    if (!isAttrTarget && !isRelTarget && !isMethodTarget && mentionedClasses.length === 1) {
      return {
        action: 'modify',
        deletions: {
          classes: [mentionedClasses[0]!.name],
        },
      };
    }
  }

  // 2. Renombrado de clase (ES y EN con pronombres enclíticos)
  const isClassRename =
    /(?:rename|renaming|renombr[aáeé]?(?:me|te|le|nos|les)?|change\s+name\s+of)\s+(?:la\s+clase\s+|clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text) ||
    /(?:cambi[aáeé]?(?:me|te|le|nos|les)?\s+el\s+nombre\s+de\s+(?:la\s+clase\s+|class\s+)?)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);

  if (isClassRename) {
    const fromName = isClassRename[1]?.trim();
    const toName = isClassRename[2]?.trim();
    const matchedClass = classes.find((c) => c.name.toLowerCase() === fromName?.toLowerCase());
    if (matchedClass && toName) {
      return {
        action: 'modify',
        renames: {
          classes: [
            {
              from: matchedClass.name,
              to: toName,
            },
          ],
        },
      };
    }
  }

  // 3. Mutación de clase a abstracta o interfaz (ES y EN)
  const isClassModIntent =
    /(?:abstract[ao]?|interfa[cz]|interface)/i.test(normalized) &&
    /(?:hac|haz|marc|cambi|modific|make|set|turn|convert|defin|sea|to\s+be|as)/i.test(normalized);

  if (isClassModIntent) {
    const wantsAbstract = /abstract/i.test(normalized);
    const wantsInterface = /interfa/i.test(normalized);

    // Priorizar la clase que está directamente adyacente a la declaración (ej. "hace que Multa sea abstracta")
    const explicitClassContext = /(?:clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:sea\s+|to\s+be\s+|as\s+)?(?:abstract|interfa)/i.exec(text) ||
      /(?:abstract[ao]?|interfa[cz]|interface).*?(?:para\s+|de\s+|in\s+|for\s+)(?:la\s+clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);

    let matchedClass: { id: string; name: string } | undefined;
    if (explicitClassContext) {
      const candName = explicitClassContext[1]?.toLowerCase();
      matchedClass = classes.find((c) => c.name.toLowerCase() === candName);
    }

    if (!matchedClass) {
      const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
      matchedClass = classes.find((c) => {
        const cNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const wordRegex = new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i');
        if (wordRegex.test(normalized)) return true;
        if (cleanedTextWithoutSpaces.includes(cNorm)) return true;
        return false;
      });
    }

    if (matchedClass) {
      return {
        action: 'modify',
        updates: {
          classes: [
            {
              name: matchedClass.name,
              isAbstract: wantsAbstract,
              classKind: wantsInterface ? 'interface' : 'class',
            },
          ],
        },
      };
    }
  }

  // 3a. Adición / modificación / renombrado determinista de métodos en una clase existente
  const isMethodIntent =
    /(?:agreg[aáeé]|a[ñn]ad[eé]|pon[eé]?|sum[aá]|add|insert[aáeé]|cre[aáeé]|create|cambi[aáeé]|modific[aáeé]|renombr[aáeé])/i.test(normalized) &&
    (/(?:m[eé]todos?|methods?|operaci[oó]ne?s?|operations?|funcio?ne?s?|functions?)\b/i.test(normalized) ||
      /\b[A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*\s*\([^)]*\)\s*(?::\s*[A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)?/i.test(text));

  if (isMethodIntent) {
    const methodTypeMap: Record<string, string> = {
      entero: 'int',
      entera: 'int',
      int: 'int',
      integer: 'int',
      numero: 'int',
      number: 'int',
      texto: 'string',
      cadena: 'string',
      string: 'string',
      str: 'string',
      booleano: 'boolean',
      booleana: 'boolean',
      bool: 'boolean',
      boolean: 'boolean',
      fecha: 'date',
      date: 'date',
      timestamp: 'date',
      datetime: 'date',
      decimal: 'float',
      float: 'float',
      double: 'float',
      real: 'float',
      void: 'void',
      vacio: 'void',
      vacío: 'void',
      nada: 'void',
    };

    let targetClass: { id: string; name: string } | undefined;
    for (const cls of classes) {
      const cNorm = cls.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i').test(normalized)) {
        targetClass = cls;
        break;
      }
    }

    // Renombrado de método: "renombra el metodo <A> a/por <B>"
    const methodRenameMatch =
      /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+del?\s+m[eé]todo)\s+(?:el\s+m[eé]todo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(
        text
      );
    if (methodRenameMatch && targetClass) {
      const fromName = methodRenameMatch[1]!.trim();
      const toName = methodRenameMatch[2]!.trim();
      return {
        action: 'modify',
        renames: {
          methods: [
            {
              class: targetClass.name,
              from: fromName,
              to: toName,
            },
          ],
        },
      };
    }

    let methodName = '';
    let returnType = 'void';
    let params: Array<{ name: string; type: string }> = [];

    // Signature match: e.g. "calcularRegalias(porcentaje:float):float" or "calcular()"
    const sigMatch =
      /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s*\(([^)]*)\)(?:\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*))?/i.exec(
        text
      );

    if (sigMatch) {
      methodName = sigMatch[1]!.trim();
      const rawParams = sigMatch[2]?.trim();
      const rawRet = sigMatch[3]?.trim();
      if (rawRet) {
        const normRet = stripAccents(rawRet.toLowerCase());
        returnType = methodTypeMap[normRet] || rawRet;
      }
      if (rawParams) {
        const paramItems = rawParams.split(',').map((p) => p.trim()).filter(Boolean);
        for (const item of paramItems) {
          const colonMatch = /([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/.exec(item);
          if (colonMatch) {
            const pName = colonMatch[1]!.trim();
            const pTypeRaw = stripAccents(colonMatch[2]!.trim().toLowerCase());
            params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
          } else {
            const spaceParts = item.split(/\s+/);
            if (spaceParts.length >= 2) {
              const pName = spaceParts[0]!.trim();
              const pTypeRaw = stripAccents(spaceParts[1]!.trim().toLowerCase());
              params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
            } else if (spaceParts[0]) {
              params.push({ name: spaceParts[0].trim(), type: 'string' });
            }
          }
        }
      }
    } else {
      const nameMatch = /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (nameMatch) {
        methodName = nameMatch[1]!.trim();
      }
      const retMatch = /(?:devuelve|retorna|retorne|regrese|que\s+devuelva|returns?)\s+(?:un\s+|una\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (retMatch) {
        const normRet = stripAccents(retMatch[1]!.toLowerCase());
        returnType = methodTypeMap[normRet] || retMatch[1]!;
      }
      const paramMatch = /(?:recibe|con\s+par[aá]metro|par[aá]metro)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)(?:\s+(?:de\s+tipo|tipo|type|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*))?/i.exec(text);
      if (paramMatch) {
        const pName = paramMatch[1]!.trim();
        const pTypeRaw = paramMatch[2] ? stripAccents(paramMatch[2].trim().toLowerCase()) : 'string';
        params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
      }
    }

    const stopWords = new Set(['el', 'la', 'un', 'una', 'clase', 'class', 'metodo', 'método']);
    if (stopWords.has(methodName.toLowerCase())) methodName = '';

    if (!targetClass && methodName) {
      for (const cls of classes) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        if (fullCls && Array.isArray(fullCls.methods)) {
          const hasM = fullCls.methods.some((m: any) => m.name && m.name.toLowerCase() === methodName.toLowerCase());
          if (hasM) {
            targetClass = cls;
            break;
          }
        }
      }
    }

    if (targetClass && methodName) {
      const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetClass!.id);
      const existingMethod = fullCls?.methods?.find((m: any) => m.name && m.name.toLowerCase().trim() === methodName.toLowerCase());
      if (existingMethod || /(?:cambi|modific|pas|change|modify)/i.test(normalized)) {
        return {
          action: 'modify',
          updates: {
            methods: [
              {
                class: targetClass.name,
                name: methodName,
                returnType,
                parameters: params.length > 0 ? params : (existingMethod?.parameters ?? []),
              },
            ],
          },
        };
      }

      return {
        action: 'modify',
        classes: [
          {
            name: targetClass.name,
            methods: [
              {
                name: methodName,
                returnType,
                parameters: params,
                visibility: '+',
              },
            ],
          },
        ],
      };
    }
  }

  // 3b. Adición / modificación / renombrado determinista de atributos en una clase existente
  // Ejemplos:
  // - "a la clase prestamo agregarle un id de tipo entero"
  // - "cambia el tipo del atributo id en Prestamo a string"
  // - "cambia el tipo de fechaDevolucion a string" (infiere que pertenece a Prestamo)
  // - "renombra el atributo fechaDevolucion a fechaEntrega en Prestamo"
  const isAttrIntent =
    !isMethodIntent &&
    /(?:agreg[aáeé]|a[ñn]ad[eé]|pon[eé]?|sum[aá]|add|insert[aáeé]|set|cambi[aáeé]|modific[aáeé]|pas[aáeé]|change|modify|renombr[aáeé]|rename)/i.test(normalized) &&
    /(?:atributo|campo|field|attribute|propiedad|property|tipo\s+de|un\s+id|el\s+id|id\b|:\s*(?:int|string|date|boolean|float|integer|texto|fecha|booleano|numero))/i.test(normalized);

  if (isAttrIntent) {
    const typeMap: Record<string, string> = {
      entero: 'int',
      entera: 'int',
      int: 'int',
      integer: 'int',
      numero: 'int',
      number: 'int',
      texto: 'string',
      cadena: 'string',
      string: 'string',
      str: 'string',
      booleano: 'boolean',
      booleana: 'boolean',
      bool: 'boolean',
      boolean: 'boolean',
      fecha: 'date',
      date: 'date',
      timestamp: 'date',
      datetime: 'date',
      decimal: 'float',
      float: 'float',
      double: 'float',
      real: 'float',
    };

    let attrName = '';
    let attrType = 'string';
    let newAttrName = '';
    let matchedCandClass: string | undefined;

    // Patrón renombrar atributo: "renombra el atributo <A> a/por <B>"
    const attrRenameMatch =
      /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+del?\s+atributo)\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón clase al inicio con mutación de atributo (cambio de tipo o renombrado)
    // ej: "a la tabla materia cambiale el atribut id a id_materia"
    // ej: "a la tabla alunmo cambiale el id tipo int a tipo float"
    const attrMutateClassInverted =
      /(?:a|en|para)\s+(?:(?:la|el)\s+)?(?:clase|tabla|entidad)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aáeé]le|cambi[aáeé]|renombr[aáeé]|modific[aáeé]|edit[aáeé]|pas[aáeé]|set)\s+(?:el\s+nombre\s+del?\s+|el\s+|la\s+)?(?:tipo\s+del?\s+|attributes?|atributos?|atributs?|campos?|columnas?|propiedades?|properties|fields?)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:de\s+tipo|tipo)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)?\s+(?:para\s+que\s+sea|a|por|to)\s+(?:(?:el\s+)?nombre\s+)?(?:tipo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const hasTipoKeyword = /\b(?:de\s+tipo|tipo|type)\s+[A-Za-z_]/i.test(text);
    const targetWord = attrMutateClassInverted ? stripAccents(attrMutateClassInverted[3]!.toLowerCase()) : '';
    const isTargetType = Boolean(typeMap[targetWord]);

    // Patrón cambio de tipo con clase intermedia: "cambia el tipo de <A> en <Clase> a <Tipo>"
    const changeTypeWithClass =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón cambio de tipo con clase al inicio: "en <Clase> cambia el tipo de <A> a <Tipo>"
    const changeTypeClassFirst =
      /(?:en|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón cambio de tipo directo: "cambia el tipo de <A> a <Tipo> [en <Clase>]"
    const changeTypeDirect =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      ) ||
      /(?:cambi[aáeé]|modific[aáeé])\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      );

    // Patrón atributo:tipo
    const attrColonMatch =
      /(?:atributo|campo|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón general: "<A> de tipo <Tipo>"
    const attrWithTypeMatch =
      /(?:(?:un|el|el\s+atributo|un\s+atributo|atributo|campo|field|property)\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:de\s+tipo|tipo|type|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const idDirectMatch =
      /(?:un\s+id|el\s+id|id)\s*(?:de\s+tipo|tipo|type|as)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)?/i.exec(
        text
      );

    if (attrRenameMatch) {
      attrName = attrRenameMatch[1]!;
      newAttrName = attrRenameMatch[2]!;
    } else if (attrMutateClassInverted && !hasTipoKeyword && !isTargetType) {
      matchedCandClass = attrMutateClassInverted[1]!;
      attrName = attrMutateClassInverted[2]!;
      newAttrName = attrMutateClassInverted[3]!;
    } else if (attrMutateClassInverted && (hasTipoKeyword || isTargetType)) {
      matchedCandClass = attrMutateClassInverted[1]!;
      attrName = attrMutateClassInverted[2]!;
      const rawType = stripAccents(attrMutateClassInverted[3]!);
      attrType = typeMap[rawType] || rawType;
    } else if (changeTypeWithClass) {
      attrName = changeTypeWithClass[1]!;
      matchedCandClass = changeTypeWithClass[2]!;
      const rawType = stripAccents(changeTypeWithClass[3]!);
      attrType = typeMap[rawType] || rawType;
    } else if (changeTypeClassFirst) {
      matchedCandClass = changeTypeClassFirst[1]!;
      attrName = changeTypeClassFirst[2]!;
      const rawType = stripAccents(changeTypeClassFirst[3]!);
      attrType = typeMap[rawType] || rawType;
    } else if (changeTypeDirect) {
      attrName = changeTypeDirect[1]!;
      const rawType = stripAccents(changeTypeDirect[2]!);
      attrType = typeMap[rawType] || rawType;
      if (changeTypeDirect[3]) matchedCandClass = changeTypeDirect[3];
    } else if (attrColonMatch) {
      attrName = attrColonMatch[1]!;
      const rawType = stripAccents(attrColonMatch[2]!);
      attrType = typeMap[rawType] || rawType;
    } else if (attrWithTypeMatch) {
      const candName = attrWithTypeMatch[1]!;
      const stopWords = new Set(['clase', 'class', 'tipo', 'type', 'de', 'la', 'el', 'un', 'una', 'of', 'in', 'into', 'for', 'to']);
      if (!stopWords.has(candName.toLowerCase())) {
        attrName = candName;
        const rawType = stripAccents(attrWithTypeMatch[2]!);
        attrType = typeMap[rawType] || rawType;
      }
    } else if (idDirectMatch) {
      attrName = 'id';
      const rawType = idDirectMatch[1] ? stripAccents(idDirectMatch[1]) : 'int';
      attrType = typeMap[rawType] || 'int';
    }

    // Buscar clase objetivo
    let targetClass: { id: string; name: string } | undefined;
    if (matchedCandClass) {
      const match = findClosestClassName(matchedCandClass, classes);
      if (match && match.distance <= 2) {
        targetClass = classes.find((c) => c.name.toLowerCase() === match.matchedName.toLowerCase());
      }
    }
    const targetClassMatch =
      /(?:a\s+la\s+clase|en\s+la\s+clase|para\s+la\s+clase|de\s+la\s+clase|to\s+class|in\s+class|on\s+class|a|en|para)\s+(?:de\s+asociaci[oó]n\s+)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
    if (targetClassMatch) {
      const cand = targetClassMatch[1]!;
      const match = findClosestClassName(cand, classes);
      if (match && match.distance <= 2) {
        targetClass = classes.find((c) => c.name.toLowerCase() === match.matchedName.toLowerCase());
      }
    }

    if (!targetClass) {
      for (const cls of classes) {
        const cNorm = stripAccents(cls.name);
        if (normalized.includes(cNorm)) {
          targetClass = cls;
          break;
        }
      }
    }

    // Si la clase no fue nombrada explícitamente, buscar qué clase del lienzo posee este atributo
    if (!targetClass && attrName) {
      const aNorm = attrName.toLowerCase();
      for (const cls of classes) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        if (fullCls && Array.isArray(fullCls.attributes)) {
          const hasAttr = fullCls.attributes.some((a: any) => a.name && a.name.toLowerCase() === aNorm);
          if (hasAttr) {
            targetClass = cls;
            break;
          }
        }
      }
    }

    if (targetClass) {
      // Soporte para múltiples atributos simultáneos: ej. "agregale numeroEdicion:int y anio:int"
      const allColonMatches = Array.from(
        text.matchAll(/([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/g)
      );

      if (allColonMatches.length > 1 && !/(?:cambi|modific|pas|renombr)/i.test(normalized)) {
        const multiAttrs = allColonMatches.map((m) => {
          const name = m[1]!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');
          const rawType = stripAccents(m[2]!);
          return {
            name,
            type: typeMap[rawType] || rawType,
            visibility: '+',
          };
        });

        return {
          action: 'modify',
          classes: [
            {
              name: targetClass.name,
              attributes: multiAttrs,
            },
          ],
        };
      }

      if (attrName) {
        const cleanAttrName = attrName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');

        // Caso Renombrado de atributo
        if (newAttrName) {
          const cleanNewName = newAttrName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');
          return {
            action: 'modify',
            renames: {
              attributes: [
                {
                  class: targetClass.name,
                  from: cleanAttrName,
                  to: cleanNewName,
                },
              ],
            },
          };
        }

        // Comprobar si el atributo ya existe en la clase (en cuyo caso es una modificación de tipo)
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetClass!.id);
        const existingAttr = fullCls?.attributes?.find((a: any) => a.name && a.name.toLowerCase() === cleanAttrName.toLowerCase());

        if (existingAttr || /(?:cambi|modific|pas|change|modify)/i.test(normalized)) {
          return {
            action: 'modify',
            updates: {
              attributes: [
                {
                  class: targetClass.name,
                  name: cleanAttrName,
                  type: attrType,
                },
              ],
            },
          };
        }

        // Si es adición de nuevo atributo
        return {
          action: 'modify',
          classes: [
            {
              name: targetClass.name,
              attributes: [
                {
                  name: cleanAttrName,
                  type: attrType,
                  visibility: '+',
                },
              ],
            },
          ],
        };
      }
    }
  }

  // 3c. Mutación de multiplicidades, roles y clases de asociación en relaciones existentes
  const isMultiplicityOrRoleIntent =
    /(?:multiplicidad|cardinalidad|multiplicity|cardinality|rol\b|role\b|clase\s+de\s+asociaci[oó]n)/i.test(normalized) ||
    (/(?:cambi|modific|pon|set|change|modify|ajust)/i.test(normalized) &&
      /(?:1\.\.\*|0\.\.\*|0\.\.1|\b1\b\s+a\s+\*|\b1\b\s+a\s+muchos|muchos\s+a\s+\b1\b|muchos\s+a\s+muchos|uno\s+a\s+muchos|muchos\s+a\s+uno|uno\s+a\s+uno)/i.test(normalized));

  if (isMultiplicityOrRoleIntent && associations.length > 0) {
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

      // Extracción de multiplicidades explícitas (ej: "1..* y 1", "uno a muchos", "1 a *")
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

      // Si se especificó una sola multiplicidad con "a <mult>"
      if (!sourceMultiplicity && !targetMultiplicity) {
        const singleMultMatch = /(?:multiplicidad\s+(?:sea\s+|a\s+|por\s+)?|a\s+)(1\.\.\*|0\.\.\*|0\.\.1|\*|1)/i.exec(text);
        if (singleMultMatch) {
          const val = singleMultMatch[1] === '*' ? '1..*' : singleMultMatch[1]!;
          targetMultiplicity = val;
        }
      }

      // Extracción de roles (sourceRole / targetRole)
      let sourceRole: string | undefined;
      let targetRole: string | undefined;
      const roleOriginMatch = /(?:rol\s+origen|source\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
      if (roleOriginMatch) sourceRole = roleOriginMatch[1];
      const roleDestMatch = /(?:rol\s+destino|target\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
      if (roleDestMatch) targetRole = roleDestMatch[1];

      // Extracción de clase de asociación
      let assocClass: string | undefined;
      const assocClassMatch = /(?:clase\s+de\s+asociaci[oó]n|association\s+class)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
      if (assocClassMatch) {
        const candClass = assocClassMatch[1]!;
        const foundAssocCls = classes.find((c) => c.name.toLowerCase() === candClass.toLowerCase());
        if (foundAssocCls) assocClass = foundAssocCls.name;
      }

      // Extracción del nombre de la relación (ej: "llamada dicta", "con nombre dicta", "de nombre dicta")
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
  }

  // 3d. Adición o vinculación de Clase de Asociación / Tabla Intermedia (con nombre explícito o autogenerado PascalCase)
  const isAssocClassCreate =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[oó]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table)/i.test(normalized) &&
    /(?:agreg[aáeé]|a[ñn]ad[eé]|cre[aáeé]|pon[eé]?|sum[aá]|add|insert|asoci[aáeé]|asign[aáeé]|convert|link|connect)/i.test(normalized);

  if (isAssocClassCreate && classes.length >= 2) {
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

      // Buscar si el usuario dio un nombre explícito a la clase de asociación / tabla intermedia
      let assocClassName: string | undefined;
      const explicitNameMatch =
        /(?:llamada|nombrada|con\s+el\s+nombre|named)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text) ||
        /(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?\s+(?:entre|between)/i.exec(text) ||
        /(?:mediante|a\s+trav[eé]s\s+de|via|using|through)\s+(?:(?:la|una|the|an?)\s+)?(?:clase\s+de\s+asociaci[oó]n|association\s+class|tabla\s+de\s+asociaci[oó]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);

      if (explicitNameMatch) {
        assocClassName = explicitNameMatch[1];
      } else {
        // Convención estándar: concatenar en PascalCase ambos extremos (ej. EstudianteCurso)
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
  }

  // 3e. Adición de Asociación N-aria (diamante central conectando 3+ clases)
  const isNaryCreate =
    /(?:n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized) &&
    /(?:cre[aáeé]|agreg[aáeé]|a[ñn]ad[eé]|pon[eé]|conect[aáeé]|arm[aáeé]|hac[eé]|haz)/i.test(normalized);

  if (isNaryCreate && classes.length >= 3) {
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
  }

  // 3d. Inversión de relación / rombo / dirección / multiplicidad
  const isRelationInvert =
    /(?:(?:invert[ií]|invierte|inviert|invierta|invertir)(?:me|te|le|les|nos)?(?:l[oas]{1,2})?|da(?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:la\s+|el\s+)?vuelta|dalo\s+vuelta|dala\s+vuelta|dalos\s+vuelta|dalas\s+vuelta|dar\s+vuelta|gir[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|girar|volte[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|voltear|rot[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?|rotar|cambi[aáeé](?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:de\s+)?lado|pon(?:e|é)?(?:me|te|le|les|nos)?(?:l[oas]{1,2})?\s+(?:al\s+rev[eé]s|del\s+otro\s+lado)|flip|reverse|swap)\b/i.test(
      normalized
    ) &&
    /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|generalizaci[oó]n|herencia|multiplicidad|cardinalidad|rombo|nodo|flecha|lado|sentido|direccion|direcci[oó]n|diamond|arrow|relation|association|composition|aggregation|generalization|inheritance|multiplicity)/i.test(
      normalized
    );

  if (isRelationInvert) {
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
          const fg = (currentDiagram.generalizations || []).find(
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
      const fg = (currentDiagram.generalizations || []).find(
        (g: any) => g.subClassId === c.id || g.superClassId === c.id
      );
      if (fg) targetGen = fg;
    }

    if (!targetAssoc && !targetGen) {
      if (associations.length === 1) targetAssoc = associations[0];
      else if ((currentDiagram.generalizations || []).length === 1) targetGen = currentDiagram.generalizations[0];
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
  }

  // 4. Mutación de relación (asociación <-> composición <-> agregación <-> generalización <-> realización <-> dependencia)
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
      /(?:cambi|modific|pas[aá]|convert|turn|relaci[oó]n|hac|haz|sea|hered|subclase|superclase|extends|implement|depend)/i.test(normalized)));

  if (isRelationChange) {
    let targetAggregation: 'composite' | 'shared' | 'none' = 'none';
    if (/(?:composici[oó]n|composition|composite|compone|rombo\s+negro|black\s+diamond)/i.test(normalized)) {
      targetAggregation = 'composite';
    } else if (/(?:agregaci[oó]n|aggregation|shared|rombo\s+blanco|white\s+diamond)/i.test(normalized)) {
      targetAggregation = 'shared';
    } else if (/(?:asociaci[oó]n\s+simple|asociaci[oó]n\b|simple|plain\s+association)/i.test(normalized)) {
      targetAggregation = 'none';
    }

    // Extracción explícita de la entidad "todo" (contenedor donde va el rombo)
    const wholeMatch =
      /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      ) ||
      /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is|diamond\s+on)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );
    const rawWholeName = wholeMatch ? wholeMatch[1]?.toLowerCase() : undefined;

    // Buscar qué clases del lienzo están mencionadas en el texto (con soporte para plurales: prestamos -> prestamo)
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

    // Ordenar por longitud de nombre descendente para priorizar clases más específicas
    // (ej. 'PrestamoLibro' tiene precedencia sobre 'Prestamo' si ambas coinciden en el texto)
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

    const generalizations: Array<any> = currentDiagram.generalizations || [];
    const realizations: Array<any> = currentDiagram.realizations || [];
    const dependencies: Array<any> = currentDiagram.dependencies || [];

    // Helper para determinar el orden de subclase/superclase
    const resolveHierarchyOrder = (clsA: { id: string; name: string }, clsB: { id: string; name: string }): { subclass: { id: string; name: string }; superclass: { id: string; name: string } } => {
      const aNorm = clsA.name.toLowerCase();
      const bNorm = clsB.name.toLowerCase();
      // "A hereda de B" o "A es subclase de B"
      if (new RegExp(`${aNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${bNorm}`, 'i').test(normalized)) {
        return { subclass: clsA, superclass: clsB };
      }
      if (new RegExp(`${bNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${aNorm}`, 'i').test(normalized)) {
        return { subclass: clsB, superclass: clsA };
      }
      // "B es padre de A" o "B es superclase de A"
      if (new RegExp(`${bNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${aNorm}`, 'i').test(normalized)) {
        return { subclass: clsA, superclass: clsB };
      }
      if (new RegExp(`${aNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${bNorm}`, 'i').test(normalized)) {
        return { subclass: clsB, superclass: clsA };
      }
      // Orden de aparición en el texto: el primero mencionado suele ser la entidad especializada (ej. "entre ejemplar y prestamo")
      const posA = normalized.indexOf(aNorm);
      const posB = normalized.indexOf(bNorm);
      if (posA !== -1 && posB !== -1 && posA <= posB) {
        return { subclass: clsA, superclass: clsB };
      }
      return { subclass: clsB, superclass: clsA };
    };

    if (mentionedClasses.length >= 2) {
      // Evaluar todas las combinaciones posibles de pares de clases mencionadas contra las asociaciones y generalizaciones existentes en el lienzo
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

      // Si no existe asociación/generalización previa, respetar el orden de aparición en el texto
      // (el primer mencionado es source y el segundo target)
      if (!sourceCls && !targetCls && mentionedClasses.length >= 2) {
        const pos1 = normalized.indexOf(c1.name.toLowerCase());
        const pos2 = normalized.indexOf(c2.name.toLowerCase());
        if (pos1 !== -1 && pos2 !== -1 && pos1 > pos2) {
          const temp = c1;
          c1 = c2;
          c2 = temp;
        }
      }

      // Caso 4A: El usuario pide GENERALIZACIÓN / HERENCIA
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

      // Caso 4B: El usuario pide REALIZACIÓN (interfaz)
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

      // Caso 4C: El usuario pide DEPENDENCIA
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

      // Caso 4D: El usuario pide cambiar a ASOCIACIÓN / AGREGACIÓN / COMPOSICIÓN
      // Si existía una generalización previa entre ellos, la eliminamos para dar paso a la asociación
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

        return {
          action: 'modify',
          updates: {
            associations: [updateAssoc],
          },
        };
      }

      // Si no existe asociación previa entre las dos clases, creamos la asociación con el tipo de agregación requerido
      const calcEnd = resolveAggregationEnd(c1, c2);
      let srcMult = '1';
      let tgtMult = '1..*';
      const explicit = extractExplicitMultiplicities(text, c1.name, c2.name);
      if (explicit) {
        if (explicit.sourceMultiplicity) srcMult = explicit.sourceMultiplicity;
        if (explicit.targetMultiplicity) tgtMult = explicit.targetMultiplicity;
      }
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
          },
        ],
      };
    } else if (mentionedClasses.length === 1) {
      // Si se menciona exactamente una clase y tiene una única asociación conectada en el lienzo
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
      // Si el lienzo tiene una sola asociación y el usuario pide cambiar el tipo de relación
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
  }

  return null;
}
