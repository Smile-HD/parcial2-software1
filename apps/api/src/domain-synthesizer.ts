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
 * Convierte un modelo de dominio semántico abstracto (generado por LLM)
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
 * Plantillas semánticas estáticas (fallback de alta velocidad y offline).
 */
export function synthesizeDomainTemplate(text: string, diagramId: string): BatchDelta | null {
  const lower = text.toLowerCase();

  // Ecommerce / Tienda / Ventas / Pedidos
  if (/(e-?comm?er\w*|\becom\b|tienda|comercio|ventas?|pedidos?|store|shop)/i.test(lower)) {
    const model: SemanticDomainModel = {
      classes: [
        {
          name: 'Cliente',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'email', type: 'string' },
          ],
        },
        {
          name: 'Pedido',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'fecha', type: 'string' },
            { name: 'total', type: 'float' },
            { name: 'estado', type: 'string' },
          ],
        },
        {
          name: 'Producto',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'precio', type: 'float' },
            { name: 'stock', type: 'int' },
          ],
        },
        {
          name: 'ItemPedido',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'cantidad', type: 'int' },
            { name: 'precioUnitario', type: 'float' },
          ],
        },
      ],
      associations: [
        {
          source: 'Cliente',
          target: 'Pedido',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          source: 'Pedido',
          target: 'ItemPedido',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
          aggregation: 'composite',
          aggregationEnd: 'source',
        },
        {
          source: 'ItemPedido',
          target: 'Producto',
          sourceMultiplicity: '*',
          targetMultiplicity: '1',
        },
        {
          source: 'Pedido',
          target: 'Producto',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
          associationClass: 'ItemPedido',
        },
      ],
    };
    return expandSemanticDomainToDelta(model, diagramId);
  }

  // Biblioteca / Libros
  if (/(biblioteca|libros?|prestamos?|library)/i.test(lower)) {
    const model: SemanticDomainModel = {
      classes: [
        {
          name: 'Libro',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'titulo', type: 'string' },
            { name: 'isbn', type: 'string' },
          ],
        },
        {
          name: 'Autor',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
          ],
        },
        {
          name: 'Usuario',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'email', type: 'string' },
          ],
        },
        {
          name: 'Prestamo',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'fechaInicio', type: 'string' },
            { name: 'fechaFin', type: 'string' },
          ],
        },
      ],
      associations: [
        {
          source: 'Autor',
          target: 'Libro',
          sourceMultiplicity: '1..*',
          targetMultiplicity: '1..*',
        },
        {
          source: 'Usuario',
          target: 'Prestamo',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          source: 'Prestamo',
          target: 'Libro',
          sourceMultiplicity: '*',
          targetMultiplicity: '1',
        },
      ],
    };
    return expandSemanticDomainToDelta(model, diagramId);
  }

  // Hospital / Clinica / Medico / Paciente
  if (/(hospital|cl[ií]nica|m[eé]dic|citas?|paciente|doctor)/i.test(lower)) {
    const model: SemanticDomainModel = {
      classes: [
        {
          name: 'Paciente',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'telefono', type: 'string' },
          ],
        },
        {
          name: 'Medico',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'especialidad', type: 'string' },
          ],
        },
        {
          name: 'CitaMedica',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'fechaHora', type: 'string' },
            { name: 'motivo', type: 'string' },
          ],
        },
        {
          name: 'HistorialClinico',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'diagnostico', type: 'string' },
          ],
        },
      ],
      associations: [
        {
          source: 'Paciente',
          target: 'CitaMedica',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          source: 'Medico',
          target: 'CitaMedica',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          source: 'Paciente',
          target: 'HistorialClinico',
          sourceMultiplicity: '1',
          targetMultiplicity: '1',
          aggregation: 'composite',
          aggregationEnd: 'source',
        },
      ],
    };
    return expandSemanticDomainToDelta(model, diagramId);
  }

  // Universidad / Escuela / Cursos
  if (/(escuela|colegio|universidad|cursos?|alumn|estudiante)/i.test(lower)) {
    const model: SemanticDomainModel = {
      classes: [
        {
          name: 'Estudiante',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
            { name: 'matricula', type: 'string' },
          ],
        },
        {
          name: 'Profesor',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'nombre', type: 'string' },
          ],
        },
        {
          name: 'Curso',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'titulo', type: 'string' },
          ],
        },
        {
          name: 'Inscripcion',
          attributes: [
            { name: 'id', type: 'int' },
            { name: 'fecha', type: 'string' },
          ],
        },
      ],
      associations: [
        {
          source: 'Profesor',
          target: 'Curso',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
        {
          source: 'Estudiante',
          target: 'Curso',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
          associationClass: 'Inscripcion',
        },
        {
          source: 'Estudiante',
          target: 'Inscripcion',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          source: 'Curso',
          target: 'Inscripcion',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
      ],
    };
    return expandSemanticDomainToDelta(model, diagramId);
  }

  return null;
}

/**
 * Síntesis dinámica con IA de modelos de dominio.
 * Consulta al LLM para obtener la estructura semántica arbitraria,
 * y se expande de forma estricta garantizando asociaciones, composiciones y clases de asociación.
 */
export async function synthesizeDomainModel(
  text: string,
  diagramId: string,
  llm?: LlmPort
): Promise<BatchDelta | null> {
  if (!isDomainModelRequest(text)) {
    return null;
  }

  // Intento de síntesis dinámica con el modelo de IA
  if (llm && typeof (llm as any).chat === 'function') {
    const systemPrompt = [
      'You are a senior UML software architect.',
      'The user wants to model or design a domain / system.',
      'Design a clean, cohesive domain model with 3 to 4 essential classes.',
      'CRITICAL REQUIREMENTS:',
      '1. You MUST include relationships between the classes.',
      '2. Use COMPOSITION ("aggregation": "composite") for strong ownership/part-whole (e.g. Order contains OrderItems, Invoice contains InvoiceLines).',
      '3. Use ASSOCIATION CLASSES ("associationClass": "ClassName") when an association table connects two classes with extra data (e.g. Enrollment between Student and Course, or OrderItem between Order and Product).',
      '4. Provide 3-4 realistic attributes per class with clean types: int, float, string, boolean.',
      'Output ONLY a valid, raw JSON object matching this schema, without markdown fences:',
      '{"classes":[{"name":"ClassName","attributes":[{"name":"attr","type":"string|int|float|boolean"}]}],"associations":[{"source":"ClassA","target":"ClassB","sourceMultiplicity":"1","targetMultiplicity":"0..*","aggregation":"none|composite","associationClass":"OptionalAssocClassName"}]}',
    ].join('\n');

    try {
      const response = await (llm as any).chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        { timeoutMs: 18000, temperature: 0.2 }
      );

      // Limpiar posibles bloques de markdown ```json ... ```
      const cleaned = response.replace(/^```(?:json)?/im, '').replace(/```$/m, '').trim();
      const parsed = JSON.parse(cleaned) as SemanticDomainModel;

      const expanded = expandSemanticDomainToDelta(parsed, diagramId);
      if (expanded && expanded.deltas.length >= 3) {
        return expanded;
      }
    } catch {
      // Fallback ante timeout o formato inválido del LLM
    }
  }

  // Fallback a las plantillas semánticas
  return synthesizeDomainTemplate(text, diagramId);
}
