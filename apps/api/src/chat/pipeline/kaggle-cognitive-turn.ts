/**
 * @app/api — Puerta de Enlace Cognitiva con Qwen 27B en Kaggle (Capa 0).
 *
 * Ejecuta prioritariamente la consulta contra el modelo 27B en Kaggle:
 * - Resuelve ambigüedades dialogando en lenguaje natural.
 * - Atiende comandos slash (/model, /suggest, /audit).
 * - Emite propuestas de modelado en JSON acopladas a BatchDelta inmutables.
 * - Retorna null ante cualquier falla o timeout para que el flujo degrade
 *   de forma transparente al pipeline legado (Groq Ingress o FakeLlm).
 */
import type { BatchDelta } from '@app/core';
import { robustParseDomainJson, expandSemanticDomainToDelta } from '../../synthesis/index.js';
import { buildKaggleArchitectPrompt } from '../../ai/prompt-builder.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from '../../synthesis/domain-catalog/router.js';
import { stripEmojis } from '../prompt-formatter.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export interface KaggleCognitiveTurnParams {
  userContent: string;
  senderName: string;
  language: 'es' | 'en';
  diagramId: string;
  diagram?: any;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  peerUsers?: readonly string[];
  diagramContext: string;
  onChunk?: (chunk: string) => void;
}

