import type { BatchDelta, LlmPort } from '@app/core';

export interface SemanticClass {
  name: string;
  attributes?: Array<{ name: string; type?: string }>;
  methods?: Array<{ name: string; returnType?: string }>;
}

export interface SemanticAssociation {
  source: string;
  target: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  associationClass?: string;
  name?: string;
}

export interface SemanticDomainModel {
  classes: SemanticClass[];
  associations?: SemanticAssociation[];
}

export function isDomainModelRequest(text: string): boolean {
  return /(crea|crear|dise[ñn]|model|arma|armar|base de datos|sistema de|diagrama de|quiero un|necesito un|hazme|haceme|make|build|generate|design|model)\b/i.test(text);
}

/**
 * Convierte un modelo de dominio semántico abstracto (generado dinámicamente por el LLM)
 * en un BatchDelta de metamodelo UML canónico y validado con coordenadas espaciales.
 */
export function expandSemanticDomainToDelta(
  model: SemanticDomainModel,
  diagramId: string
): BatchDelta | null {
  if (!model.classes || !Array.isArray(model.classes) || model.classes.length === 0) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const classIdMap = new Map<string, string>();
  const deltas: any[] = [];

  // 1. Crear clases en grilla 2D espaciada para evitar superposición
  const cols = 2;
  model.classes.forEach((cls, idx) => {
    const classId = crypto.randomUUID();
    const cleanName = cls.name.trim().replace(/\s+/g, '');
    classIdMap.set(cleanName.toLowerCase(), classId);
    classIdMap.set(cls.name.toLowerCase(), classId);

    const x = 80 + (idx % cols) * 440;
    const y = 80 + Math.floor(idx / cols) * 320;

    deltas.push({
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'class',
      op: 'create',
      classId,
      name: cleanName,
      position: { x, y },
    });

    // Atributos de la clase
    if (Array.isArray(cls.attributes)) {
      cls.attributes.forEach((attr) => {
        const rawType = (attr.type ?? 'string').toLowerCase().trim();
        const cleanType = ['int', 'float', 'string', 'boolean', 'date'].includes(rawType)
          ? rawType
          : 'string';

        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'member',
          op: 'addAttribute',
          classId,
          memberId: crypto.randomUUID(),
          name: attr.name.trim().replace(/\s+/g, ''),
          type: cleanType,
          visibility: '+',
        });
      });
    }

    // Métodos de la clase (si fueron provistos)
    if (Array.isArray(cls.methods)) {
      cls.methods.forEach((m) => {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'member',
          op: 'addMethod',
          classId,
          memberId: crypto.randomUUID(),
          name: m.name.trim().replace(/\s+/g, ''),
          returnType: m.returnType ?? 'void',
          parameters: [],
          visibility: '+',
        });
      });
    }
  });

  // 2. Crear asociaciones y composiciones
  if (Array.isArray(model.associations)) {
    model.associations.forEach((assoc) => {
      const sourceId = classIdMap.get(assoc.source.toLowerCase().trim());
      const targetId = classIdMap.get(assoc.target.toLowerCase().trim());

      if (!sourceId || !targetId) return;

      const assocClassId = assoc.associationClass
        ? classIdMap.get(assoc.associationClass.toLowerCase().trim())
        : undefined;

      const isComposite = assoc.aggregation === 'composite';

      const assocDelta: any = {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: sourceId,
        targetClassId: targetId,
        sourceMultiplicity: assoc.sourceMultiplicity ?? '1',
        targetMultiplicity: assoc.targetMultiplicity ?? '0..*',
        directed: false,
        aggregation: isComposite ? 'composite' : 'none',
        aggregationEnd: isComposite ? (assoc.aggregationEnd ?? 'source') : 'source',
      };

      if (assoc.name) {
        assocDelta.name = assoc.name;
      }
      if (assocClassId) {
        assocDelta.associationClassId = assocClassId;
      }

      deltas.push(assocDelta);
    });
  }

  return {
    id: crypto.randomUUID(),
    diagramId,
    timestamp,
    kind: 'batch',
    deltas,
  };
}

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
export async function synthesizeDomainModel(
  text: string,
  diagramId: string,
  llm?: LlmPort
): Promise<BatchDelta | null> {
  if (!isDomainModelRequest(text)) {
    return null;
  }

  // Si no hay LLM o no soporta chat, no falsificamos con plantillas estáticas
  if (!llm || typeof (llm as any).chat !== 'function') {
    return null;
  }

  const systemPrompt = [
    'You are a senior UML software architect.',
    'The user wants to model or design a domain / database / system in UML.',
    'CRITICAL INSTRUCTIONS:',
    '1. Design a clean, realistic domain model tailored specifically to what the user requested (e.g. if clothing store: Prenda, Categoria, Talla, Venta; if veterinary: Mascota, Cliente, Veterinario, Consulta; etc.).',
    '2. DO NOT use generic purchase or ecommerce names unless the user explicitly requested a generic store or ecommerce.',
    '3. If the user prompt is in Spanish, name all classes and attributes in Spanish. If in English, name them in English.',
    '4. Include 3 to 5 core classes with 3 to 4 realistic attributes each (types: int, float, string, boolean).',
    '5. Include meaningful relationships between the classes.',
    '6. Use COMPOSITION ("aggregation": "composite") for strong part-whole ownership.',
    '7. Use ASSOCIATION CLASSES ("associationClass": "ClassName") when an intermediary class holds relation data.',
    'Output ONLY a valid raw JSON object without markdown fences, matching this schema:',
    '{"classes":[{"name":"ClassName","attributes":[{"name":"attr","type":"string|int|float|boolean"}]}],"associations":[{"source":"ClassA","target":"ClassB","sourceMultiplicity":"1","targetMultiplicity":"0..*","aggregation":"none|composite","associationClass":"OptionalAssocClassName"}]}',
  ].join('\n');

  try {
    const response = await (llm as any).chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { timeoutMs: 60000, temperature: 0.2, maxTokens: 600 }
    );

    if (typeof response !== 'string') {
      return null;
    }

    // Extraer el objeto JSON más externo de manera resiliente
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as SemanticDomainModel;
    const expanded = expandSemanticDomainToDelta(parsed, diagramId);
    if (expanded && expanded.deltas.length >= 2) {
      return expanded;
    }
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
  }

  return null;
}
