/**
 * Sanitizador NLP de intenciones atómicas para lenguaje coloquial sobre diagramas UML existentes.
 */
import {
  robustParseDomainJson,
  expandSemanticDomainToDelta,
} from '../../synthesis/index.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export interface AtomicNlpSanitizerParams {
  cleanContent: string;
  diagram: any;
  diagramId: string;
  isAction: boolean;
  llm: any;
  diagramContext: string;
  isEn: boolean;
}

export async function tryAtomicNlpSanitizer(
  params: AtomicNlpSanitizerParams
): Promise<UnifiedTurnResult | null> {
  const { cleanContent, diagram, diagramId, isAction, llm, diagramContext, isEn } = params;

  if (!diagram || !diagram.classes || diagram.classes.length === 0 || !isAction || !llm || typeof llm.chat !== 'function') {
    return null;
  }

  const isMutationColloquial =
    /(?:cambi|modific|pon|sac|borr|elimin|renombr|pas|ajust|hered|generaliz|conect|relacion|multiplicidad|rol|campo|atributo|tipo|m[eé]todo|operaci|funci|method|function)/i.test(
      cleanContent
    );
  if (!isMutationColloquial) {
    return null;
  }

  try {
    const nlpMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: [
          'Sos un parser de lenguaje natural a operaciones UML sobre el diagrama actual.',
          `ESTADO ACTUAL DEL DIAGRAMA:\n${diagramContext}`,
          'INSTRUCCIÓN:',
          'Traducí la petición del usuario a la mutación atómica en formato JSON estructurado dentro de ```json ```.',
          'Formato esperado:',
          '```json',
          '{',
          '  "action": "modify",',
          '  "updates": {',
          '    "associations": [{ "source": "A", "target": "B", "sourceMultiplicity": "1", "targetMultiplicity": "1..*", "aggregation": "composite"|"shared"|"none", "sourceRole": "rol", "targetRole": "rol", "associationClass": "ClaseIntermedia" }],',
          '    "attributes": [{ "class": "Clase", "name": "attr", "type": "int"|"string"|"date"|"boolean"|"float", "newName": "nuevo" }],',
          '    "methods": [{ "class": "Clase", "name": "calcular", "returnType": "float", "parameters": [{ "name": "x", "type": "int" }] }],',
          '    "classes": [{ "name": "Clase", "isAbstract": true, "classKind": "class"|"interface" }]',
          '  },',
          '  "classes": [{ "name": "Clase", "attributes": [{ "name": "attr", "type": "string" }], "methods": [{ "name": "calcular", "returnType": "float", "parameters": [{ "name": "x", "type": "int" }] }] }],',
          '  "associations": [{ "source": "A", "target": "B", "sourceMultiplicity": "0..*", "targetMultiplicity": "0..*", "aggregation": "none", "associationClass": "ClaseIntermedia" }],',
          '  "generalizations": [{ "subclass": "Sub", "superclass": "Super" }],',
          '  "renames": { "classes": [{ "from": "Viejo", "to": "Nuevo" }], "methods": [{ "class": "C", "from": "viejo", "to": "nuevo" }] },',
          '  "deletions": { "classes": ["X"], "associations": [{"source": "A", "target": "B"}], "attributes": [{"class": "C", "attribute": "a"}], "methods": [{"class": "C", "method": "m"}] }',
          '}',
          '```',
          'REGLAS CRÍTICAS: NUNCA generes clases ni atributos nuevos que no existan en el diagrama a menos que el usuario lo pida explícitamente.',
        ].join('\n'),
      },
      { role: 'user', content: cleanContent },
    ];
    const rawJson = await llm.chat(nlpMessages, { timeoutMs: 12000, maxTokens: 400 });
    const parsedNlpModel = robustParseDomainJson(rawJson);
    if (
      parsedNlpModel &&
      (parsedNlpModel.updates ||
        parsedNlpModel.generalizations ||
        parsedNlpModel.renames ||
        parsedNlpModel.deletions ||
        parsedNlpModel.associations ||
        parsedNlpModel.classes)
    ) {
      const nlpDelta = expandSemanticDomainToDelta(parsedNlpModel, diagramId, diagram, cleanContent);
      if (nlpDelta && nlpDelta.deltas.length > 0) {
        const defaultReply = isEn
          ? 'I have prepared the proposal for this change. You can preview the updated elements on the canvas and confirm to apply.'
          : 'Preparé la propuesta para este cambio. Podés previsualizar la relación en el lienzo y confirmarla para que se actualice en vivo.';
        return {
          replyContent: defaultReply,
          batchDelta: nlpDelta,
        };
      }
    }
  } catch {}

  return null;
}
