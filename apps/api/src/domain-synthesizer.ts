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

    // Atributos de la clase (soporta formato compacto "nombre:tipo" y formato objeto {name, type})
    if (Array.isArray(cls.attributes)) {
      cls.attributes.forEach((attr: any) => {
        let name = '';
        let type = 'string';
        if (typeof attr === 'string') {
          const parts = attr.split(':');
          name = parts[0]?.trim() ?? '';
          type = parts[1]?.trim() ?? 'string';
        } else if (attr && typeof attr === 'object') {
          name = attr.name ?? '';
          type = attr.type ?? 'string';
        }
        name = name.replace(/\s+/g, '');
        if (!name) return;

        const rawType = type.toLowerCase().trim();
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
          name,
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
/**
 * Parsea el JSON devuelto por el modelo, tolerando markdown y truncamientos parciales.
 */
export function robustParseDomainJson(raw: string): SemanticDomainModel | null {
  // 1. Intento de parseo JSON estándar
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.classes && Array.isArray(parsed.classes) && parsed.classes.length >= 2) {
        return parsed as SemanticDomainModel;
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
    associations.push({ source: m[1]!, target: m[2]! });
  }

  if (classes.length >= 2) {
    // Si se cortó antes de las asociaciones, conectar las entidades secuencialmente
    if (associations.length === 0) {
      for (let i = 0; i < classes.length - 1; i++) {
        associations.push({ source: classes[i]!.name, target: classes[i + 1]!.name });
      }
    }
    return { classes: classes.slice(0, 4), associations };
  }

  return null;
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
    'Design a concise, realistic domain model tailored specifically to the user request (e.g. clothing store: Prenda, Categoria, Talla, Venta; cinema: Cine, Pelicula, Sala; workshop/taller: Vehiculo, Cliente, Reparacion, Mecanico).',
    'CRITICAL: If the user prompt is in Spanish, name all classes and attributes in Spanish. If in English, name them in English.',
    'Provide exactly 3 to 4 essential classes with 2 to 3 realistic attributes each.',
    'Include 2 essential relationships between them.',
    'Output ONLY a valid raw JSON object matching:',
    '{"classes":[{"name":"ClassName","attributes":["attrName:string|int|float"]}],"associations":[{"source":"ClassA","target":"ClassB"}]}',
  ].join('\n');

  try {
    const response = await (llm as any).chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { timeoutMs: 60000, temperature: 0.1, maxTokens: 800 }
    );

    if (typeof response !== 'string') {
      return null;
    }

    const parsed = robustParseDomainJson(response);
    if (!parsed) {
      return null;
    }

    const expanded = expandSemanticDomainToDelta(parsed, diagramId);
    if (expanded && expanded.deltas.length >= 2) {
      return expanded;
    }
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
  }

  return null;
}

