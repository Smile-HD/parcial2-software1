import type { XmiModel } from './types.js';
import { toArray, normalizeVisibility } from './types.js';

export function disambiguateClassifierNames(model: XmiModel, chains: string[][]): void {
  const groups = new Map<string, number[]>();
  model.classes.forEach((c, i) => {
    const idxs = groups.get(c.name);
    if (idxs) idxs.push(i); else groups.set(c.name, [i]);
  });

  for (const [name, idxs] of groups) {
    if (idxs.length < 2) continue;
    const maxDepth = Math.max(0, ...idxs.map(i => (chains[i] ?? []).length));
    let resolved: string[] | undefined;
    for (let depth = 1; depth <= maxDepth + 1; depth++) {
      const qualified = idxs.map(i => {
        const chain = chains[i] ?? [];
        const suffix = chain.slice(Math.max(0, chain.length - depth));
        return suffix.length ? `${suffix.join('::')}::${name}` : name;
      });
      if (new Set(qualified).size === idxs.length) {
        resolved = qualified;
        break;
      }
    }
    if (!resolved) {
      // La cadena completa aún colisiona: conservar la calificación más profunda y agregar
      // sufijos numéricos para que el lote se aplique (la representación más cercana gana
      // frente al rechazo).
      const base = idxs.map(i => {
        const chain = chains[i] ?? [];
        return chain.length ? `${chain.join('::')}::${name}` : name;
      });
      resolved = base.map((n, k) => (k === 0 ? n : `${n} (${k + 1})`));
    }
    idxs.forEach((classIdx, k) => {
      model.classes[classIdx]!.name = resolved![k]!;
    });
  }
}

