/**
 * Manejadores de slash commands estáticos y utilitarios (/help, /reset, /context, /clear).
 */
import type { BatchDelta, ClassDelta } from '@app/core';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from '../../synthesis/domain-catalog/router.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export interface BasicSlashParams {
  trimmedLower: string;
  isEn: boolean;
  diagram: any;
  diagramContext: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  diagramId: string;
}

export function handleBasicSlashCommands(params: BasicSlashParams): { handled: true; result: UnifiedTurnResult } | { handled: false } {
  const { trimmedLower, isEn, diagram, diagramContext, chatHistory, diagramId } = params;

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

  // /clear
  if (trimmedLower === '/clear') {
    if (!diagram || !diagram.classes || diagram.classes.length === 0) {
      return {
        handled: true,
        result: {
          replyContent: isEn
            ? 'The canvas is already empty. There are no classes to delete.'
            : 'El lienzo ya está vacío. No hay clases para eliminar.',
        },
      };
    }

    const classCount = diagram.classes.length;
    const deltas: ClassDelta[] = diagram.classes.map((cls: any) => ({
      kind: 'class',
      op: 'delete',
      id: cls.id,
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

  return { handled: false };
}
