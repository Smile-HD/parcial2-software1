import {
  type SemanticDomainModel,
  type SemanticClass,
  type SemanticAssociation,
  type SemanticGeneralization,
  sanitizeAttributeNameAndType,
} from './delta-generator.js';

export function tryRepairTruncatedJson(raw: string): any {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return null;
  const jsonSub = raw.slice(startIdx);

  try {
    return JSON.parse(jsonSub);
  } catch {}

  for (let i = jsonSub.length; i > 10; i--) {
    const sub = jsonSub.slice(0, i);
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;
    for (let j = 0; j < sub.length; j++) {
      const char = sub[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braces++;
        else if (char === '}') braces--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
      }
    }
    if (inString) continue;
    if (braces >= 0 && brackets >= 0) {
      let candidate = sub;
      for (let b = 0; b < brackets; b++) candidate += ']';
      for (let b = 0; b < braces; b++) candidate += '}';
      try {
        return JSON.parse(candidate);
      } catch {}
    }
  }
  return null;
}

/**
 * Mapea un esquema canónico del catálogo a un SemanticDomainModel acotado a un máximo de 5 clases.
 */
export function canonicalToSemantic(canonical: any): SemanticDomainModel {
  const topClasses = (canonical.classes || []).slice(0, 5);
  const classNames = new Set(topClasses.map((c: any) => c.name));

  const classes: SemanticClass[] = topClasses.map((c: any) => ({
    name: c.name,
    isInterface: c.isInterface,
    isAbstract: c.isAbstract,
    attributes: (c.attributes || []).map((a: any) => ({ name: a.name, type: a.type })),
    methods: c.methods?.map((m: any) => ({ name: m.name, returnType: m.returnType })),
  }));

  const associations: SemanticAssociation[] = [];
  const generalizations: SemanticGeneralization[] = [];

  for (const r of canonical.relationships || []) {
    if (!classNames.has(r.source) || !classNames.has(r.target)) continue;
    if (r.type === 'generalization') {
      generalizations.push({ subclass: r.source, superclass: r.target });
    } else {
      associations.push({
        source: r.source,
        target: r.target,
        name: r.label,
        aggregation: r.type === 'composition' ? 'composite' : r.type === 'aggregation' ? 'shared' : 'none',
        sourceMultiplicity: r.sourceMultiplicity || '1',
        targetMultiplicity: r.targetMultiplicity || '0..*',
        associationClass: r.associationClass,
      });
    }
  }

  return {
    action: 'modify',
    classes,
    associations,
    generalizations,
  };
}

/**
 * Parsea el JSON devuelto por el modelo, tolerando markdown y truncamientos parciales.
 */
