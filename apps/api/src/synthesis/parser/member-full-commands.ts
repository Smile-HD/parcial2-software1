import { stripAccents, findClosestClassName } from '@app/adapters-ai';
import type { SemanticDomainModel } from '../delta-generator.js';

/**
 * 3a y 3b: Parsers completos de métodos y atributos con soporte semántico de tipos, firmas y sobrecargas.
 */
export function parseFullMemberCommands(
  text: string,
  normalized: string,
  currentDiagram: any,
  classes: Array<{ id: string; name: string }>
): SemanticDomainModel | null {
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

    const attrRenameMatch =
      /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+del?\s+atributo)\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const attrMutateClassInverted =
      /(?:a|en|para)\s+(?:(?:la|el)\s+)?(?:clase|tabla|entidad)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aáeé]le|cambi[aáeé]|renombr[aáeé]|modific[aáeé]|edit[aáeé]|pas[aáeé]|set)\s+(?:el\s+nombre\s+del?\s+|el\s+|la\s+)?(?:tipo\s+del?\s+|attributes?|atributos?|atributs?|campos?|columnas?|propiedades?|properties|fields?)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:de\s+tipo|tipo)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)?\s+(?:para\s+que\s+sea|a|por|to)\s+(?:(?:el\s+)?nombre\s+)?(?:tipo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const hasTipoKeyword = /\b(?:de\s+tipo|tipo|type)\s+[A-Za-z_]/i.test(text);
    const targetWord = attrMutateClassInverted ? stripAccents(attrMutateClassInverted[3]!.toLowerCase()) : '';
    const isTargetType = Boolean(typeMap[targetWord]);

    const changeTypeWithClass =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const changeTypeClassFirst =
      /(?:en|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const changeTypeDirect =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      ) ||
      /(?:cambi[aáeé]|modific[aáeé])\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      );

    const attrColonMatch =
      /(?:atributo|campo|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

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

  return null;
}