export function parseRealXmi21(xmiRoot: any, model: XmiModel): void {
  const classNodes: any[] = [];
  // Ascendencia de paquetes por nodo de clase (alineada por índice con classNodes), utilizada por
  // la política de desambiguación de colisiones a continuación.
  const classNodeChains: string[][] = [];
  const associationNodes: any[] = [];
  const realizationNodes: any[] = [];
  const dependencyNodes: any[] = [];

  // Función auxiliar para extraer elementos hijos de un contenedor admitiendo packagedElement,
  // ownedMember o etiquetas directas de clasificadores UML.
  const getContainerElements = (cont: any): any[] => {
    if (!cont) return [];
    const elements: any[] = [];
    elements.push(...toArray(cont['packagedElement']));
    elements.push(...toArray(cont['ownedMember']));
    elements.push(...toArray(cont['uml:Class']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Class' })));
    elements.push(...toArray(cont['uml:Interface']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Interface' })));
    elements.push(...toArray(cont['uml:Package']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Package' })));
    elements.push(...toArray(cont['uml:Association']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Association' })));
    elements.push(...toArray(cont['uml:Realization']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Realization' })));
    elements.push(...toArray(cont['uml:Dependency']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Dependency' })));
    elements.push(...toArray(cont['Class']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Class' })));
    elements.push(...toArray(cont['Interface']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Interface' })));
    elements.push(...toArray(cont['Package']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Package' })));
    elements.push(...toArray(cont['Association']).map((e: any) => ({ ...e, '@_xmi:type': 'uml:Association' })));
    return elements;
  };

  const walkPackaged = (container: any, chain: string[]) => {
    for (const el of getContainerElements(container)) {
      let type = el['@_xmi:type'] || el['@_xsi:type'] || el['@_type'] || '';
      if (type && !type.includes(':')) {
        type = `uml:${type}`;
      }
      if (type === 'uml:Package') {
        walkPackaged(el, [...chain, el['@_name'] || el['name'] || '']);
      } else if (type === 'uml:Class' || type === 'uml:Interface') {
        classNodes.push(el);
        classNodeChains.push(chain);
      } else if (type === 'uml:Association' || type === 'uml:AssociationClass') {
        associationNodes.push(el);
        if (type === 'uml:AssociationClass') {
          // Mapeo dual: el mismo nodo es también una caja de clase (ver comentario).
          classNodes.push(el);
          classNodeChains.push(chain);
        }
      } else if (type === 'uml:Realization') {
        realizationNodes.push(el);
      } else if (type === 'uml:Dependency') {
        dependencyNodes.push(el);
      }
      // uml:PrimitiveType (solo índice), uml:Abstraction y cualquier otro
      // xmi:type se omite como elemento (el contenido desconocido estilo
      // xmi:Extension es tolerado, nunca importado).
    }
  };

  // Recolectar todos los contenedores raíz posibles: <uml:Model>, <uml:Package>, <Model>, <Package>,
  // o el propio xmiRoot si contiene elementos empaquetados directamente.
  const rootContainers: any[] = [];
  const candidateKeys = ['uml:Model', 'uml:Package', 'Model', 'Package', 'packagedElement', 'ownedMember'];
  for (const key of candidateKeys) {
    const val = xmiRoot?.[key];
    if (val !== undefined) {
      if (key === 'packagedElement' || key === 'ownedMember') {
        rootContainers.push(xmiRoot);
      } else {
        rootContainers.push(...toArray(val));
      }
    }
  }
  if (rootContainers.length === 0 && xmiRoot) {
    rootContainers.push(xmiRoot);
  }
  for (const container of rootContainers) {
    walkPackaged(container, []);
  }

  // ---- Índice id→nombre (clases del modelo + primitivas ÚNICAMENTE de
  // xmi:Extension/primitivetypes) utilizado para resolver `<type xmi:idref>`.
  const nameIndex = new Map<string, string>();
  for (const c of classNodes) {
    const cid = c['@_xmi:id'] || c['@_id'];
    const cname = c['@_name'] || c['name'];
    if (cid && cname) nameIndex.set(cid, cname);
  }
  const indexPrimitiveTypes = (container: any) => {
    for (const el of getContainerElements(container)) {
      const eid = el['@_xmi:id'] || el['@_id'];
      const ename = el['@_name'] || el['name'];
      if (eid && ename) nameIndex.set(eid, ename);
      indexPrimitiveTypes(el); // paquetes de tipos primitivos anidados
    }
  };
  const extensionNodes = toArray(xmiRoot?.['xmi:Extension'] ?? xmiRoot?.['Extension']);
  for (const ext of extensionNodes) {
    indexPrimitiveTypes(ext?.['primitivetypes']);
  }

  const resolveType = (idref: string | undefined): string | undefined => {
    if (!idref) return undefined;
    const resolved = nameIndex.get(idref);
    if (resolved) return resolved;
    if (idref.startsWith('EAJava_')) return idref.slice('EAJava_'.length);
    return idref;
  };

  // Indexar conectores de Enterprise Architect desde <xmi:Extension> para nombres, roles y etiquetas
  interface EaConnector {
    name?: string;
    labels?: { mt?: string; lt?: string; rt?: string; lb?: string; rb?: string };
    sourceRole?: string;
    targetRole?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    associationclass?: string;
  }
  const eaConnectorMap = new Map<string, EaConnector>();
  const connectorNodes: any[] = [];
  for (const ext of extensionNodes) {
    connectorNodes.push(...toArray(ext?.['connectors']?.['connector']));
  }
  for (const conn of connectorNodes) {
    const connId = conn['@_xmi:idref'] || conn['@_idref'];
    if (!connId) continue;
    const props = conn['properties'];
    const labels = conn['labels'];
    const name = props?.['@_name'] || conn['@_name'] || labels?.['@_mt'] || undefined;
    const lt = labels?.['@_lt'] || conn['source']?.['role']?.['@_name'] || undefined;
    const rt = labels?.['@_rt'] || conn['target']?.['role']?.['@_name'] || undefined;
    const lb = labels?.['@_lb'] || conn['source']?.['type']?.['@_multiplicity'] || undefined;
    const rb = labels?.['@_rb'] || conn['target']?.['type']?.['@_multiplicity'] || undefined;
    const associationclass = conn['extendedProperties']?.['@_associationclass'] || undefined;
    eaConnectorMap.set(connId, {
      name,
      labels: { mt: labels?.['@_mt'], lt, rt, lb, rb },
      sourceRole: lt,
      targetRole: rt,
      sourceMultiplicity: lb,
      targetMultiplicity: rb,
      associationclass,
    });
  }

  // ---- Paso 2: construir clases (características + generalizaciones hijas) y un
  // índice global de propiedades (los `ownedEnd` propiedad de la asociación y los
  // `ownedAttribute` reflejados en la clase son las MISMAS Propiedades UML, direccionables por xmi:id).
  type EndProp = { id?: string; type: string | undefined; aggregation: string | undefined; lower: string | undefined; upper: string | undefined; name: string | undefined };
  const propertyIndex = new Map<string, EndProp>();
  const memberEndRefs = new Set<string>();
  const readProp = (el: any, propId?: string): EndProp => {
    const rawType = el?.['type']?.['@_xmi:idref'] ??
      el?.['type']?.['@_idref'] ??
      el?.['type']?.['@_href']?.replace(/^#/, '') ??
      el?.['@_type'] ??
      (typeof el?.['type'] === 'string' ? el['type'] : undefined);
    const id = propId || el?.['@_xmi:id'] || el?.['@_id'];
    return {
      id,
      type: rawType,
      aggregation: el?.['@_aggregation'] ?? el?.['aggregation'],
      lower: el?.['lowerValue']?.['@_value'] ?? el?.['lowerValue']?.['@_body'] ?? el?.['@_lower'],
      upper: el?.['upperValue']?.['@_value'] ?? el?.['upperValue']?.['@_body'] ?? el?.['@_upper'],
      name: el?.['@_name'] ?? el?.['name'],
    };
  };

  for (const assoc of associationNodes) {
    for (const end of toArray(assoc['ownedEnd'])) {
      const endId = end['@_xmi:id'] || end['@_id'];
      if (endId) propertyIndex.set(endId, readProp(end, endId));
    }
    for (const me of toArray(assoc['memberEnd'])) {
      const ref = me?.['@_xmi:idref'] || me?.['@_idref'] || me?.['@_href']?.replace(/^#/, '');
      if (ref) memberEndRefs.add(ref);
    }
  }

  for (const el of classNodes) {
    const id = el['@_xmi:id'] || el['@_id'] || randomUUID();
    const classAttrs: XmiModel['classes'][number]['attributes'] = [];
    const classMethods: XmiModel['classes'][number]['methods'] = [];

    for (const attr of toArray(el['ownedAttribute'] ?? el['UML:Attribute'] ?? el['attribute'])) {
      const attrId = attr['@_xmi:id'] || attr['@_id'];
      // Registrar CADA propiedad de extremo (extremos de asociación reflejados incluidos) en
      // el índice para que las asociaciones puedan resolverlos posteriormente.
      if (attrId) propertyIndex.set(attrId, readProp(attr));

      // Extremo de asociación vs atributo de característica: un ownedAttribute que declara
      // un propietario `association` (o cuyo id es referenciado por el memberEnd de alguna
      // Asociación) es un extremo de relación, NO una característica — nunca importarlo como
      // atributo (evita que Producto filtre un 4to atributo fantasma).
      const isRelationEnd = Boolean(attr['@_association']) || Boolean(attrId && memberEndRefs.has(attrId));
      if (isRelationEnd) continue;

      // multi-tenencia de multiplicidad: atributo 'multiplicity' directo o subelementos lowerValue/upperValue
      const rawMult = attr['@_multiplicity'] || attr['multiplicity'];
      let mult: string | undefined;
      if (rawMult) {
        mult = String(rawMult);
      } else {
        const lower = attr['lowerValue']?.['@_value'];
        const upper = attr['upperValue']?.['@_value'];
        if (lower !== undefined || upper !== undefined) {
          const l = lower ?? '1';
          const u = upper ?? '1';
          mult = (l === u && l !== '-1') ? l : `${l === '-1' ? '*' : l}..${u === '-1' ? '*' : u}`;
        }
      }

      const rawType = attr['@_type'] || attr['type']?.['@_xmi:idref'] || attr['type']?.['@_idref'] || attr['type']?.['@_href']?.replace(/^#/, '') || (typeof attr['type'] === 'string' ? attr['type'] : undefined);
      const rawName = String(attr['@_name'] || attr['name'] || 'unnamed');

      // Sanear en la ingesta: separar nombre de tipo incrustado (ej. "fechaSalida:date" -> "fechaSalida", "Date")
      let cleanName = rawName.trim();
      let effectiveType = resolveType(rawType) ?? rawType ?? 'String';

      if (cleanName.includes(':')) {
        const colonParts = cleanName.split(':').map((p) => p.trim()).filter(Boolean);
        if (colonParts.length > 0) {
          cleanName = colonParts[0]!;
          const embeddedType = colonParts[colonParts.length - 1];
          if (embeddedType && (effectiveType === 'String' || !effectiveType)) {
            const mapped = resolveType(embeddedType);
            effectiveType = mapped ?? embeddedType;
          }
        }
      }
      cleanName = cleanName.replace(/^[-+#~]\s*/, '').trim();
      if (!cleanName) cleanName = 'unnamed';

      // Si el nombre resultante es exclusivamente una palabra reservada de tipo y ya hay atributos en la clase, ignorar
      if (/^(string|int|float|boolean|date|type)$/i.test(cleanName) && classAttrs.length > 0) {
        continue;
      }

      classAttrs.push({
        id: attrId || randomUUID(),
        name: cleanName,
        type: effectiveType,
        visibility: attr['@_visibility'] || '+',
        isStatic: attr['@_isStatic'] === 'true',
        isDerived: attr['@_isDerived'] === 'true',
        ...(mult ? { multiplicity: mult } : {}),
      });
    }

    // ownedOperation (métodos de la clase)
    for (const op of toArray(el['ownedOperation'] ?? el['UML:Operation'] ?? el['operation'])) {
      const params = toArray(op['ownedParameter'] ?? op['UML:Parameter'] ?? op['parameter']);
      let namedReturnType: string | undefined;
      let firstReturnType: string | undefined;
      const parameters: Array<{ name: string; type: string }> = [];

      for (const p of params) {
        const resolved = resolveType(p['@_type'] || p['type']?.['@_xmi:idref'] || p['type']?.['@_idref'] || p['type']?.['@_href']?.replace(/^#/, '') || (typeof p['type'] === 'string' ? p['type'] : undefined));
        if (p['@_direction'] === 'return') {
          if (p['@_name'] === 'return') {
            if (namedReturnType === undefined && resolved) namedReturnType = resolved;
          } else if (firstReturnType === undefined && resolved) {
            firstReturnType = resolved;
          }
          continue;
        }
        if (p['@_name'] || p['name']) {
          parameters.push({ name: p['@_name'] || p['name'], type: resolved ?? 'String' });
        }
      }
      const returnType = namedReturnType ?? firstReturnType ?? 'void';
      classMethods.push({
        name: op['@_name'] || op['name'] || '',
        returnType,
        visibility: op['@_visibility'] || '+',
        isStatic: op['@_isStatic'] === 'true',
        parameters,
      });
    }

    const rawElType = el['@_xmi:type'] || el['@_xsi:type'] || el['@_type'] || '';
    const isInterface = rawElType === 'uml:Interface' || rawElType === 'Interface';
    model.classes.push({
      id,
      name: el['@_name'] || el['name'] || 'Unnamed',
      kind: isInterface ? 'interface' : 'class',
      isAbstract: el['@_isAbstract'] === 'true',
      attributes: classAttrs,
      methods: classMethods,
    });

    // La generalización es un HIJO de la subclase en XMI 2.1:
    // <generalization xmi:type="uml:Generalization" general="SUPER_ID"/>
    // dentro de la subclase. Por ende: subClassId = esta clase, superClassId = @general.
    for (const g of toArray(el['generalization'])) {
      const sup = g['@_general'];
      const genId = g['@_xmi:id'] || g['@_id'] || randomUUID();
      const eaConn = eaConnectorMap.get(genId);
      const name = g['@_name'] || g['name'] || eaConn?.name || eaConn?.labels?.mt || undefined;
      if (sup) {
        model.generalizations.push({ id: genId, subClassId: id, superClassId: sup, ...(name ? { name } : {}) });
      }
    }
  }

  // ---- Paso 3: asociaciones. Resolver cada idref de memberEnd a través del
  // índice de propiedades; derivar el par conectado y el tipo de agregación.
  const multiplicityOf = (e: EndProp): string | undefined => {
    if (e.lower === undefined && e.upper === undefined) return undefined;
    const l = e.lower ?? '1';
    const u = e.upper ?? '1';
    return (l === u && l !== '-1') ? l : `${l === '-1' ? '*' : l}..${u === '-1' ? '*' : u}`;
  };

  for (const assoc of associationNodes) {
    const id = assoc['@_xmi:id'] || assoc['@_id'] || randomUUID();
    const refs = toArray(assoc['memberEnd']).map((me: any) => me?.['@_xmi:idref'] || me?.['@_idref'] || me?.['@_href']?.replace(/^#/, '')).filter(Boolean);
    let ends = refs.map((r: string) => propertyIndex.get(r)).filter(Boolean) as EndProp[];
    if (ends.length < 2) {
      const directOwnedEnds = toArray(assoc['ownedEnd']).map((oe: any) => readProp(oe)).filter((e) => Boolean(e.type));
      if (directOwnedEnds.length >= 2) {
        ends = directOwnedEnds;
      }
    }
    const typedEnds = ends.filter(e => e.type);
    if (typedEnds.length < 2) continue; // asociación colgante sin memberEnd: omitir, nunca inventar

    const eaConn = eaConnectorMap.get(id);
    const assocName = assoc['@_name'] || assoc['name'] || eaConn?.name || eaConn?.labels?.mt || undefined;

    // ---- Enrutamiento N-ario: una asociación con 3+ extremos miembro tipificados distintos
    // es una auténtica asociación n-aria UML.
    if (typedEnds.length >= 3) {
      const seen = new Set<string>();
      const memberEnds: XmiModel['naryAssociations'][number]['memberEnds'] = [];
      for (const e of typedEnds) {
        const classId = e.type!;
        if (seen.has(classId)) continue;
        seen.add(classId);
        const multiplicity = multiplicityOf(e);
        memberEnds.push({
          classId,
          ...(multiplicity !== undefined ? { multiplicity } : {}),
          ...(e.name ? { role: e.name } : {}),
        });
      }
      if (memberEnds.length >= 3) {
        model.naryAssociations.push({
          id,
          memberEnds,
          ...(assocName ? { name: assocName } : {}),
        });
      }
      continue;
    }

    // El primer/último memberEnd en orden de documento anclan la dirección emitida para
    // asociaciones simples (no agregadas).
    const firstEnd = typedEnds[0];
    const lastEnd = typedEnds[typedEnds.length - 1];
    if (!firstEnd || !lastEnd || !firstEnd.type || !lastEnd.type) continue;

    let aggregation: 'none' | 'shared' | 'composite' = 'none';
    let diamondEnd: EndProp | undefined;
    for (const e of typedEnds) {
      if (e.aggregation === 'composite' || e.aggregation === 'shared') {
        aggregation = e.aggregation;
        diamondEnd = e;
        break;
      }
    }

    let source: string;
    let target: string;
    let sourceEnd = firstEnd;
    let targetEnd = lastEnd;
    const aggregationEnd: 'source' = 'source';
    if (diamondEnd && diamondEnd.type && typedEnds.length === 2) {
      const whole = diamondEnd.type;
      const part = typedEnds.find(e => e.type !== whole)?.type ?? whole; // autocomposición recurre a la misma clase
      source = whole;
      target = part;
      if (diamondEnd === lastEnd) {
        sourceEnd = lastEnd;
        targetEnd = firstEnd;
      }
    } else {
      const srcEnd = typedEnds.find(e => e.id?.endsWith('_src'));
      const dstEnd = typedEnds.find(e => e.id?.endsWith('_dst') || e.id?.endsWith('_tgt'));
      if (srcEnd && dstEnd && srcEnd.type && dstEnd.type) {
        source = srcEnd.type;
        target = dstEnd.type;
        sourceEnd = srcEnd;
        targetEnd = dstEnd;
      } else {
        source = firstEnd.type;
        target = lastEnd.type;
      }
    }

    const isSourceSrc = Boolean(sourceEnd.id?.endsWith('_src') || sourceEnd === firstEnd);
    const isTargetDst = Boolean(targetEnd.id?.endsWith('_dst') || targetEnd.id?.endsWith('_tgt') || targetEnd === lastEnd);
    const sourceMultiplicity = multiplicityOf(sourceEnd) ?? (isSourceSrc ? eaConn?.sourceMultiplicity : eaConn?.targetMultiplicity);
    const targetMultiplicity = multiplicityOf(targetEnd) ?? (isTargetDst ? eaConn?.targetMultiplicity : eaConn?.sourceMultiplicity);
    const sourceRole = sourceEnd.name ?? (isSourceSrc ? eaConn?.sourceRole : eaConn?.targetRole);
    const targetRole = targetEnd.name ?? (isTargetDst ? eaConn?.targetRole : eaConn?.sourceRole);

    const rawAssocType = assoc['@_xmi:type'] || assoc['@_xsi:type'] || assoc['@_type'] || '';
    const isAssocClass = rawAssocType === 'uml:AssociationClass' || rawAssocType === 'AssociationClass';
    const associationClassId = eaConn?.associationclass ?? (isAssocClass ? id : undefined);

    model.associations.push({
      id,
      source,
      target,
      aggregation,
      aggregationEnd,
      ...(assocName ? { name: assocName } : {}),
      ...(sourceRole ? { sourceRole } : {}),
      ...(targetRole ? { targetRole } : {}),
      ...(sourceMultiplicity !== undefined ? { sourceMultiplicity } : {}),
      ...(targetMultiplicity !== undefined ? { targetMultiplicity } : {}),
      ...(associationClassId ? { associationClassId } : {}),
    });
  }

  // ---- Realizaciones (uml:Realization como packagedElement de nivel superior):
  for (const r of realizationNodes) {
    const client = r['@_client'];
    const supplier = r['@_supplier'];
    const realId = r['@_xmi:id'] || r['@_id'] || randomUUID();
    const eaConn = eaConnectorMap.get(realId);
    const name = r['@_name'] || r['name'] || eaConn?.name || eaConn?.labels?.mt || undefined;
    if (client && supplier) {
      model.realizations.push({ id: realId, clientId: client, supplierId: supplier, ...(name ? { name } : {}) });
    }
  }

  // ---- Dependencias (uml:Dependency como packagedElement de nivel superior):
  for (const dep of dependencyNodes) {
    const client = dep['@_client'];
    const supplier = dep['@_supplier'];
    const depId = dep['@_xmi:id'] || dep['@_id'] || randomUUID();
    const eaConn = eaConnectorMap.get(depId);
    const name = dep['@_name'] || dep['name'] || eaConn?.name || eaConn?.labels?.mt || undefined;
    if (client && supplier) {
      model.dependencies.push({ id: depId, clientId: client, supplierId: supplier, ...(name ? { name } : {}) });
    }
  }

  // ---- Desambiguación de colisiones (fixture 6): model.classes y
  // classNodeChains están alineados por índice (ambos construidos iterando classNodes en orden de
  // documento), por lo que cada clasificador porta su propia ascendencia de paquetes. Solo los nombres
  // con colisiones reales se califican; todo lo demás permanece simple.
  disambiguateClassifierNames(model, classNodeChains);
}
