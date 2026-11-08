/**
 * Manejadores de slash commands para Amongus (/help, /reset, /context, /model, /audit, /layout, /clear, /suggest, /apply).
 */
import type { BatchDelta, ClassDelta } from '@app/core';
import { findClosestSlashCommand } from '@app/adapters-ai';
import { auditDiagramOOAD } from '../../diagram-auditor.js';
import { synthesizeDomainModel } from '../../synthesis/index.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from '../../synthesis/domain-catalog/router.js';
import {
  pruneSuggestionsToMax3,
  stripEmojis,
} from '../prompt-formatter.js';
import { DEFAULT_LLM_TIMEOUT_MS } from '../chat-constants.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export interface SlashCommandParams {
  userContent: string;
  senderName: string;
  language: 'es' | 'en';
  diagramId: string;
  llm?: any;
  diagram?: any;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk?: (chunk: string) => void;
  diagramContext: string;
  normalized: string;
}

export type SlashCommandOutcome =
  | { handled: true; result: UnifiedTurnResult }
  | { handled: false };

export async function handleSlashCommands(params: SlashCommandParams): Promise<SlashCommandOutcome> {
  const {
    userContent,
    senderName,
    language,
    diagramId,
    llm,
    diagram,
    chatHistory,
    onChunk,
    diagramContext,
    normalized,
  } = params;
  const isEn = language === 'en';
  const trimmedLower = userContent.trim().toLowerCase();

  // /help
  if (trimmedLower === '/help' || trimmedLower.startsWith('/help ')) {
    const helpLines = isEn
      ? [
          'Amongus Command Guide:',
          '• /help [command] — Show interactive guide and command details',
          '• /reset — Clear chat memory to 0 tokens for maximum CPU speed',
          '• /context — View token count and CPU latency speed meter',
          '• /model <topic> — Directly generate domain model proposal (e.g. /model airline)',
          '• /audit — Audit current diagram with OOAD quality principles',
          '• /suggest — Suggest missing entities to complete your domain',
          '• /apply — Apply and build active proposal or latest suggestion',
          '• /clear — Safe proposal to clear the canvas (requires confirmation)',
          '• /export <spring|xmi|png> — Export project, XMI, or high-res image',
          '• /layout — Reorganize classes visually to avoid overlap',
        ].join('\n')
      : [
          'Guía de Comandos de Amongus:',
          '• /help [comando] — Muestra la guía interactiva y detalles de cada comando',
          '• /reset — Vacía la memoria del chat a 0 tokens para máxima velocidad en CPU',
          '• /context — Muestra el total de tokens cargados y el semáforo de velocidad',
          '• /model <tema> — Genera directamente la propuesta de dominio (ej. /model aerolineas)',
          '• /audit — Audita el diagrama con principios de calidad OOAD y buenas prácticas UML',
          '• /suggest — Sugiere entidades faltantes para enriquecer el modelo',
          '• /apply — Aplica y construye la propuesta activa o última sugerencia en el lienzo',
          '• /clear — Propuesta segura para vaciar el lienzo (con confirmación)',
          '• /export <spring|xmi|png> — Exporta a Spring Boot, XMI 2.1 o imagen PNG',
          '• /layout — Reorganiza visualmente las clases para evitar solapamientos',
        ].join('\n');
    return { handled: true, result: { replyContent: helpLines } };
  }

  // /reset
  if (trimmedLower === '/reset') {
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? 'Chat context reset. Conversational memory has been cleared to 0 tokens for maximum speed on CPU.'
          : 'Contexto del chat reiniciado. La memoria conversacional se vació a 0 tokens para máxima velocidad en CPU.',
      },
    };
  }

  // /context
  if (trimmedLower === '/context') {
    const classCount = diagram?.classes?.length || 0;
    const historyCount = chatHistory?.length || 0;
    const systemBaseTokens = isEn ? 210 : 220;
    const canvasTokens = Math.ceil(diagramContext.length / 4);
    const historyTokens = Math.ceil(
      (chatHistory || []).slice(-4).reduce((acc, m) => acc + (m.content?.length || 0), 0) / 4
    );
    const domainMatch = matchCanonicalDomain(diagramContext);
    const domainGroundingTokens = domainMatch
      ? Math.ceil(formatDomainGroundingPrompt(domainMatch.domain, isEn).length / 4)
      : 0;
    const totalInputTokens = systemBaseTokens + canvasTokens + historyTokens + domainGroundingTokens;

    let latency = isEn ? 'Optimal (~8-15s on CPU)' : 'Óptima (~8-15s en CPU)';
    let tip = isEn ? 'Context size is well-balanced.' : 'Tamaño de contexto balanceado.';
    if (totalInputTokens >= 2400) {
      latency = isEn ? 'Heavy (>40s on CPU)' : 'Pesada (>40s en CPU)';
      tip = isEn ? 'Use /reset to clear conversational memory.' : 'Usá /reset para limpiar la memoria conversacional.';
    } else if (totalInputTokens >= 1200) {
      latency = isEn ? 'Moderate (~20-30s on CPU)' : 'Moderada (~20-30s en CPU)';
      tip = isEn ? 'Acceptable speed.' : 'Velocidad aceptable.';
    }

    const classesSummary = classCount > 0
      ? `\n\n${isEn ? 'Domain Entities on Canvas' : 'Entidades del Dominio en el Lienzo'} (${classCount}): ${diagram.classes.map((c: any) => c.name).join(', ')}`
      : '';

    const reply = isEn
      ? `Real Context Status: ~${totalInputTokens} input tokens (System/Rules: ${systemBaseTokens}, Canvas: ${canvasTokens}, History: ${historyTokens}${domainGroundingTokens ? `, Domain RAG: ${domainGroundingTokens}` : ''}). Output budget: 650 tokens (max 5 classes). Estimated CPU Latency: ${latency}. Recommendation: ${tip}${classesSummary}`
      : `Estado del Contexto Real: ~${totalInputTokens} tokens de entrada (Sistema/Reglas: ${systemBaseTokens}, Lienzo: ${canvasTokens}, Historial: ${historyTokens}${domainGroundingTokens ? `, Catálogo RAG: ${domainGroundingTokens}` : ''}). Tope de salida: 650 tokens (máx. 5 clases). Latencia estimada en CPU: ${latency}. Recomendación: ${tip}${classesSummary}`;

    return { handled: true, result: { replyContent: reply } };
  }

  // /model
  if (trimmedLower.startsWith('/model ') || trimmedLower === '/model') {
    const domainTopic = userContent.trim().slice(6).trim();
    if (!domainTopic) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'Please specify a domain topic, e.g. /model airline or /model hospital'
            : 'Por favor indicá un tema de dominio, ej: /model aerolineas o /model hospital',
        },
      };
    }
    const synthesized = await synthesizeDomainModel(domainTopic, diagramId, llm, diagram, true);
    if (synthesized && synthesized.deltas.length > 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? `Prepared domain proposal for "${domainTopic}". You can preview it on the canvas and confirm to apply.`
            : `Preparé la propuesta de modelo para "${domainTopic}". Podés previsualizarla en el lienzo y confirmarla.`,
          batchDelta: synthesized,
        },
      };
    }
  }

  // /audit
  const isAuditIntent =
    trimmedLower === '/audit' ||
    /(?:est[aá]\s+bien\s+(?:armado|hecho|planteado|dise[ñn]ado)\s+(?:el\s+modelo|el\s+diagrama|el\s+sistema)|qu[eé]\s+le\s+falta\s+(?:al\s+modelo|al\s+diagrama)?|c[oó]mo\s+ves\s+el\s+(?:modelo|diagrama)|evalua\s+(?:el\s+modelo|el\s+diagrama)|audita\s+(?:el\s+modelo|el\s+diagrama)|is\s+the\s+model\s+(?:good|well\s+designed)|what\s+is\s+missing\s+in\s+the\s+(?:model|diagram))/i.test(
      normalized
    );

  if (isAuditIntent) {
    const report = auditDiagramOOAD(diagram, language);
    return {
      handled: true,
      result: {
        replyContent: report,
      },
    };
  }

  // /layout
  if (trimmedLower === '/layout' || trimmedLower === '/layout canvas') {
    const classCount = diagram?.classes?.length || 0;
    if (classCount === 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'The canvas is currently empty. Add classes before running /layout.'
            : 'El lienzo está vacío actualmente. Agregá clases antes de ejecutar /layout.',
        },
      };
    }
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `The /layout command is executed in the web interface to reposition the ${classCount} classes without overlaps. Click Auto-Layout in the canvas toolbar or run /layout in the web chat.`
          : `El comando /layout se ejecuta en la interfaz web para reposicionar las ${classCount} clases sin solapamientos. Hacé clic en Auto-Layout en la barra del lienzo o ejecutá /layout en el chat web.`,
      },
    };
  }

  // /clear
  if (trimmedLower === '/clear' || trimmedLower === '/limpiar' || trimmedLower === '/vaciar') {
    const classCount = diagram?.classes?.length || 0;
    if (classCount === 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'The canvas is currently empty. There are no classes to clear.'
            : 'El lienzo está vacío actualmente. No hay clases para eliminar.',
        },
      };
    }

    const deltas: ClassDelta[] = (diagram?.classes || []).map((c: any) => ({
      kind: 'class',
      op: 'delete',
      id: crypto.randomUUID(),
      diagramId,
      timestamp: new Date().toISOString(),
      classId: c.id,
    }));

    const batchDelta: BatchDelta = {
      kind: 'batch',
      id: crypto.randomUUID(),
      diagramId,
      timestamp: new Date().toISOString(),
      deltas,
    };

    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `I prepared a proposal to clear the canvas (deleting all ${classCount} classes and their relationships). You can review the preview on the canvas and click **Confirm** in the card below to apply.`
          : `Preparé una propuesta para vaciar el lienzo (eliminando las ${classCount} clases y sus relaciones). Podés revisar la previsualización en el lienzo y hacer clic en **Confirmar** para aplicarla.`,
        batchDelta,
      },
    };
  }

  // /suggest
  if (trimmedLower === '/suggest') {
    if (!diagram || !diagram.classes || diagram.classes.length === 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'The canvas is currently empty. You can start by typing /model <topic> (e.g. /model ecommerce) or asking me to create your first class.'
            : 'El lienzo está vacío actualmente. Podés arrancar usando /model <tema> (ej. /model ecommerce) o pidiéndome crear tu primera clase.',
        },
      };
    }

    const classCount = diagram.classes.length;
    const existingNames = diagram.classes.map((c: any) => c.name);
    const domainMatch = matchCanonicalDomain(diagramContext);
    const domainGrounding = domainMatch ? `\n\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

    const suggestPrompt = isEn
      ? [
          'You are Amongus, a senior software architecture tutor inside an interactive UML collaborative editor.',
          `CURRENT CANVAS CONTEXT (${classCount} classes):\n${diagramContext}`,
          domainGrounding,
          'SUGGESTION OBJECTIVE: Suggest at most 3 concise, high-value improvements to enrich the domain model according to OOAD best practices.',
          'CRITICAL ATOMIC NOUN RULES:',
          `- EXISTING CLASSES ALREADY ON CANVAS: ${existingNames.join(', ')}. NEVER repeat or suggest classes that already exist on the canvas. Suggest only missing complementary classes.`,
          '- ATOMIC DOMAIN ENTITIES: Every suggested class must be a single, standalone domain noun (e.g. Audit, Complaint, Branch, Shift). Concatenating existing class names into compound words is strictly prohibited.',
          '- STRICT LIMIT (MAXIMUM 3 SUGGESTIONS): Propose AT MOST 3 suggestions in total. NEVER output a 4th suggestion.',
          '- IF DOMAIN IS ALREADY COVERED: If core concepts are already modeled, propose 0 new classes and focus on attributes and business methods for existing classes.',
          '- NUMBERED FORMAT REQUIRED:',
          '  1. **ClassName**: Concise architectural purpose and key attributes.',
          '  2. **ClassName**: Concise architectural purpose and key attributes.',
          '  3. **ClassName**: Concise architectural purpose and key attributes.',
          'Be direct, pedagogical, and concise without code blocks or JSON.',
        ].filter(Boolean).join('\n')
      : [
          'Sos Amongus, tutor senior de arquitectura de software en un editor colaborativo UML.',
          `ESTADO ACTUAL DEL LIENZO (${classCount} clases):\n${diagramContext}`,
          domainGrounding,
          'OBJETIVO DE SUGERENCIA: Sugerí como máximo 3 mejoras concisas y de alto valor para enriquecer el modelo según los principios OOAD.',
          'REGLAS CRÍTICAS DE NOMBRES ATÓMICOS:',
          `- CLASES YA EXISTENTES EN EL LIENZO: ${existingNames.join(', ')}. NUNCA repitas ni vuelvas a sugerir ninguna clase que ya exista en el lienzo. Sugerí únicamente clases complementarias nuevas.`,
          '- ENTIDADES ATÓMICAS DE NEGOCIO: Toda clase propuesta debe ser un único sustantivo atómico del dominio (ej. Auditoria, Reclamo, Sucursal, Turno). Está terminantemente prohibido concatenar o fusionar nombres de clases ya existentes.',
          '- LÍMITE ESTRICTO (MÁXIMO 3 SUGERENCIAS): Proponé como MÁXIMO 3 sugerencias en total. NUNCA propongas una 4ta sugerencia.',
          '- SI EL DOMINIO YA ESTÁ CUBIERTO: Si los conceptos nucleares ya están modelados, proponé 0 clases nuevas y concentrate en sugerir atributos y métodos de negocio para las clases existentes.',
          '- FORMATO NUMERADO OBLIGATORIO:',
          '  1. **NombreClase**: Propósito arquitectónico conciso y atributos clave.',
          '  2. **NombreClase**: Propósito arquitectónico conciso y atributos clave.',
          '  3. **NombreClase**: Propósito arquitectónico conciso y atributos clave.',
          'Sé directo, pedagógico y conciso, sin bloques de código ni JSON.',
        ].filter(Boolean).join('\n');

    let suggestChunks = '';
    let streamHalted = false;

    const wrappedSuggestChunk = (chunk: string) => {
      suggestChunks += chunk;
      if (streamHalted) return;

      if (/(?:\n|^)\s*4\s*[\.\)-]/.test(suggestChunks)) {
        streamHalted = true;
        return;
      }

      onChunk?.(chunk);
    };

    try {
      const suggestResult = await llm.chat(
        [
          { role: 'system', content: suggestPrompt },
          { role: 'user', content: isEn ? 'Suggest next entities to complete the domain' : 'Sugerir próximas entidades para completar el dominio' },
        ],
        {
          timeoutMs: DEFAULT_LLM_TIMEOUT_MS,
          maxTokens: 400,
          onChunk: onChunk ? wrappedSuggestChunk : undefined,
          stop: ['\n4.', '\n4 ', '4. ', '4.-', '<|im_end|>'],
          repeatPenalty: 1.15,
          repeatLastN: 128,
        } as any
      );
      return { handled: true, result: { replyContent: pruneSuggestionsToMax3(stripEmojis(suggestResult), existingNames).trim() } };
    } catch {
      if (suggestChunks.trim().length > 30) {
        return { handled: true, result: { replyContent: pruneSuggestionsToMax3(stripEmojis(suggestChunks), existingNames).trim() } };
      }
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'I suggest reviewing transaction details or intermediate entities for your model.'
            : 'Te sugiero revisar si tu modelo necesita clases intermedias para transacciones (como detalles de comprobante o historiales).',
        },
      };
    }
  }

  // /apply
  const isApplyTrigger =
    trimmedLower === '/apply' ||
    trimmedLower.startsWith('/apply ') ||
    trimmedLower === '/aplicar' ||
    trimmedLower.startsWith('/aplicar ') ||
    trimmedLower.startsWith('implement') ||
    trimmedLower.startsWith('aplica') ||
    trimmedLower.startsWith('crea e implement') ||
    trimmedLower.startsWith('creá e implement') ||
    /^(?:por\s+favor\s+)?(?:implement[aá]r?|aplic[aá]r?|constru[yí]r?|arm[aá]r?)\b/i.test(trimmedLower) ||
    /^(?:por\s+favor\s+)?cre[aá]r?\s+(?:las?\s+sugerencias?|lo\s+sugerido|lo\s+que\s+(?:me\s+)?sugeriste|las?\s+clases?\s+sugeridas?)/i.test(trimmedLower);

  if (isApplyTrigger) {
    const cleanedTopic = userContent
      .trim()
      .replace(/^\/(?:apply|aplicar)\s*/i, '')
      .replace(/^(?:por\s+favor\s+)?(?:implement[aá]r?|aplic[aá]r?|cre[aá]r?|arm[aá]r?|constru[yí]r?)(?:\s+e\s+implement[aá]r?)?\s+/i, '')
      .replace(/^(?:en\s+el\s+lienzo\s+)?(?:las?\s+clases?\s+(?:y\s+relaciones?\s+)?(?:que\s+(?:me\s+)?acabas\s+de\s+sugerir|sugeridas?)|lo\s+sugerido|las?\s+sugerencias?|the\s+classes(?:\s+and\s+relationships)?(?:\s+you\s+just\s+suggested)?|the\s+suggestions?|what\s+you\s+(?:just\s+)?suggested)/i, '')
      .trim();

    const isReferencingSuggestion =
      !cleanedTopic ||
      /^(?:en\s+el\s+lienzo|lo\s+sugerido|las\s+clases|las\s+sugerencias|las\s+entidades|lo\s+que\s+sugeriste|lo\s+que\s+me\s+dijiste|sugerencias?|todo|all|the\s+classes|the\s+suggestions?)/i.test(cleanedTopic) ||
      /(sugerid|sugerist|sugerencia|acabas de sugerir|suggest)/i.test(userContent);

    const lastUserMsg = [...(chatHistory || [])].reverse().find((m) => m.role === 'user');
    const lastAssistantMsg = [...(chatHistory || [])].reverse().find((m) => m.role === 'assistant');
    const recentHistory = (chatHistory || [])
      .slice(-4)
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n');

    const isPreviousTurnSuggest =
      lastUserMsg?.content.trim().toLowerCase() === '/suggest' ||
      lastUserMsg?.content.trim().toLowerCase().startsWith('/suggest ');

    const hasNumberedSuggestions =
      !!lastAssistantMsg &&
      /(?:^\s*[1-9]\d*[\.\)-]\s*\*\*|^\s*\*\s*\*\*(?:Clase\s+)?[A-Za-z_ñÑáéíóúÁÉÍÓÚ])/m.test(lastAssistantMsg.content);

    const hasExplicitSuggestionContext =
      isPreviousTurnSuggest ||
      hasNumberedSuggestions ||
      (!!lastAssistantMsg &&
        /(?:suger|suggest|propongo|podr[ií]as agregar|entidades faltantes|Missing Entities)/i.test(lastAssistantMsg.content));

    if (isReferencingSuggestion && !hasExplicitSuggestionContext && !cleanedTopic) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'There is no pending proposal or active suggestion to apply. You can ask for changes in natural language or use /model <topic>.'
            : 'No hay ninguna propuesta pendiente ni sugerencia activa para aplicar. Podés pedirme cambios en lenguaje natural o usar /model <tema>.',
        },
      };
    }

    let topic: string;
    if (isReferencingSuggestion) {
      if (lastAssistantMsg) {
        const extractedClasses = Array.from(
          lastAssistantMsg.content.matchAll(/(?:^\s*[1-9]\d*[\.\)-]\s*\*\*|\*\*(?:Clase\s+)?)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\*\*/gm)
        ).map((m) => m[1]).filter(Boolean);

        if (extractedClasses.length > 0) {
          topic = `crear clases ${extractedClasses.join(', ')} para complementar el modelo:\n${lastAssistantMsg.content}`;
        } else {
          topic = `Implementar y modelar las siguientes clases y entidades sugeridas previamente por el asistente:\n${lastAssistantMsg.content}\n\nContexto reciente:\n${recentHistory}`;
        }
      } else {
        topic = 'entidades del dominio sugeridas';
      }
    } else {
      topic = lastAssistantMsg
        ? `Tema solicitado: ${cleanedTopic}\nContexto de conversación previa:\n${lastAssistantMsg.content}`
        : cleanedTopic;
    }

    const synthesized = await synthesizeDomainModel(topic, diagramId, llm, diagram, true);
    if (synthesized && synthesized.deltas.length > 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'I prepared the domain proposal on the canvas with all suggested entities and relationships. You can inspect the preview on the canvas and click **Confirm** in the card below or send `/apply` again to materialize it.'
            : 'Preparé la propuesta en el lienzo con las entidades y relaciones sugeridas. Podés revisar la previsualización en el lienzo y hacer clic en **Confirmar** en la tarjeta de abajo o enviar `/apply` nuevamente para materializarla.',
          batchDelta: synthesized,
        },
      };
    }
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? 'Could not generate an automatic proposal for this suggestion. You can specify: /model <topic>'
          : 'No se pudo generar una propuesta automática para esta sugerencia. Podés especificar: /model <tema>',
      },
    };
  }

  // Intercepción de slash commands desconocidos o con typo
  if (trimmedLower.startsWith('/')) {
    const rawCmd = trimmedLower.split(/\s+/)[0]!;
    const suggestion = findClosestSlashCommand(rawCmd);
    const didYouMean = suggestion
      ? (isEn ? ` Did you mean ${suggestion}?` : ` ¿Quisiste decir ${suggestion}?`)
      : '';
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `Unknown command "${rawCmd}".${didYouMean} Type /help to see available commands.`
          : `Comando "${rawCmd}" no reconocido.${didYouMean} Escribí /help para ver los comandos disponibles.`,
      },
    };
  }

  return { handled: false };
}
