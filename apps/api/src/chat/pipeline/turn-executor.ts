/**
 * Ejecutor del turno conversacional y de modelado de Amongus con LLM.
 * Maneja mutaciones explícitas inmediatas, llamadas streaming, rescates por timeout en CPU,
 * parseo de JSON canónico y control de errores de conectividad.
 */
import {
  robustParseDomainJson,
  expandSemanticDomainToDelta,
  synthesizeDomainModel,
  canonicalToSemantic,
} from '../../synthesis/index.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from '../../synthesis/domain-catalog/router.js';
import { resolveSystemPrompt } from '../../prompt-builder.js';
import {
  breakDegenerativeLoops,
  generateAmongusContextualReply,
  stripEmojis,
} from '../prompt-formatter.js';
import { DEFAULT_LLM_MAX_TOKENS, DEFAULT_LLM_TIMEOUT_MS } from '../chat-constants.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';
import { tryExplicitModelMutation } from './direct-mutation.js';
import { tryAtomicNlpSanitizer } from './atomic-nlp-sanitizer.js';

export interface TurnExecutorParams {
  userContent: string;
  cleanContent: string;
  senderName: string;
  language: 'es' | 'en';
  diagramId: string;
  isAction: boolean;
  llm?: any;
  diagram?: any;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk?: (chunk: string) => void;
  peerUsers?: readonly string[];
  diagramContext: string;
  ingressHint?: string;
}