export function robustParseDomainJson(raw: string): SemanticDomainModel | null {
  const isDummyName = (str?: string) => !str || /^(NombreClase|ClassName|ClaseA|ClaseB|Origen|Destino|Hijo|Padre)$/i.test(str.trim());

  // 1. Detectar si existen múltiples bloques cercados ```json ... ``` y fusionarlos
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  const blocks: any[] = [];
  let bMatch: RegExpExecArray | null;
  while ((bMatch = codeBlockRegex.exec(raw)) !== null) {
    try {
      const p = JSON.parse(bMatch[1]);
      if (p && typeof p === 'object') blocks.push(p);
    } catch {
      const repaired = tryRepairTruncatedJson(bMatch[1]);
      if (repaired && typeof repaired === 'object') blocks.push(repaired);
    }
  }

  let parsed: any = null;
  if (blocks.length > 1) {
    const merged: any = { action: 'modify', classes: [], associations: [], updates: { classes: [], associations: [] } };
    for (const b of blocks) {
      if (Array.isArray(b.classes)) merged.classes.push(...b.classes);
      else if (b.class || b.name) merged.classes.push({ name: b.class || b.name, attributes: b.attributes, methods: b.methods });
      if (Array.isArray(b.associations)) merged.associations.push(...b.associations);
      if (b.updates) {
        if (Array.isArray(b.updates.classes)) merged.updates.classes.push(...b.updates.classes);
        if (Array.isArray(b.updates.associations)) merged.updates.associations.push(...b.updates.associations);
      }
    }
    parsed = merged;
  } else if (blocks.length === 1) {
    parsed = blocks[0];
  } else {
    // Intento de parseo JSON estándar o reparación de JSON truncado
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = tryRepairTruncatedJson(raw);
      }
    } else {
      parsed = tryRepairTruncatedJson(raw);
    }
  }

  if (parsed) {
    try {
      const parseAttrs = (rawAttrs: any): any[] => {
        if (!rawAttrs) return [];
        if (Array.isArray(rawAttrs)) {
          const list: any[] = [];
          for (const item of rawAttrs) {
            if (typeof item === 'string') {
              const cleaned = item.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
              const parts = cleaned.split(/,\s*(?=[a-zA-Z_])/);
              for (const p of parts) {
                const subParts = p.split(':');
                const sanitized = sanitizeAttributeNameAndType(subParts[0] || '', subParts[1] || 'string');
                if (sanitized.name) list.push(sanitized);
              }
            } else if (item && typeof item === 'object') {
              const sanitized = sanitizeAttributeNameAndType(item.name || '', item.type || 'string');
              if (sanitized.name) list.push({ ...item, name: sanitized.name, type: sanitized.type });
            }
          }
          return list;
        } else if (typeof rawAttrs === 'object') {
          return Object.entries(rawAttrs).map(([k, v]) => {
            const sanitized = sanitizeAttributeNameAndType(k, typeof v === 'string' ? v : 'string');
            return { name: sanitized.name, type: sanitized.type };
          });
        } else if (typeof rawAttrs === 'string') {
          const cleaned = rawAttrs.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
          return cleaned.split(/,\s*(?=[a-zA-Z_])/).map((s) => {
            const parts = s.split(':');
            return sanitizeAttributeNameAndType(parts[0] || '', parts[1] || 'string');
          }).filter((a) => a.name);
        }
        return [];
      };

      const classesData = Array.isArray(parsed.classes)
        ? parsed.classes
        : Array.isArray(parsed.clases)
          ? parsed.clases
          : parsed.classes ?? parsed.clases;

      let rawClasses: any[] = [];
      if (Array.isArray(classesData)) {
        rawClasses = classesData.map((cls: any) => ({
          ...cls,
          attributes: parseAttrs(cls.attributes ?? cls.atributos ?? cls.properties ?? cls.fields ?? cls.campos),
          methods: cls.methods ?? cls.metodos ?? cls.operaciones,
        }));
      } else if (classesData && typeof classesData === 'object') {
        rawClasses = Object.entries(classesData).map(([className, classData]: [string, any]) => ({
          name: classData?.name || className,
          isInterface: classData?.isInterface ?? false,
          isAbstract: classData?.isAbstract ?? false,
          attributes: parseAttrs(classData?.attributes ?? classData?.atributos ?? classData?.properties ?? classData?.fields ?? classData?.campos),
          methods: classData?.methods ?? classData?.metodos,
        }));
      }

      if (rawClasses.length === 0 && (parsed.class || parsed.className || (parsed.name && !parsed.classes))) {
        const singleName = parsed.class || parsed.className || parsed.name;
        if (typeof singleName === 'string' && !isDummyName(singleName)) {
          rawClasses.push({
            name: singleName,
            isInterface: parsed.isInterface ?? false,
            isAbstract: parsed.isAbstract ?? false,
            attributes: parseAttrs(parsed.attributes ?? parsed.atributos ?? parsed.properties ?? parsed.fields ?? parsed.campos),
            methods: parsed.methods ?? parsed.metodos ?? parsed.operaciones,
          });
        }
      }

      const rawAssocs = Array.isArray(parsed.associations)
        ? parsed.associations
        : Array.isArray(parsed.asociaciones)
          ? parsed.asociaciones
          : Array.isArray(parsed.relaciones)
            ? parsed.relaciones
            : Array.isArray(parsed.relationships)
              ? parsed.relationships
              : [];

      // Extraer asociaciones anidadas dentro de las definiciones de clase si el LLM las agrupó ahí
      const nestedAssocs: any[] = [];
      if (Array.isArray(classesData)) {
        for (const cls of classesData) {
          const clsAssocs = Array.isArray(cls.associations)
            ? cls.associations
            : Array.isArray(cls.asociaciones)
              ? cls.asociaciones
              : Array.isArray(cls.relaciones)
                ? cls.relaciones
                : [];
          for (const ca of clsAssocs) {
            if (ca && typeof ca === 'object') {
              const target = typeof ca.target === 'object' ? ca.target?.name : (ca.target ?? ca.destino);
              if (target) {
                nestedAssocs.push({
                  source: cls.name,
                  target,
                  name: ca.name || ca.nombre,
                  type: ca.type || ca.tipo,
                  aggregation: ca.aggregation || ca.agregacion,
                  sourceMultiplicity: ca.sourceMultiplicity || (typeof ca.type === 'string' && ca.type.includes('..') ? ca.type.split('..')[0] : undefined),
                  targetMultiplicity: ca.targetMultiplicity || (typeof ca.type === 'string' && ca.type.includes('..') ? ca.type.split('..')[1] : ca.type),
                  associationClass: ca.associationClass || ca.claseAsociacion || ca.tablaIntermedia,
                });
              }
            }
          }
        }
      }
      const rawGens = Array.isArray(parsed.generalizations)
        ? parsed.generalizations
        : Array.isArray(parsed.generalizaciones)
          ? parsed.generalizaciones
          : Array.isArray(parsed.herencias)
            ? parsed.herencias
            : [];
      const rawRealizations = Array.isArray(parsed.realizations)
        ? parsed.realizations
        : Array.isArray(parsed.realizaciones)
          ? parsed.realizaciones
          : [];
      const rawDependencies = Array.isArray(parsed.dependencies)
        ? parsed.dependencies
        : Array.isArray(parsed.dependencias)
          ? parsed.dependencias
          : [];
      const rawNary = Array.isArray(parsed.naryAssociations)
        ? parsed.naryAssociations
        : Array.isArray(parsed.asociacionesNarias)
          ? parsed.asociacionesNarias
          : [];

      const classes = rawClasses.filter((c: any) => c.name && !isDummyName(c.name));
      const allAssocs = [...rawAssocs, ...nestedAssocs];
      const associations = allAssocs
        .map((a: any) => {
          const rawAgg = String(a.aggregation || a.agregacion || a.tipo || a.type || '').toLowerCase();
          let aggregation: 'composite' | 'shared' | 'none' = 'none';
          if (rawAgg.includes('comp') || a.esComposicion || a.isComposite) {
            aggregation = 'composite';
          } else if (rawAgg.includes('agreg') || rawAgg.includes('shared') || a.esAgregacion || a.isShared) {
            aggregation = 'shared';
          }

          const rawAssocClass =
            a.associationClass ||
            a.claseAsociacion ||
            a.tablaIntermedia ||
            a.intermediateTable ||
            a.asociacionIntermedia;

          return {
            source: typeof a.source === 'object' ? a.source?.name : (a.source ?? a.origen),
            target: typeof a.target === 'object' ? a.target?.name : (a.target ?? a.destino),
            name: a.name || a.nombre,
            type: a.type,
            aggregation,
            aggregationEnd: a.aggregationEnd || a.extremoTodo || 'source',
            associationClass: typeof rawAssocClass === 'object' ? rawAssocClass?.name : rawAssocClass,
            directed: a.directed ?? false,
            sourceMultiplicity: a.sourceMultiplicity || a.multiplicidadOrigen,
            targetMultiplicity: a.targetMultiplicity || a.multiplicidadDestino,
            sourceRole: a.sourceRole || a.rolOrigen,
            targetRole: a.targetRole || a.rolDestino,
          };
        })
        .filter((a: any) => a.source && a.target && !isDummyName(a.source) && !isDummyName(a.target));

      const generalizations = rawGens
        .map((g: any) => ({
          subclass: typeof g.subclass === 'object' ? g.subclass?.name : (g.subclass ?? g.subclase ?? g.hijo ?? g.hija ?? g.child),
          superclass: typeof g.superclass === 'object' ? g.superclass?.name : (g.superclass ?? g.superclase ?? g.padre ?? g.madre ?? g.parent),
          name: g.name ?? g.nombre,
        }))
        .filter((g: any) => g.subclass && g.superclass && !isDummyName(g.subclass) && !isDummyName(g.superclass));

      const realizations = rawRealizations
        .map((r: any) => ({
          clientClass: typeof r.clientClass === 'object' ? r.clientClass?.name : (r.clientClass ?? r.client),
          supplierInterface: typeof r.supplierInterface === 'object' ? r.supplierInterface?.name : (r.supplierInterface ?? r.supplier),
          name: r.name,
        }))
        .filter((r: any) => r.clientClass && r.supplierInterface && !isDummyName(r.clientClass) && !isDummyName(r.supplierInterface));

      const dependencies = rawDependencies
        .map((d: any) => ({
          client: typeof d.client === 'object' ? d.client?.name : d.client,
          supplier: typeof d.supplier === 'object' ? d.supplier?.name : d.supplier,
          name: d.name,
        }))
        .filter((d: any) => d.client && d.supplier && !isDummyName(d.client) && !isDummyName(d.supplier));

      const naryAssociations = rawNary
        .map((n: any) => ({
          name: n.name,
          members: Array.isArray(n.members)
            ? n.members.map((m: any) => ({
                class: typeof m === 'string' ? m : (m.class ?? m.name),
                multiplicity: m.multiplicity,
                role: m.role,
              })).filter((m: any) => m.class && !isDummyName(m.class))
            : [],
        }))
        .filter((n: any) => n.members.length >= 3);

      const renames = parsed.renames ?? parsed.renombrar;
      const updates = parsed.updates ?? parsed.modificaciones;
      const deletions = parsed.deletions ?? parsed.eliminaciones ?? parsed.borrados;

      if (
        classes.length > 0 ||
        associations.length > 0 ||
        generalizations.length > 0 ||
        realizations.length > 0 ||
        dependencies.length > 0 ||
        naryAssociations.length > 0 ||
        renames ||
        updates ||
        deletions
      ) {
        return {
          action: parsed.action,
          classes,
          associations,
          generalizations,
          realizations,
          dependencies,
          naryAssociations,
          renames,
          updates,
          deletions,
        };
      }
    } catch {
      // Si el JSON quedó truncado al final, se recuperan las clases completas
    }
  }

  // 2. Extracción resiliente por expresiones regulares si el JSON fue truncado por límite de tokens
  const classes: Array<{ name: string; attributes: string[] }> = [];
  const classRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"attributes"\s*:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(raw)) !== null) {
    const name = m[1]!;
    if (isDummyName(name)) continue;
    const attrsRaw = m[2]!;
    const attrItems: string[] = [];
    const attrRegex = /"([^"]+)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRegex.exec(attrsRaw)) !== null) {
      attrItems.push(am[1]!);
    }
    classes.push({ name, attributes: attrItems });
  }

  const associations: Array<{ source: string; target: string }> = [];
  const assocRegex = /\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"/g;
  while ((m = assocRegex.exec(raw)) !== null) {
    if (isDummyName(m[1]!) || isDummyName(m[2]!)) continue;
    associations.push({ source: m[1]!, target: m[2]! });
  }

  if (classes.length > 0 || associations.length > 0) {
    if (classes.length >= 2 && associations.length === 0) {
      for (let i = 0; i < classes.length - 1; i++) {
        associations.push({ source: classes[i]!.name, target: classes[i + 1]!.name });
      }
    }
    const mappedClasses: SemanticClass[] = classes.slice(0, 6).map(c => ({
      name: c.name,
      attributes: c.attributes.map(a => ({ name: a, type: 'string' })),
    }));
    return { classes: mappedClasses, associations };
  }

  return null;
}

export * from './text-intent-parser.js';
import { extractExplicitModelMutations } from './text-intent-parser.js';

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
