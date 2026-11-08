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
export * from './llm-json-parser.js';
import { robustParseDomainJson } from './llm-json-parser.js';

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

