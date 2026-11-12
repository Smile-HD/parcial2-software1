import {
  cleanClassName,
  parseAttributesFromProse,
  extractExplicitMultiplicities,
  type SemanticDomainModel,
} from '../delta-generator.js';

/**
 * 0. Creación determinista de una nueva clase con atributos explícitos y/o asociación.
 */
export function parseCreateClassCommand(
  cleanedText: string,
  text: string,
  normalized: string
): SemanticDomainModel | null {
  const isSpecialClassIntent =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class|n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized);

  const createClassRegex = /^\s*(?:(?:cre[aáeé]|crear|create|a[ñn]ad[eé]|agreg[aáeé]|insert[aáeé]|hac[eé]|haz|arm[aáeé]|gener[aáeé]|defin[eíi]|model[aáeé]|dise[ñn][aáeé])(?:me|te|le|les|nos)?(?:l[oas]{1,2})?|add|new|make)\s+(?:la|el|una|un|nueva|nuevo)?\s*(?:(abstracta|abstract)\s+)?(?:(clase|calse|clse|class|tabla|entidad|interfaz|interface)\s+)?(?:(abstracta|abstract)\s+)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?(.*)$/i;

  const createClassIntent = !isSpecialClassIntent
    ? createClassRegex.exec(cleanedText) ||
      createClassRegex.exec(text.replace(/^@\w+\s*/, ''))
    : null;

  if (createClassIntent) {
    const isAbstract = !!(createClassIntent[1] || createClassIntent[3]);
    const isInterface = /(?:interfaz|interface)/i.test(createClassIntent[2] || '');
    const rawClassName = createClassIntent[4]!.trim();
    const className = cleanClassName(rawClassName);
    const remainder = createClassIntent[5]?.trim() || '';

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
        ...(isAbstract ? { isAbstract: true } : {}),
        ...(isInterface ? { isInterface: true, classKind: 'interface' as const } : {}),
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

  return null;
}

/**
 * 2. Renombrado de clase (ES y EN con pronombres enclíticos).
 */
export function parseClassRenameCommand(
  text: string,
  classes: Array<{ id: string; name: string }>
): SemanticDomainModel | null {
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

  return null;
}

/**
 * 3. Mutación de clase a abstracta o interfaz (ES y EN).
 */
export function parseClassKindOrAbstractCommand(
  text: string,
  normalized: string,
  classes: Array<{ id: string; name: string }>
): SemanticDomainModel | null {
  const isClassModIntent =
    /(?:abstract[ao]?|interfa[cz]|interface)/i.test(normalized) &&
    /(?:hac|haz|marc|cambi|modific|make|set|turn|convert|defin|sea|to\s+be|as)/i.test(normalized);

  if (isClassModIntent) {
    const wantsAbstract = /abstract/i.test(normalized);
    const wantsInterface = /interfa/i.test(normalized);

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

  return null;
}