export async function executeUnifiedTurn(params: TurnExecutorParams): Promise<UnifiedTurnResult> {
  const {
    userContent,
    cleanContent,
    senderName,
    language,
    diagramId,
    isAction,
    llm,
    diagram,
    chatHistory,
    onChunk,
    peerUsers,
    diagramContext,
    ingressHint,
  } = params;
  const isEn = language === 'en';

  // 00d. Si el usuario solicita una mutación puntual o creación determinista de clase/relación/atributo
  // resolverla de forma 100% determinista e inmediata ANTES de llamar al LLM.
  const directMutationResult = tryExplicitModelMutation(cleanContent, diagramId, diagram, isEn);
  if (directMutationResult) {
    return directMutationResult;
  }

  // 00e. Sanitizador NLP de intenciones atómicas para lenguaje coloquial o complejo
  const nlpSanitizerResult = await tryAtomicNlpSanitizer({
    cleanContent,
    diagram,
    diagramId,
    isAction,
    llm,
    diagramContext,
    isEn,
  });
  if (nlpSanitizerResult) {
    return nlpSanitizerResult;
  }

  if (!llm || typeof llm.chat !== 'function') {
    return {
      replyContent: generateAmongusContextualReply(userContent, senderName, language, peerUsers, diagram),
    };
  }

  const activePeers = peerUsers && peerUsers.length > 0
    ? Array.from(new Set(peerUsers))
    : [senderName];
  if (!activePeers.includes(senderName)) activePeers.push(senderName);
  const activePeersSummary = activePeers.join(', ');

  const systemPrompt = resolveSystemPrompt({
    senderName,
    language: isEn ? 'en' : 'es',
    diagramContext,
    activePeersSummary,
    isAction,
  });

  try {
    const isSpecificClassCreation = /\b(?:clase|calse|clse|class|tabla)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ]/i.test(cleanContent);
    const isDiagramExplanationQuery = /(?:explic|contexto|qu[eé]\s+(?:es|hace|significa|modela|representa)|de\s+qu[eé]\s+trata|describe|explain|what\s+does|meaning\s+of)/i.test(cleanContent) && /(?:diagrama|modelo|lienzo|canvas|actual)/i.test(cleanContent);
    const isFullDomainSynthesisRequest =
      !isSpecificClassCreation &&
      !isDiagramExplanationQuery &&
      /(?:model|dise[ñn]|cre[aá]|arm[aá]|gener[aá]|constru[yí]|design|model|build)\s+(?:un|una|el|la|a|an)?\s*(?:sistema|modelo|dominio|plataforma|system|management)\b/i.test(cleanContent);
    const domainMatch = isFullDomainSynthesisRequest ? matchCanonicalDomain(cleanContent) : null;
    const domainGrounding = domainMatch ? `\n\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';
    const chatInstructions = !isAction
      ? (isEn
          ? '\n\nSTRICT INSTRUCTION: NEVER output source code (Java, TypeScript, Python, etc.) or technical implementation steps. Respond ONLY with high-level conceptual UML explanations and domain analysis.'
          : '\n\nINSTRUCCIÓN ESTRICTA: NUNCA generes código fuente (Java, TypeScript, Python, etc.) ni pasos de implementación técnica (como actualización de DTO/MTD o backend). Respondé ÚNICAMENTE con explicaciones conceptuales de modelado UML y análisis del dominio.')
      : '';

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt + domainGrounding + (ingressHint ? `\n\nPISTA AUTORITATIVA DE DOMINIO:\n${ingressHint}` : '') + chatInstructions },
      ...(chatHistory ? chatHistory.slice(-4) : []),
      { role: 'user', content: cleanContent },
    ];

    let accumulatedChunks = '';
    const turnChunkCollector = (chunk: string) => {
      accumulatedChunks += chunk;
      if (!isAction) {
        onChunk?.(chunk);
      }
    };

    let raw: string;
    try {
      raw = await llm.chat(
        messages,
        {
          timeoutMs: DEFAULT_LLM_TIMEOUT_MS,
          maxTokens: isAction ? 650 : DEFAULT_LLM_MAX_TOKENS,
          onChunk: turnChunkCollector,
        }
      );
    } catch (llmErr: any) {
      if (isAction) {
        if (accumulatedChunks.trim().length > 0) {
          const rescuedModel = robustParseDomainJson(accumulatedChunks);
          if (rescuedModel && (rescuedModel.classes?.length || rescuedModel.associations?.length)) {
            if (rescuedModel.classes && rescuedModel.classes.length > 5) {
              const allowed = new Set(rescuedModel.classes.slice(0, 5).map((c: any) => c.name));
              rescuedModel.classes = rescuedModel.classes.slice(0, 5);
              if (rescuedModel.associations) {
                rescuedModel.associations = rescuedModel.associations.filter(
                  (a: any) => allowed.has(a.source) || allowed.has(a.target)
                );
              }
            }
            const rescuedDelta = expandSemanticDomainToDelta(rescuedModel, diagramId, diagram, cleanContent);
            if (rescuedDelta && rescuedDelta.deltas.length > 0) {
              const notice = isEn
                ? 'The model reached the response limit on CPU, but I rescued the entities generated so far. You can preview them on the canvas and confirm to apply.'
                : 'El modelo alcanzó el límite de tiempo en CPU, pero rescaté las entidades que llegó a generar. Podés previsualizarlas en el lienzo y confirmarlas para aplicarlas.';
              return {
                replyContent: notice,
                batchDelta: rescuedDelta,
              };
            }
          }
        }

        const activeDomainMatch = domainMatch || matchCanonicalDomain(cleanContent) || matchCanonicalDomain(userContent);
        if (activeDomainMatch) {
          const semanticCanonical = canonicalToSemantic(activeDomainMatch.domain);
          const fallbackDelta = expandSemanticDomainToDelta(semanticCanonical, diagramId, diagram, cleanContent);
          if (fallbackDelta && fallbackDelta.deltas.length > 0) {
            const notice = isEn
              ? 'The model reached the response time limit on CPU. To avoid waiting, here is the recommended architecture from our domain catalog:'
              : 'El modelo alcanzó el límite de tiempo en CPU. Para no hacerte esperar, te preparé la arquitectura recomendada de nuestro catálogo:';
            return {
              replyContent: notice,
              batchDelta: fallbackDelta,
            };
          }
        }

        try {
          const synthesized = await synthesizeDomainModel(cleanContent, diagramId, undefined, diagram, true);
          if (synthesized && synthesized.deltas.length > 0) {
            const notice = isEn
              ? 'The model reached the response limit on CPU. I generated the baseline domain architecture for your request:'
              : 'El modelo alcanzó el límite de tiempo en CPU. Te preparé una arquitectura base para tu solicitud:';
            return {
              replyContent: notice,
              batchDelta: synthesized,
            };
          }
        } catch {}
      }
      throw llmErr;
    }

    let clean = breakDegenerativeLoops(stripEmojis(raw).replace(/^Amongus:\s*/i, '').trim());

    const parsedModel = robustParseDomainJson(clean);
    if (parsedModel && parsedModel.classes && parsedModel.classes.length > 5) {
      const allowedNames = new Set(parsedModel.classes.slice(0, 5).map((c: any) => c.name));
      parsedModel.classes = parsedModel.classes.slice(0, 5);
      if (parsedModel.associations) {
        parsedModel.associations = parsedModel.associations.filter(
          (a: any) => allowedNames.has(a.source) || allowedNames.has(a.target)
        );
      }
    }
    const hasAnyContent =
      parsedModel &&
      ((parsedModel.classes && parsedModel.classes.length > 0) ||
        (parsedModel.associations && parsedModel.associations.length > 0) ||
        (parsedModel.generalizations && parsedModel.generalizations.length > 0) ||
        (parsedModel.realizations && parsedModel.realizations.length > 0) ||
        (parsedModel.dependencies && parsedModel.dependencies.length > 0) ||
        (parsedModel.naryAssociations && parsedModel.naryAssociations.length > 0) ||
        (parsedModel.renames && (
          (parsedModel.renames.classes && parsedModel.renames.classes.length > 0) ||
          (parsedModel.renames.attributes && parsedModel.renames.attributes.length > 0) ||
          (parsedModel.renames.methods && parsedModel.renames.methods.length > 0)
        )) ||
        (parsedModel.updates && (
          (parsedModel.updates.classes && parsedModel.updates.classes.length > 0) ||
          (parsedModel.updates.attributes && parsedModel.updates.attributes.length > 0) ||
          (parsedModel.updates.methods && parsedModel.updates.methods.length > 0) ||
          (parsedModel.updates.associations && parsedModel.updates.associations.length > 0) ||
          (parsedModel.updates.generalizations && parsedModel.updates.generalizations.length > 0) ||
          (parsedModel.updates.realizations && parsedModel.updates.realizations.length > 0) ||
          (parsedModel.updates.dependencies && parsedModel.updates.dependencies.length > 0) ||
          (parsedModel.updates.naryAssociations && parsedModel.updates.naryAssociations.length > 0) ||
          (parsedModel.updates.positions && parsedModel.updates.positions.length > 0)
        )) ||
        (parsedModel.deletions && (
          (parsedModel.deletions.classes && parsedModel.deletions.classes.length > 0) ||
          (parsedModel.deletions.attributes && parsedModel.deletions.attributes.length > 0) ||
          (parsedModel.deletions.methods && parsedModel.deletions.methods.length > 0) ||
          (parsedModel.deletions.associations && parsedModel.deletions.associations.length > 0) ||
          (parsedModel.deletions.generalizations && parsedModel.deletions.generalizations.length > 0) ||
          (parsedModel.deletions.realizations && parsedModel.deletions.realizations.length > 0) ||
          (parsedModel.deletions.dependencies && parsedModel.deletions.dependencies.length > 0) ||
          (parsedModel.deletions.naryAssociations && parsedModel.deletions.naryAssociations.length > 0)
        )));

    if (hasAnyContent) {
      const batchDelta = expandSemanticDomainToDelta(parsedModel, diagramId, diagram, cleanContent);
      if (batchDelta && batchDelta.deltas.length > 0) {
        const textWithoutJson = clean.replace(/```(?:json)?[\s\S]*?```/gi, '').trim();
        const mentionsCode = /c[oó]digo|code\b|aqu[ií]\s+tien|ac[aá]\s+ten|aqu[ií]\s+est[aá]|ac[aá]\s+est[aá]|a\s+continuaci[oó]n/i.test(textWithoutJson);
        const defaultReply = isEn
          ? 'I have prepared the proposal for this change. You can preview the ghost elements on the canvas and confirm to apply them.'
          : 'Preparé la propuesta para este cambio. Podés previsualizar los elementos en el lienzo y confirmarla para que se construyan en vivo.';
        return {
          replyContent: (textWithoutJson.length > 15 && !mentionsCode) ? textWithoutJson : defaultReply,
          batchDelta,
        };
      }
    }

    if (!hasAnyContent && isAction) {
      const explicitMutation = extractExplicitModelMutations(cleanContent, diagram);
      if (explicitMutation) {
        const mutationDelta = expandSemanticDomainToDelta(explicitMutation, diagramId, diagram, cleanContent);
        if (mutationDelta && mutationDelta.deltas.length > 0) {
          const defaultReply = isEn
            ? 'I have prepared the proposal for this change. You can preview the updated relationship on the canvas and confirm to apply it.'
            : 'Preparé la propuesta para este cambio. Podés previsualizar la relación en el lienzo y confirmarla para que se actualice en vivo.';
          return {
            replyContent: defaultReply,
            batchDelta: mutationDelta,
          };
        }
      }

      const isMutationIntent =
        /(?:cambi|modific|elimin|borr|sac[aá]|quit[aá]|renombr|pas[aá]|convert|turn|change|rename|delete|remove|hace\s+que|hac[eé]\s+que|ponele|agreg[aáeé]|a[ñn]ad[eé]|sum[aá]|insert)\b/i.test(
          cleanContent
        ) ||
        /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|multiplicidad)/i.test(
          cleanContent
        );

      const isExplicitModelingRequest =
        !isMutationIntent &&
        /(?:model|dise[ñn]|arm[aá]|gener[aá]|constru[yí]|sistema|dominio|aerolinea|hospital|banco|tienda|comercio|universidad|biblioteca|factur|cre[aá]\s+un\s+modelo)/i.test(
          cleanContent
        );
      if (isExplicitModelingRequest) {
        try {
          const recentHistory = (chatHistory || [])
            .slice(-4)
            .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
            .join('\n');
          const synthesisPrompt = [
            `Historial reciente de la conversación:\n${recentHistory}`,
            `Última explicación del asistente:\n${clean}`,
            `Instrucción del usuario:\n${userContent}`,
            'Generá el modelo de clases y asociaciones necesario para implementar lo solicitado o discutido en el chat.',
          ].join('\n\n');
          const synthesized = await synthesizeDomainModel(synthesisPrompt, diagramId, llm, diagram, true);
          if (synthesized && synthesized.deltas.length > 0) {
            const defaultReply = isEn
              ? 'I have prepared the proposal for this change. You can preview the elements on the canvas and confirm to apply them.'
              : 'Preparé la propuesta para este cambio. Podés ver los elementos en el lienzo y confirmarla para que se construya en vivo.';
            return {
              replyContent: defaultReply,
              batchDelta: synthesized,
            };
          }
        } catch {}
      }
    }

    if (!isAction) {
      clean = clean
        .replace(/```[a-zA-Z0-9_-]*[\s\S]*?```/gi, '')
        .replace(/(?:public|private|protected)?\s*class\s+\w+\s*\{[\s\S]*?\}/g, '')
        .replace(/###\s*(?:Implementaci[oó]n|C[oó]digo|Propuesta\s+para\s+cambiar|Actualizaci[oó]n\s+del\s+MTD|Conclusion)[\s\S]*$/i, '')
        .trim();
    }

    clean = breakDegenerativeLoops(clean.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim());

    if (/(?:prepar[eé]\s+la\s+propuesta|cre[eé]\s+la\s+propuesta|aqu[ií]\s+est[aá]\s+la\s+propuesta|prepared\s+the\s+proposal)/i.test(clean)) {
      clean = isEn
        ? 'I could not interpret the requested changes into a proposal. Please specify the class name and attributes (e.g., "create class Employee with name and salary").'
        : 'No pude interpretar los cambios para generar la propuesta. Por favor indicá el nombre de la clase y los atributos (ej. "creá la clase Empleado con nombre y sueldo").';
    }

    if (clean.length > 0) {
      return { replyContent: clean };
    }
  } catch (err: any) {
    console.error('Error in executeUnifiedTurn:', err);
    if (
      err &&
      (err.name === 'AbortError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('timeout') ||
        err.code === 'ETIMEDOUT')
    ) {
      const timeoutSec = Math.round(DEFAULT_LLM_TIMEOUT_MS / 1000);
      return {
        replyContent: isEn
          ? `The local model exceeded the response time limit (${timeoutSec}s). Please ask a more specific question, or use commands like /audit or /model.`
          : `El modelo local de lenguaje excedió el tiempo límite de respuesta (${timeoutSec}s). Probá con una consulta más puntual, o usá comandos directos como /audit o /model.`,
      };
    }

    const isConnectionError =
      err &&
      (err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('LLM unavailable') ||
        err.message?.includes('Failed to fetch') ||
        err.code === 'ECONNREFUSED');

    if (isConnectionError) {
      return {
        replyContent: isEn
          ? 'The AI model service is currently unavailable (connection failed or service stopped). Please verify that the local LLM server is running or try again later.'
          : 'El servidor del modelo de lenguaje no está disponible en este momento (falla de conexión o servicio caído). Por favor verificá que el motor local de IA esté corriendo o probá nuevamente en unos instantes.',
      };
    }

    if (isAction) {
      return {
        replyContent: isEn
          ? 'An error occurred while communicating with the AI model. Please try again or rephrase your request.'
          : 'Ocurrió un error al comunicarse con el modelo de lenguaje. Por favor probá nuevamente o reformulá tu pedido.',
      };
    }
  }

  return {
    replyContent: generateAmongusContextualReply(userContent, senderName, language, peerUsers, diagram),
  };
}
