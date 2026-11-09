import type { SemanticDomainModel } from '../delta-generator.js';

/**
 * 0b, 0c, 0d, 0e: Parsers rápidos y directos de adición, cambio de tipo y renombrado de atributos y métodos.
 */
export function parseFastMemberCommands(
  cleanedText: string,
  text: string,
  currentDiagram: any,
  classes: Array<{ id: string; name: string }>
): SemanticDomainModel | null {
  // 0b. Agregar atributo a una clase existente deterministamente
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

  return null;
}
