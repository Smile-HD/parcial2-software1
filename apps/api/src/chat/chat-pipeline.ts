/**
 * Orquestador del turno unificado de conversación con Amongus (processUnifiedAmongusTurn).
 * Coordina secuencialmente:
 * 1. Guardrails e interceptores de intención (intent-guardrails)
 * 2. Manejadores de slash commands (slash-handlers)
 * 3. Ejecución y síntesis de modelo con LLM (turn-executor)
 */
import type { BatchDelta } from '@app/core';
import { normalizeChatInput } from '../prompt-builder.js';
import { summarizeDiagramForPrompt } from './prompt-formatter.js';
import { checkIntentGuardrails } from './pipeline/intent-guardrails.js';
import { handleSlashCommands } from './pipeline/slash-handlers.js';
import { executeUnifiedTurn } from './pipeline/turn-executor.js';

export interface UnifiedTurnResult {
  replyContent: string;
  batchDelta?: BatchDelta | null;
}

export async function processUnifiedAmongusTurn(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es',
  diagramId: string,
  llm?: any,
  diagram?: any,
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk?: (chunk: string) => void,
  peerUsers?: readonly string[],
  ingressHint?: string
): Promise<UnifiedTurnResult> {
  const { cleanContent, normalized } = normalizeChatInput(userContent);

  // 1. Fase de Guardrails e interceptores tempranos (0 ms / 0 tokens)
  const guardrailOutcome = checkIntentGuardrails({
    userContent,
    cleanContent,
    normalized,
    senderName,
    language,
    diagram,
    peerUsers,
  });
  if (guardrailOutcome.handled) {
    return guardrailOutcome.result;
  }

  const diagramContext = summarizeDiagramForPrompt(diagram);

  // 2. Fase de Slash Commands (/help, /reset, /context, /model, /audit, /layout, /clear, /suggest, /apply)
  const slashOutcome = await handleSlashCommands({
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
    ingressHint,
  });
  if (slashOutcome.handled) {
    return slashOutcome.result;
  }

  // 3. Fase de Ejecución del Turno con LLM y Síntesis de Deltas
  return executeUnifiedTurn({
    userContent,
    cleanContent,
    senderName,
    language,
    diagramId,
    isAction: guardrailOutcome.isAction,
    llm,
    diagram,
    chatHistory,
    onChunk,
    peerUsers,
    diagramContext,
    ingressHint,
  });
}
