import type { BatchDelta, LlmPort } from '@app/core';
import { stripAccents, findClosestClassName, normalizeUmlUtterance } from '@app/adapters-ai';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from './domain-catalog/router.js';

export * from './delta-generator.js';
import {
  expandSemanticDomainToDelta,
  cleanClassName,
  cleanMultiplicity,
  toCanonicalKey,
  sanitizeAttributeNameAndType,
  parseAttributesFromProse,
  isDomainModelRequest,
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
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
/**
 * Intenta reparar y balancear corchetes/llaves de un fragmento JSON truncado prematuramente
 * por límite de tokens o timeout para rescatar todas las clases completas generadas.
 */
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

  // 1. Intento de parseo JSON estándar o reparación de JSON truncado
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: any = null;
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = tryRepairTruncatedJson(raw);
    }
  } else {
    parsed = tryRepairTruncatedJson(raw);
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

      const rawAssocs = Array.isArray(parsed.associations)
        ? parsed.associations
        : Array.isArray(parsed.asociaciones)
          ? parsed.asociaciones
          : Array.isArray(parsed.relaciones)
            ? parsed.relaciones
            : Array.isArray(parsed.relationships)
              ? parsed.relationships
              : [];
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
      const associations = rawAssocs
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
export async function synthesizeDomainModel(
  text: string,
  diagramId: string,
  llm?: LlmPort,
  currentDiagram?: any,
  force = false
): Promise<BatchDelta | null> {
  if (!force && !isDomainModelRequest(text)) {
    return null;
  }

  // Si no hay LLM o no soporta chat, no falsificamos con plantillas estáticas
  if (!llm || typeof (llm as any).chat !== 'function') {
    return null;
  }

  const existingClassesList = currentDiagram?.classes?.map((c: any) => c.name).filter(Boolean) || [];
  const contextHint = existingClassesList.length > 0
    ? `\nThe current diagram already has these classes: ${existingClassesList.join(', ')}. Reuse these exact names if relating to them, and do not duplicate them unless creating distinct entities.`
    : '';

  const existingAssocsList = currentDiagram?.associations?.map((a: any) => {
    const src = currentDiagram.classes?.find((c: any) => c.id === a.sourceClassId)?.name;
    const tgt = currentDiagram.classes?.find((c: any) => c.id === a.targetClassId)?.name;
    return src && tgt ? `${src} <-> ${tgt}` : null;
  }).filter(Boolean) || [];

  const assocHint = existingAssocsList.length > 0
    ? `\nExisting relationships already in the canvas: ${existingAssocsList.join(', ')}. CRITICAL: DO NOT duplicate or create redundant relationships between classes that already have an association! Only link new entities to existing ones without repeating existing links.`
    : '';

  const isSpecificClassCreation = /\b(?:clase|calse|clse|class|tabla)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ]/i.test(text);
  const domainMatch = !isSpecificClassCreation ? matchCanonicalDomain(text) : null;
  const isEn = !/(?:es|spanish|español)/i.test(process.env.DEFAULT_LANGUAGE || '') &&
    !/(?:veterinaria|tienda|cl[ií]nica|hospital|hotel|banco|facultad|universidad|gimnasio|restaurante|aerol[ií]nea|sistema|pedido|comercio)/i.test(text);
  const groundingHint = domainMatch ? `\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

  const requestedClassMatches = Array.from(
    text.matchAll(/\b(?:clases?|calses?|clses?|class(?:es)?|tablas?)\s+(?:llamadas?\s+|llamados?\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*(?:\s*,\s*[A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)*)/gi)
  ).flatMap((m) => m[1].split(/[\s,]+/)).map(cleanClassName).filter(Boolean);
  const specificClassesHint = requestedClassMatches.length > 0
    ? `\nCRITICAL SPECIFIC CLASSES: The user explicitly requested to create these EXACT class name(s): ${requestedClassMatches.join(', ')}. You MUST name the classes EXACTLY with these requested names. DO NOT substitute them with other domain names (e.g. NEVER substitute Pedido with Factura).`
    : '';

  const systemPrompt = [
    'You are a senior UML software architect and domain-driven design expert.',
    'Design a concise, realistic, and cohesive domain model tailored specifically to the user request.',
    groundingHint,
    specificClassesHint,
    'CRITICAL LANGUAGE RULE: If the prompt or context is in Spanish, name all classes, attributes, and roles in Spanish. If in English, name them in English.',
    'CRITICAL ENTITIES RULE: If candidate classes or entities are requested or implied, you MUST include ALL of them in the "classes" array. For EVERY SINGLE CLASS, you MUST provide 2 to 4 realistic domain attributes with clean types (string, int, float, boolean, date). NEVER leave attributes empty.',
    'CRITICAL RELATIONSHIP TYPES RULES:',
    '1. DEFAULT TO PLAIN ASSOCIATION: Most relationships between classes are standard associations with "aggregation": "none" (e.g. Cliente -> Pedido, DetalleFactura -> Producto, Medico -> Paciente, Pasajero -> Vuelo).',
    '2. COMPOSITION (strong whole-part lifecycle dependency: if the whole is deleted, parts cease to exist): Set "aggregation": "composite" on the association (e.g. Factura -> DetalleFactura, Pedido -> ItemPedido, Venta -> LineaVenta). The container/whole is the "source".',
    '3. AGGREGATION (use SPARINGLY, ONLY when a container aggregates independent entities that survive without the container): Set "aggregation": "shared" (e.g. Biblioteca -> Libro, Departamento -> Empleado). Do NOT use aggregation for simple references.',
    '4. INHERITANCE / GENERALIZATION: For specialized subtypes ("is-a" relationship, e.g. Perro is an Animal, TarjetaCredito is a MetodoPago), declare in "generalizations": [{"subclass": "TarjetaCredito", "superclass": "MetodoPago"}]. Subclasses inherit attributes from superclass; do NOT repeat inherited attributes in the subclass. NEVER create an association between a subclass and its superclass.',
    '5. INTERMEDIATE ASSOCIATION CLASSES: Use an association class ONLY when an M:N relationship genuinely carries its own link attributes (e.g. DetalleVenta between Venta and Producto with cantidad/precio; Inscripcion between Estudiante and Curso with nota/fecha). In that case, specify "associationClass": "ClassName" on the association, and declare that class in "classes". For relationships without link attributes (1:1, 1:N, or attribute-less M:N), use direct associations without intermediate classes. NEVER concatenate class names (e.g. NEVER "VentaProducto").',
    '6. ZERO DUPLICATES: Between any two classes, create AT MOST ONE relationship. NEVER output multiple associations or association + aggregation or association + generalization between the same pair of classes.',
    '7. GRAPH CONNECTIVITY: Every class MUST be connected to at least one other class. No isolated or floating classes.',
    '8. STANDARD MULTIPLICITIES: Associations must use standard UML 2.5.1 multiplicities ONLY: "1", "0..1", "1..*", "0..*". NEVER output non-standard labels like "n", "m", or "n-to-1".',
    contextHint,
    assocHint,
    'CRITICAL EXTENSION RULE: When extending an existing diagram, do NOT re-declare existing classes in "classes". Include ONLY the new classes being created. In "associations", you CAN and SHOULD reference existing classes by name to connect them to the new classes.',
    'CRITICAL MULTIPLICITY RULE: "sourceMultiplicity" applies to "source", and "targetMultiplicity" applies to "target". E.g. If "1 Libro has many Reservas", then: if source="Libro" and target="Reserva", sourceMultiplicity="1", targetMultiplicity="1..*". If source="Reserva" and target="Libro", sourceMultiplicity="1..*", targetMultiplicity="1". Never invert cardinalities.',
    'CRITICAL ANTI-HALLUCINATION RULE: ONLY output the classes explicitly requested by the user. NEVER invent or include extra entities (such as Cliente, Factura, Usuario, etc.) that were not asked for by the user. If the user asks to create 1 class, output EXACTLY 1 class. If the user asks to create 2 classes, output EXACTLY 2 classes.',
    'CRITICAL REFACTORING & RENAMING RULE: If the user requests to rename, update, or delete classes, members, or relationships, use:',
    '  - Renames: "renames": {"classes": [{"from": "OldName", "to": "NewName"}]}. DO NOT put the renamed class into "classes" as a new class!',
    '  - Updates: "updates": {"classes": [{"name": "ClassName", "isAbstract": true}], "associations": [{"source": "A", "target": "B", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]}',
    '  - Deletions: "deletions": {"classes": ["DeletedClassName"], "associations": [{"source": "A", "target": "B"}]}',
    'Output ONLY a valid raw JSON object matching the requested domain:',
    '{',
    '  "classes": [',
    '    {"name": "DomainEntity", "attributes": ["id:int", "name:string"]}',
    '  ],',
    '  "associations": []',
    '}',
  ].filter(Boolean).join('\n');

  try {
    let responseText = '';
    const chunkCollector = (chunk: string) => {
      responseText += chunk;
    };

    let response: any;
    try {
      response = await (llm as any).chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        {
          timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000,
          temperature: 0.1,
          maxTokens: 650,
          onChunk: chunkCollector,
        }
      );
    } catch (llmErr) {
      if (responseText.trim().length > 0) {
        const rescued = robustParseDomainJson(responseText);
        if (rescued && rescued.classes?.length) {
          if (rescued.classes.length > 5) {
            rescued.classes = rescued.classes.slice(0, 5);
          }
          const expanded = expandSemanticDomainToDelta(rescued, diagramId, currentDiagram, text);
          if (expanded && expanded.deltas.length >= 1) {
            return expanded;
          }
        }
      }
      if (domainMatch) {
        const canonicalSemantic = canonicalToSemantic(domainMatch.domain);
        const fallback = expandSemanticDomainToDelta(canonicalSemantic, diagramId, currentDiagram, text);
        if (fallback && fallback.deltas.length >= 1) {
          return fallback;
        }
      }
      if (requestedClassMatches.length > 0) {
        const fallbackClasses: SemanticClass[] = requestedClassMatches.slice(0, 5).map((name) => ({
          name,
          attributes: [
            { name: 'id', type: 'string' },
            { name: 'nombre', type: 'string' },
            { name: 'estado', type: 'string' },
          ],
        }));
        const existingClassNames = (currentDiagram?.classes || []).map((c: any) => c.name);
        const anchorName = existingClassNames[0];
        const fallbackAssocs: SemanticAssociation[] = [];
        if (anchorName) {
          fallbackClasses.forEach((fc) => {
            if (fc.name !== anchorName) {
              fallbackAssocs.push({
                source: anchorName,
                target: fc.name,
                aggregation: 'none',
                sourceMultiplicity: '1',
                targetMultiplicity: '0..*',
              });
            }
          });
        }
        const fallbackModel: SemanticDomainModel = {
          action: 'modify',
          classes: fallbackClasses,
          associations: fallbackAssocs,
        };
        const expanded = expandSemanticDomainToDelta(fallbackModel, diagramId, currentDiagram, text);
        if (expanded && expanded.deltas.length >= 1) {
          return expanded;
        }
      }
      return null;
    }

    if (typeof response !== 'string') {
      return null;
    }

    const parsed = robustParseDomainJson(response);
    if (!parsed) {
      return null;
    }

    if (parsed.classes && parsed.classes.length > 5) {
      const allowedNames = new Set(parsed.classes.slice(0, 5).map((c: any) => c.name));
      parsed.classes = parsed.classes.slice(0, 5);
      if (parsed.associations) {
        parsed.associations = parsed.associations.filter(
          (a: any) => allowedNames.has(a.source) || allowedNames.has(a.target)
        );
      }
    }

    const expanded = expandSemanticDomainToDelta(parsed, diagramId, currentDiagram, text);
    if (expanded && expanded.deltas.length >= 1) {
      return expanded;
    }

    return null;
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
    return null;
  }
}