export async function executeKaggleCognitiveTurn(
  params: KaggleCognitiveTurnParams
): Promise<UnifiedTurnResult | null> {
  const baseUrl = (
    process.env.KAGGLE_BASE_URL ||
    process.env.KAGGLE_OPENAI_BASE_URL ||
    ''
  ).replace(/\/+$/, '');

  if (!baseUrl) {
    return null;
  }

  const {
    userContent,
    senderName,
    language,
    diagramId,
    diagram,
    chatHistory,
    peerUsers,
    diagramContext,
    onChunk,
  } = params;

  const isEn = language === 'en';
  const model = process.env.KAGGLE_MODEL || process.env.OPENAI_MODEL || 'qwen2.5-coder:14b';
  const timeoutMs = Number(process.env.KAGGLE_TIMEOUT_MS) || 35000;
  const apiKey = process.env.KAGGLE_API_KEY || 'kaggle';

  const activePeers = peerUsers && peerUsers.length > 0
    ? Array.from(new Set(peerUsers))
    : [senderName];
  if (!activePeers.includes(senderName)) activePeers.push(senderName);
  const activePeersSummary = activePeers.join(', ');

  const domainMatch = matchCanonicalDomain(userContent);
  const canonicalGrounding = domainMatch
    ? formatDomainGroundingPrompt(domainMatch.domain, isEn)
    : undefined;

  const systemPrompt = buildKaggleArchitectPrompt({
    senderName,
    language,
    diagramContext,
    activePeersSummary,
    canonicalGrounding,
  });

  const sanitizedHistory = (chatHistory ? chatHistory.slice(-4) : []).map((m) => {
    if (m.role === 'assistant') {
      const sanitized = m.content
        .replace(/```(?:json)?[\s\S]*?```/gi, '')
        .replace(/(?:###\s*)?(?:Aquí está el |He aquí el |A continuación el )?bloque JSON[^:\n]*:?/gi, '')
        .replace(/###\s*Acci[oó]n:?/gi, '')
        .replace(/###\s*Criterio [aA]rquitect[oó]nico:?/gi, '')
        .trim();
      return { role: m.role, content: sanitized };
    }
    return m;
  });

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...sanitizedHistory,
    { role: 'user', content: userContent },
  ];

  try {
    const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    let raw = '';

    if (onChunk) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.1,
          max_tokens: Number(process.env.KAGGLE_MAX_TOKENS) || 1800,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok || !response.body) {
        return null;
      }

      console.error(`[KaggleCognitiveGateway] Atendido por GPU: ${model} | Modo: Streaming`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let hasEnteredJson = false;

      let isDone = false;
      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') {
            isDone = true;
            break;
          }

          try {
            const parsedChunk = JSON.parse(jsonStr);
            const deltaContent = parsedChunk.choices?.[0]?.delta?.content;
            if (typeof deltaContent === 'string' && deltaContent) {
              raw += deltaContent;

              if (!hasEnteredJson) {
                // Al detectar el inicio del bloque de código JSON, dejamos de streamear a la burbuja del chat
                const cutMatch = raw.search(/(?:```|###\s*(?:Bloque\s*)?JSON|\n\s*\{)/i);
                if (cutMatch !== -1) {
                  hasEnteredJson = true;
                } else {
                  onChunk(deltaContent);
                }
              }
            }
          } catch {}
        }
      }
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: 0.1,
          max_tokens: Number(process.env.KAGGLE_MAX_TOKENS) || 1800,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as any;
      console.error(
        `[KaggleCognitiveGateway] Atendido por GPU: ${model} | Firma: ${data.system_fingerprint || 'fp_ollama'} | Tokens: ${data.usage?.total_tokens ?? 'N/A'}`
      );
      raw = data.choices?.[0]?.message?.content || '';
    }

    if (!raw || typeof raw !== 'string') {
      return null;
    }

    const clean = stripEmojis(raw).trim();
    const parsedModel = robustParseDomainJson(clean);

    const hasAnyContent =
      parsedModel &&
      ((parsedModel.classes && parsedModel.classes.length > 0) ||
        (parsedModel.associations && parsedModel.associations.length > 0) ||
        (parsedModel.generalizations && parsedModel.generalizations.length > 0) ||
        (parsedModel.realizations && parsedModel.realizations.length > 0) ||
        (parsedModel.dependencies && parsedModel.dependencies.length > 0) ||
        (parsedModel.renames && (
          (parsedModel.renames.classes && parsedModel.renames.classes.length > 0) ||
          (parsedModel.renames.attributes && parsedModel.renames.attributes.length > 0)
        )) ||
        (parsedModel.updates && (
          (parsedModel.updates.classes && parsedModel.updates.classes.length > 0) ||
          (parsedModel.updates.attributes && parsedModel.updates.attributes.length > 0) ||
          (parsedModel.updates.associations && parsedModel.updates.associations.length > 0)
        )) ||
        (parsedModel.deletions && (
          (parsedModel.deletions.classes && parsedModel.deletions.classes.length > 0) ||
          (parsedModel.deletions.associations && parsedModel.deletions.associations.length > 0)
        )));

    if (hasAnyContent) {
      const batchDelta = expandSemanticDomainToDelta(parsedModel, diagramId, diagram, userContent);
      if (batchDelta && batchDelta.deltas.length > 0) {
        let textWithoutJson = clean
          .replace(/```(?:json)?[\s\S]*?(?:```|$)/gi, '')
          .replace(/`+json[\s\S]*?(?:`+|$)/gi, '')
          .replace(/\{[\s\S]*?(?:\}(?:\s*```)?|$)/gi, '')
          .replace(/(?:###\s*)?(?:Aquí está el |He aquí el |A continuación el )?bloque JSON[^:\n]*:?/gi, '')
          .replace(/###\s*Acci[oó]n:?/gi, '')
          .replace(/###\s*Criterio [aA]rquitect[oó]nico:?/gi, '')
          .trim();
        const defaultReply = isEn
          ? 'I have prepared the proposal for this change. You can preview the ghost elements on the canvas and confirm to apply them.'
          : 'Preparé la propuesta para este cambio. Podés previsualizar los elementos en el lienzo y confirmarla para que se construyan en vivo.';

        return {
          replyContent: textWithoutJson.length > 10 ? textWithoutJson : defaultReply,
          batchDelta,
        };
      }
    }

    // Solución 2: Reintento Automático de Rescate en caliente
    // Si el modelo cortó el mensaje anunciando el JSON pero no lo emitió, o si el usuario pidió modelar:
    const appearsTruncatedOrMissingJson =
      /(?:aquí está|a continuación|diseño actualizado|json actualizado|siguiente modificación|bloque json|aquí tienes|modificación:?)\s*:?\s*$/i.test(clean) ||
      /(?:crea|agrega|cambia|modifica|renombra|borra|elimina|asocia|relaciona|compone|cuota|clase|atributo|uuid|tabla)/i.test(userContent);

    if (appearsTruncatedOrMissingJson) {
      try {
        const rescueMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          ...messages,
          { role: 'assistant', content: clean },
          {
            role: 'user',
            content: isEn
              ? 'Output ONLY the JSON object with the UML domain modifications for the canvas, adhering strictly to: { "action": "modify", "classes": [...], "associations": [...] } with NO conversational text.'
              : 'Generá ÚNICAMENTE el bloque JSON cercado con las modificaciones del modelo UML para el lienzo, respetando estrictamente la estructura: { "action": "modify", "classes": [...], "associations": [...] } sin ningún texto conversacional adicional.',
          },
        ];

        const rescueResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: rescueMessages,
            temperature: 0.1,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (rescueResponse.ok) {
          const rescueData = (await rescueResponse.json()) as any;
          console.error(`[KaggleCognitiveGateway] Rescate hot-turn completado. Tokens: ${rescueData.usage?.total_tokens ?? 'N/A'}`);
          const rescueRaw = rescueData.choices?.[0]?.message?.content;
          if (rescueRaw && typeof rescueRaw === 'string') {
            const rescueParsed = robustParseDomainJson(stripEmojis(rescueRaw).trim());
            if (rescueParsed) {
              const rescueDelta = expandSemanticDomainToDelta(rescueParsed, diagramId, diagram, userContent);
              if (rescueDelta && rescueDelta.deltas.length > 0) {
                let textWithoutJson = clean
                  .replace(/(?:###\s*)?(?:Aquí está el |He aquí el |A continuación el )?bloque JSON[^:\n]*:?/gi, '')
                  .replace(/(?:Aquí está|A continuación el|Aquí tienes el)\s+(?:diseño|JSON|modelo|código)[^:\n]*:?/gi, '')
                  .trim();
                return {
                  replyContent: textWithoutJson.length > 10 ? textWithoutJson : (isEn ? 'I have prepared the proposal for this change.' : 'Preparé la propuesta para este cambio.'),
                  batchDelta: rescueDelta,
                };
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[KaggleCognitiveGateway] Error en turno de rescate:', err?.message || err);
      }
    }

    // Respuesta conversacional, pedagógica o de resolución de ambigüedad
    return {
      replyContent: clean,
      batchDelta: null,
    };
  } catch {
    // Tolerancia a fallos: cualquier error de conexión o timeout cae al fallback legado
    return null;
  }
}

