/**
 * Diagram Factual Query Resolver
 *
 * Resuelve consultas factuales y de solo lectura sobre el estado del diagrama UML
 * de forma 100% determinista, con latencia de 0 ms y sin alucinaciones de LLM.
 *
 * Principio arquitectónico: Los datos duros del lienzo (clases existentes,
 * atributos, métodos, multiplicidades, tipos de relación) deben provenir del
 * modelo en memoria, nunca de generación probabilística.
 */

export interface DiagramFactualResolution {
  handled: boolean;
  reply: string;
}

function normalizeStr(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Intenta resolver una consulta del usuario contra el estado del diagrama.
 * Devuelve null si la consulta no es una pregunta factual de inspección del diagrama.
 */
export function resolveDiagramFactualQuery(
  userQuery: string,
  diagram?: any,
  language: 'es' | 'en' = 'es'
): string | null {
  if (!diagram) return null;

  const rawNorm = normalizeStr(userQuery);
  const isEn = language === 'en' || /\b(?:how many|what classes|list attributes|where does)\b/i.test(userQuery);

  // Si la instrucción es una acción imperativa de modelado (crear, agregar, modificar, eliminar),
  // NUNCA debe ser tratada como consulta factual de lectura.
  // Abarca pronombres enclíticos (cambiame, cambiale, modificame, etc.) y sinónimos en inglés.
  const isImperativeAction =
    /(?:^|\s)(?:cre[aáeé]|crear|agreg[aáeé]|agregar|a[ñn]ad[eé]|a[ñn]adir|dise[ñn][aáeé]|model[aáeé]|constru[yí]|arm[aáeé]|incorpor[aáeé]|insert[aáeé]|borr[aáeé]|elimin[aáeé]|quit[aáeé]|conect[aáeé]|vincul[aáeé]|desvincul[aáeé]?|desasoci[aáeé]?|relacion[aáeé]|cambi[aáeé]|modific[aáeé]|renombr[aáeé]|actualiz[aáeé]|edit[aáeé]|pon(?:e|ga|ed)?|hac[eé]|haz)(?:me|le|les|lo|la|los|las|nos)?\b/i.test(
      rawNorm
    ) ||
    /\b(?:add|create|make|build|insert|delete|remove|drop|connect|link|unlink|detach|change|modify|update|rename|switch|convert|transform|turn|set)\b/i.test(
      rawNorm
    );

  // Cláusulas explícitas de mutación de relaciones o clases (ES y EN)
  const isExplicitMutationClause =
    /(?:a|por|en|to|into)\s+(?:una?\s+|an?\s+)?(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|association|generalization|inheritance|realization|dependency)/i.test(rawNorm) ||
    /(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)/i.test(rawNorm) ||
    /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is)/i.test(rawNorm) ||
    /(?:rombo\s+(?:negro|blanco)|(?:black|white)\s+diamond)/i.test(rawNorm) ||
    /(?:abstract[ao]?|interfa[cz]|interface)/i.test(rawNorm);

  const isQuestionPrefix = /^(?:c[oó]mo\s+(?:se\s+)?|qu[eé]\s+|how\s+(?:to|many|is|are)|what\s+is|can\s+you\s+explain|por\s*qu[eé]|why|is\s+there)/i.test(rawNorm);

  if ((isImperativeAction || isExplicitMutationClause) && !isQuestionPrefix) {
    return null;
  }

  const classes: any[] = Array.isArray(diagram.classes) ? diagram.classes : [];
  const associations: any[] = Array.isArray(diagram.associations) ? diagram.associations : [];
  const generalizations: any[] = Array.isArray(diagram.generalizations) ? diagram.generalizations : [];
  const realizations: any[] = Array.isArray(diagram.realizations) ? diagram.realizations : [];
  const dependencies: any[] = Array.isArray(diagram.dependencies) ? diagram.dependencies : [];

  const classMap = new Map<string, any>();
  for (const c of classes) {
    if (c && c.id) classMap.set(c.id, c);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Conteo y listado general de clases
  // Ej: "Cuantas clases tiene el diagrama y como se llaman?", "List classes", "Qué clases hay"
  // ─────────────────────────────────────────────────────────────────────────────
  const isClassListOrCount =
    /(?:cu[aá]ntas?\s+clases?\s+(?:tiene|hay|existen)|c[oó]mo\s+se\s+llaman\s+(?:las\s+clases|todas)|qu[eé]\s+clases?\s+(?:tiene|hay|existen|est[aá]n)|list(?:a|ar)?\s+(?:las\s+)?clases|how\s+many\s+classes|what\s+classes\s+(?:are\s+there|exist)|list\s+(?:the\s+)?classes)/i.test(
      rawNorm
    ) && !/(?:atributo|metodo|relacion|multiplicidad)/i.test(rawNorm);

  if (isClassListOrCount) {
    if (classes.length === 0) {
      return isEn
        ? 'The diagram currently has no classes on the canvas.'
        : 'El diagrama actual no tiene clases en el lienzo todavía.';
    }
    const names = classes.map((c) => `"${c.name}"`).join(', ');
    if (isEn) {
      return `The current diagram has ${classes.length} classes: ${names}.`;
    }
    return `El diagrama actual tiene ${classes.length} clases: ${names}.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Relación y multiplicidad entre dos clases específicas
  // Ej: "Relacion entre Pasajero y Viaje y que multiplicidad tiene?",
  //     "Cual es la relacion entre Viaje y Pasajero?"
  // ─────────────────────────────────────────────────────────────────────────────
  const isRelationshipQuery =
    /(?:relaci[oó]n|conexi[oó]n|asociaci[oó]n|multiplicidad|conectad[ao]s?|relationship|multiplicity|connection|connected)/i.test(
      rawNorm
    ) && /(?:entre|between|con|and|y)\b/i.test(rawNorm);

  if (isRelationshipQuery && classes.length > 0) {
    // Buscar pares de clases presentes en la consulta
    const mentionedClasses = classes.filter((c) => {
      const cNorm = normalizeStr(c.name);
      return (
        rawNorm.includes(cNorm) ||
        new RegExp(`\\b${cNorm}\\b`, 'i').test(rawNorm)
      );
    });

    const alsoAsksCount =
      /(?:cu[aá]ntas?\s+clases?\s+(?:tiene|hay|existen)|c[oó]mo\s+se\s+llaman\s+(?:las\s+clases|todas)|qu[eé]\s+clases?\s+(?:tiene|hay|existen|est[aá]n)|how\s+many\s+classes|what\s+classes\s+(?:are\s+there|exist))/i.test(
        rawNorm
      );
    const countPrefix = alsoAsksCount
      ? isEn
        ? `The current diagram has ${classes.length} classes. `
        : `El diagrama actual tiene ${classes.length} clases. `
      : '';

    if (mentionedClasses.length >= 2) {
      const c1 = mentionedClasses[0];
      const c2 = mentionedClasses[1];

      // Buscar asociación directa
      const assoc = associations.find(
        (a) =>
          (a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
          (a.sourceClassId === c2.id && a.targetClassId === c1.id)
      );

      // Buscar generalización (herencia)
      const gen = generalizations.find(
        (g) =>
          (g.subClassId === c1.id && g.superClassId === c2.id) ||
          (g.subClassId === c2.id && g.superClassId === c1.id) ||
          (g.sourceClassId === c1.id && g.targetClassId === c2.id) ||
          (g.sourceClassId === c2.id && g.targetClassId === c1.id)
      );

      // Buscar realización
      const real = realizations.find(
        (r) =>
          (r.clientClassId === c1.id && r.supplierInterfaceId === c2.id) ||
          (r.clientClassId === c2.id && r.supplierInterfaceId === c1.id) ||
          (r.sourceClassId === c1.id && r.targetClassId === c2.id) ||
          (r.sourceClassId === c2.id && r.targetClassId === c1.id)
      );

      // Buscar dependencia
      const dep = dependencies.find(
        (d) =>
          (d.clientClassId === c1.id && d.supplierClassId === c2.id) ||
          (d.clientClassId === c2.id && d.supplierClassId === c1.id) ||
          (d.sourceClassId === c1.id && d.targetClassId === c2.id) ||
          (d.sourceClassId === c2.id && d.targetClassId === c1.id)
      );

      if (assoc) {
        const srcCls = classMap.get(assoc.sourceClassId);
        const tgtCls = classMap.get(assoc.targetClassId);
        const srcName = srcCls ? srcCls.name : assoc.sourceClassId;
        const tgtName = tgtCls ? tgtCls.name : assoc.targetClassId;

        let typeLabel = 'asociación común';
        let typeEn = 'plain association';
        if (assoc.aggregation === 'composite') {
          typeLabel = 'composición';
          typeEn = 'composition';
        } else if (assoc.aggregation === 'shared') {
          typeLabel = 'agregación';
          typeEn = 'aggregation';
        }

        const srcMult = assoc.sourceMultiplicity || '1';
        const tgtMult = assoc.targetMultiplicity || '1';
        const assocCls = assoc.associationClassId ? classMap.get(assoc.associationClassId) : null;
        const assocClsDesc = assocCls ? ` (clase de asociación: "${assocCls.name}")` : '';
        const assocClsDescEn = assocCls ? ` (association class: "${assocCls.name}")` : '';

        const rolesDesc = [
          assoc.sourceRole ? `rol origen: "${assoc.sourceRole}"` : null,
          assoc.targetRole ? `rol destino: "${assoc.targetRole}"` : null,
        ].filter(Boolean).join(', ');

        if (isEn) {
          return `${countPrefix}The relationship between "${srcName}" and "${tgtName}" is a ${typeEn} from "${srcName}" to "${tgtName}". Multiplicity: source "${srcName}" is ${srcMult}, target "${tgtName}" is ${tgtMult}.${rolesDesc ? ` Roles: ${rolesDesc}.` : ''}${assocClsDescEn}`;
        }
        return `${countPrefix}La relación entre "${srcName}" y "${tgtName}" es una ${typeLabel} desde "${srcName}" hacia "${tgtName}". Multiplicidad: origen "${srcName}" tiene ${srcMult}, destino "${tgtName}" tiene ${tgtMult}.${rolesDesc ? ` Roles: ${rolesDesc}.` : ''}${assocClsDesc}`;
      }

      if (gen) {
        const subId = gen.subClassId || gen.sourceClassId;
        const superId = gen.superClassId || gen.targetClassId;
        const child = classMap.get(subId)?.name || subId;
        const parent = classMap.get(superId)?.name || superId;
        return isEn
          ? `${countPrefix}Inheritance (generalization): "${child}" inherits from "${parent}".`
          : `${countPrefix}Herencia (generalización): "${child}" hereda de "${parent}".`;
      }

      if (real) {
        const clientId = real.clientClassId || real.sourceClassId;
        const ifaceId = real.supplierInterfaceId || real.targetClassId;
        const implementer = classMap.get(clientId)?.name || clientId;
        const iface = classMap.get(ifaceId)?.name || ifaceId;
        return isEn
          ? `${countPrefix}Realization: "${implementer}" implements interface "${iface}".`
          : `${countPrefix}Realización: "${implementer}" implementa la interfaz "${iface}".`;
      }

      if (dep) {
        const clientId = dep.clientClassId || dep.sourceClassId;
        const supplierId = dep.supplierClassId || dep.targetClassId;
        const src = classMap.get(clientId)?.name || clientId;
        const tgt = classMap.get(supplierId)?.name || supplierId;
        return isEn
          ? `${countPrefix}Dependency: "${src}" depends on "${tgt}".`
          : `${countPrefix}Dependencia: "${src}" depende de "${tgt}".`;
      }

      return isEn
        ? `${countPrefix}There is no direct relationship between "${c1.name}" and "${c2.name}" in the current diagram.`
        : `${countPrefix}No existe una relación directa entre "${c1.name}" y "${c2.name}" en el diagrama actual.`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Inspección de atributos o métodos de una clase específica
  // Ej: "Que atributos tiene la clase Reserva?",
  //     "Cuantos atributos tiene la clase Viaje?",
  //     "Lista textualmente los atributos de la clase Pasajero, con su tipo, sin interpretar nada."
  // ─────────────────────────────────────────────────────────────────────────────
  const isInspectionAsking =
    /(?:qu[eé]|cu[aá]les?|cu[aá]ntos?|lista(?:r)?|mostra(?:r)?|dame|decime|what|which|how\s+many|list|show|tell\s+me)/i.test(
      rawNorm
    );
  const isAttrOrMethodQuery =
    isInspectionAsking &&
    /(?:atributo|campo|propiedad|metodo|operaci[oó]n|attribute|field|property|method|operation)/i.test(
      rawNorm
    );

  if (isAttrOrMethodQuery) {
    // Extraer posible nombre de clase buscada
    // Patrones: "clase <Nombre>", "class <Name>", "de <Nombre>", "en <Nombre>"
    let targetClassName: string | null = null;

    const classMatch =
      userQuery.match(/(?:clase|class)\s+([A-Za-z0-9_]+)/i) ||
      userQuery.match(/(?:de|de\s+la|for|in)\s+([A-Za-z0-9_]+)\b/i);

    if (classMatch && classMatch[1]) {
      targetClassName = classMatch[1].trim();
    } else {
      // Intentar coincidir contra alguna de las clases conocidas del diagrama
      for (const c of classes) {
        if (new RegExp(`\\b${normalizeStr(c.name)}\\b`, 'i').test(rawNorm)) {
          targetClassName = c.name;
          break;
        }
      }
    }

    if (targetClassName) {
      const normTarget = normalizeStr(targetClassName);
      const targetCls = classes.find((c) => normalizeStr(c.name) === normTarget);

      // SI LA CLASE NO EXISTE EN EL DIAGRAMA -> Responder la verdad determinista (Prueba 2)
      if (!targetCls) {
        const availableNames =
          classes.length > 0
            ? classes.map((c) => `"${c.name}"`).join(', ')
            : isEn ? 'none' : 'ninguna';
        return isEn
          ? `The class "${targetClassName}" does not exist in the current diagram. Available classes on canvas: ${availableNames}.`
          : `La clase "${targetClassName}" no existe en el diagrama actual. Las clases presentes en el lienzo son: ${availableNames}.`;
      }

      const isAskingMethods = /(?:metodo|operaci[oó]n|method|operation)/i.test(rawNorm);
      const isAskingAttributes =
        !isAskingMethods ||
        /(?:atributo|campo|propiedad|attribute|field|property)/i.test(rawNorm);

      if (isAskingMethods && !isAskingAttributes) {
        const methods: any[] = Array.isArray(targetCls.methods) ? targetCls.methods : [];
        if (methods.length === 0) {
          return isEn
            ? `The class "${targetCls.name}" currently has no methods defined.`
            : `La clase "${targetCls.name}" actualmente no tiene métodos definidos.`;
        }
        const mList = methods
          .map((m, idx) => `${idx + 1}. +${m.name}(): ${m.returnType || 'void'}`)
          .join('\n');
        return isEn
          ? `The class "${targetCls.name}" has ${methods.length} methods:\n${mList}`
          : `La clase "${targetCls.name}" tiene ${methods.length} métodos:\n${mList}`;
      }

      // Consulta de atributos (Prueba 3 y Prueba 7)
      const attrs: any[] = Array.isArray(targetCls.attributes) ? targetCls.attributes : [];
      if (attrs.length === 0) {
        return isEn
          ? `The class "${targetCls.name}" currently has 0 attributes.`
          : `La clase "${targetCls.name}" actualmente tiene 0 atributos.`;
      }

      const attrList = attrs
        .map((a, idx) => `${idx + 1}. +${a.name}: ${a.type || 'string'}`)
        .join('\n');

      return isEn
        ? `The class "${targetCls.name}" has ${attrs.length} attributes:\n${attrList}`
        : `La clase "${targetCls.name}" tiene ${attrs.length} atributos:\n${attrList}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Ubicación o presencia de una clase en el diagrama
  // Ej: "Where does the Pasajero class appear in the diagram?",
  //     "¿Dónde está la clase Pasajero?"
  // ─────────────────────────────────────────────────────────────────────────────
  const isWhereQuery =
    /(?:d[oó]nde\s+(?:est[aá]|aparece|queda)|where\s+does\s+.*appear|where\s+is)/i.test(rawNorm);

  if (isWhereQuery && classes.length > 0) {
    for (const c of classes) {
      if (new RegExp(`\\b${normalizeStr(c.name)}\\b`, 'i').test(rawNorm)) {
        // Encontrar clases conectadas
        const connectedIds = new Set<string>();
        for (const a of associations) {
          if (a.sourceClassId === c.id) connectedIds.add(a.targetClassId);
          if (a.targetClassId === c.id) connectedIds.add(a.sourceClassId);
        }
        for (const g of generalizations) {
          if (g.sourceClassId === c.id) connectedIds.add(g.targetClassId);
          if (g.targetClassId === c.id) connectedIds.add(g.sourceClassId);
        }

        const connectedNames = Array.from(connectedIds)
          .map((id) => classMap.get(id)?.name)
          .filter(Boolean);

        const connStr =
          connectedNames.length > 0
            ? connectedNames.map((n) => `"${n}"`).join(', ')
            : isEn ? 'none' : 'ninguna';

        return isEn
          ? `The class "${c.name}" is present on the canvas. Connected classes: ${connStr}.`
          : `La clase "${c.name}" está presente en el lienzo. Clases conectadas: ${connStr}.`;
      }
    }
  }

  return null;
}
