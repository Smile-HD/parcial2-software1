/**
 * Rutas REST Fastify para Asistente AI, Interpretación NLP, Voz y Chat Colaborativo.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Diagram, LlmPort, SttPort } from '@app/core';
import { FakeLlm, normalizeUmlUtterance, canonicalizeUtteranceWithGroq, parseIngressResult } from '@app/adapters-ai';
import { LlmUnavailableError, PendingDeltaStore, interpretCommand } from '../interpreter.js';
import { evaluateChatGuard } from '../chat-guard.js';
import {
  ChatChannelTypeSchema,
  CreateChatMessageSchema,
  insertBotReply,
  insertChatMessage,
  listChatMessages,
  processUnifiedAmongusTurn,
} from '../chat.js';
import { loadDiagramFromRow } from './persistence.js';
import { registerVoiceRoute } from './ai-voice-routes.js';
import { executeKaggleCognitiveTurn } from '../chat/pipeline/kaggle-cognitive-turn.js';

export interface AiRoutesDeps {
  pool: Pool;
  llm: LlmPort;
  stt: SttPort;
  pendingDeltas: PendingDeltaStore;
}

export function registerAiRoutes(app: FastifyInstance, deps: AiRoutesDeps): void {
  const { pool, llm, stt, pendingDeltas } = deps;

  // POST /diagrams/:id/interpret — lenguaje natural → rechazo | delta pendiente
  app.post<{ Params: { id: string }; Body: { text?: string } }>(
    '/diagrams/:id/interpret',
    async (request, reply) => {
      const { id } = request.params;
      const text = request.body?.text;
      if (typeof text !== 'string' || text.trim().length === 0) {
        return reply.status(400).send({ error: 'text is required' });
      }

      const result = await pool.query(
        'SELECT id, name, doc, yjs_state, version, created_at, updated_at FROM diagrams WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Diagram not found' });
      }
      const row = result.rows[0];

      let currentIr: Diagram;
      try {
        currentIr = (
          await loadDiagramFromRow({
            id: row.id,
            name: row.name,
            doc: row.doc,
            yjs_state: row.yjs_state,
            version: row.version,
          })
        ).diagram;
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : 'Diagram load failed' });
      }

      try {
        const outcome = await interpretCommand(text, llm, currentIr, pendingDeltas);
        if (outcome.status === 'error') {
          return reply.status(422).send({ status: 'error', error: outcome.message });
        }
        return reply.send(outcome);
      } catch (error) {
        if (error instanceof LlmUnavailableError) {
          return reply.status(502).send({ error: `LLM unavailable: ${error.message}` });
        }
        throw error;
      }
    }
  );

  // POST /deltas/:id/confirm — entrega el delta pendiente al cliente que confirma
  app.post<{ Params: { id: string } }>('/deltas/:id/confirm', async (request, reply) => {
    const pending = pendingDeltas.take(request.params.id);
    if (!pending) {
      return reply.status(404).send({ error: 'Unknown or already used delta id' });
    }
    return { status: 'confirmed', delta: pending.delta, diagramId: pending.diagramId };
  });

  // POST /deltas/:id/reject — descarta el delta pendiente
  app.post<{ Params: { id: string } }>('/deltas/:id/reject', async (request, reply) => {
    const pending = pendingDeltas.take(request.params.id);
    if (!pending) {
      return reply.status(404).send({ error: 'Unknown or already used delta id' });
    }
    return { status: 'rejected' };
  });

  // POST /diagrams/:id/voice — voz → transcripción → flujo de interpretación
  registerVoiceRoute(app, pool, stt, llm, pendingDeltas);

  // GET /diagrams/:id/messages
  app.get<{
    Params: { id: string };
    Querystring: { channel?: string; deviceId?: string; userName?: string };
  }>('/diagrams/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const { channel, deviceId, userName } = request.query;

    const channelParsed = ChatChannelTypeSchema.safeParse(channel);
    if (!channelParsed.success) {
      return reply.status(400).send({ error: 'Valid channel (group | direct_bot) is required' });
    }

    const exists = await pool.query('SELECT id FROM diagrams WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      return reply.status(404).send({ error: 'Diagram not found' });
    }

    const messages = await listChatMessages(pool, id, channelParsed.data, deviceId, userName);
    return reply.status(200).send(messages);
  });

  // POST /diagrams/:id/messages
  app.post<{
    Params: { id: string };
    Body: unknown;
  }>('/diagrams/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const parsed = CreateChatMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid message payload', details: parsed.error.issues });
    }

    const exists = await pool.query(
      'SELECT id, name, doc, yjs_state, version FROM diagrams WHERE id = $1',
      [id]
    );
    if (exists.rows.length === 0) {
      return reply.status(404).send({ error: 'Diagram not found' });
    }

    const message = await insertChatMessage(pool, id, parsed.data);

    const isStream = Boolean(request.headers.accept?.includes('text/event-stream'));
    if (isStream) {
      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders?.();
      reply.raw.write(`event: user_message\ndata: ${JSON.stringify(message)}\n\n`);
    }

    const isSlashCommand = parsed.data.content.trim().startsWith('/');
    const normalizedUtterance = normalizeUmlUtterance(parsed.data.content);
    const hasModelingIntent =
      /(?:^|[\s,;.:¡!¿?])(?:crea|agrega|borra|elimina|cambia|conecta|desvincula|add|append|create|make|build|delete|remove|connect|link|attach|detach|unlink|rename|update|modify|set)(?:$|[\s,;.:¡!¿?])/iu.test(
        normalizedUtterance
      ) ||
      /(?:^|[\s,;.:¡!¿?])(?:cre[aáeéí]|agreg[aáeéí]|a[ñn]ad[eéíi]|insert[aáeéí]|sum[aáeéí]|pon[eé]|met[eé]|dise[ñn][aáeéí]|model[aáeéí]|constru[yí]|arm[aáeé]|borr[aáeéí]|elimin[aáeéí]|quit[aáeéí]|sac[aáeéí]|drop|renombr[aáeéí]|modific[aáeéí]|cambi[aáeéí]|conect[aáeéí]|vincul[aáeéí]|relacion[aáeéí]|asoci[aáeéí]|desvincul[aáeéí]|desasoci[aáeéí]|add|append|create|make|build|delete|remove|connect|link|attach|detach|unlink|rename|update|modify|set)(?:$|[\s,;.:¡!¿?])/iu.test(
        parsed.data.content
      );
    const hasUmlQuestionIntent =
      /\b(?:qu[eé]\s+(?:es|diferencia|significa)|c[oó]mo\s+(?:se|funciona)|explic[aá]|diferencia\s+entre|agregaci[oó]n|composici[oó]n|asociaci[oó]n|herencia|polimorfismo|cardinalidad|multiplicidad|patr[oó]n|uml|diagrama|cu[aá]nt[ao]s?\s+(?:personas|usuarios|conectados))\b/i.test(
        parsed.data.content
      );
    const shouldBotParticipate =
      parsed.data.channelType === 'direct_bot' ||
      parsed.data.content.includes('@Amongus') ||
      isSlashCommand ||
      hasModelingIntent ||
      hasUmlQuestionIntent;

    if (shouldBotParticipate) {
      const isEn = parsed.data.language === 'en';
      let deltaId: string | null = null;
      let delta: import('@app/core').Delta | null = null;
      let replyContent = '';

      let diagram: Diagram | undefined;
      if (parsed.data.currentDiagram && Array.isArray(parsed.data.currentDiagram.classes) && parsed.data.currentDiagram.classes.length > 0) {
        diagram = parsed.data.currentDiagram as Diagram;
      } else {
        try {
          const loaded = await loadDiagramFromRow(exists.rows[0]);
          diagram = loaded.diagram;
        } catch {}
      }

      let diagramSummary: string | undefined;
      if (diagram && diagram.classes && diagram.classes.length > 0) {
        diagramSummary = `Clases: ${diagram.classes.map((c: any) => `${c.name} (atributos: ${(c.attributes || []).map((a: any) => a.name).join(', ') || 'ninguno'})`).join('; ')}`;
      }

      if (parsed.data.content.trim().toLowerCase() === '/reset') {
        try {
          await pool.query(
            `DELETE FROM chat_messages 
             WHERE diagram_id = $1 
               AND channel_type = 'direct_bot'
               AND (device_id = $2 OR target_user = $3 OR sender_name = $3)
               AND id != $4`,
            [id, parsed.data.deviceId, parsed.data.senderName, message.id]
          );
        } catch {}
      }

      // Contexto de historial limpio: Si el lienzo está vacío (se reinició o nuevo), descartamos historial previo
      let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
      if (diagram && Array.isArray(diagram.classes) && diagram.classes.length > 0) {
        try {
          const recentMessages = await listChatMessages(
            pool,
            id,
            parsed.data.channelType,
            parsed.data.deviceId,
            parsed.data.senderName
          );
          chatHistory = recentMessages
            .filter((m) => {
              if (m.id === message.id) return false;
              if (parsed.data.channelType === 'group') {
                return m.senderType === 'bot' || m.content.includes('@Amongus') || m.content.trim().startsWith('/');
              }
              return true;
            })
            .slice(-6)
            .map((m) => {
              let content = m.content;
              if (m.senderType === 'bot') {
                content = content.replace(/```[a-zA-Z0-9_-]*[\s\S]*?```/gi, '').replace(/\s+/g, ' ').trim();
                if (content.length > 1500) {
                  content = content.slice(0, 1500) + '...';
                }
              }
              return {
                role: (m.senderType === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
                content,
              };
            });
        } catch {}
      } else {
        chatHistory = [];
      }

      // Ingress Gateway & Short-Circuit de Slash Commands
      const groqApiKey = process.env.GROQ_API_KEY || process.env.STT_API_KEY;
      let ingressHandled = false;
      let ingressHint: string | undefined;
      const isSuggestSlash = parsed.data.content.trim().toLowerCase() === '/suggest';
      let isSuggestIntent = isSuggestSlash;

      // 0. Capa 0: Puerta de Enlace Cognitiva con Qwen 27B en Kaggle (Prioritaria)
      // En entorno de tests unitarios automáticos, no se realizan llamadas HTTP reales a menos que se fuerce KAGGLE_ENABLE_IN_TEST
      const isTestEnv = process.env.NODE_ENV === 'test' && process.env.KAGGLE_ENABLE_IN_TEST !== 'true';
      if (!isTestEnv && (process.env.KAGGLE_BASE_URL || process.env.KAGGLE_OPENAI_BASE_URL)) {
        try {
          const kaggleResult = await executeKaggleCognitiveTurn({
            userContent: parsed.data.content,
            senderName: parsed.data.senderName,
            language: (parsed.data.language ?? 'es') as 'es' | 'en',
            diagramId: id,
            diagram,
            chatHistory,
            peerUsers: parsed.data.peerUsers,
            diagramContext: diagramSummary ?? '',
          });

          if (kaggleResult) {
            replyContent = kaggleResult.replyContent;
            if (kaggleResult.batchDelta) {
              const pending = pendingDeltas.put(id, kaggleResult.batchDelta);
              deltaId = pending.id;
              delta = pending.delta;
            }
            ingressHandled = true;
          }
        } catch {
          // Degradación elegante automática al pipeline legado (Groq / FakeLlm)
        }
      }

      // 1. Ingress con Groq (Online / Con API key) para clasificar y normalizar
      if (!isTestEnv && !ingressHandled && (!isSlashCommand || isSuggestSlash) && groqApiKey && groqApiKey.startsWith('gsk_')) {
        try {
          const canonicalText = await canonicalizeUtteranceWithGroq(parsed.data.content, {
            apiKey: groqApiKey,
            diagramSummary,
            recentHistory: chatHistory,
          });
          if (canonicalText) {
            const ingress = parseIngressResult(canonicalText);
            if (ingress.kind === 'blocked') {
              replyContent = ingress.reason;
              ingressHandled = true;
            } else if (ingress.kind === 'suggest') {
              ingressHint = ingress.hint;
              isSuggestIntent = true;
              ingressHandled = true;
            } else if (ingress.kind === 'chat') {
              ingressHint = ingress.hint;
              // Si el usuario pregunta de qué trata el diagrama y Groq dedujo el HINT, respondemos de inmediato
              const isCanvasQuery =
                /(?:explic|contexto|qu[eé]\s+(?:es|hace|significa|modela|representa)|de\s+qu[eé]\s+trata|describe|explain|what\s+does|meaning\s+of)/i.test(
                  parsed.data.content
                ) && /(?:diagrama|modelo|lienzo|canvas|actual)/i.test(parsed.data.content);
              if (isCanvasQuery && ingress.hint) {
                replyContent = ingress.hint;
              }
              ingressHandled = true;
            } else if (ingress.kind === 'design') {
              // Pasa el requerimiento limpio a Nivel 2 para síntesis de dominio completa
              parsed.data.content = ingress.requirement;
              ingressHandled = true;
            } else if (ingress.kind === 'dsl' && diagram) {
              const outcome = await interpretCommand(ingress.commands, new FakeLlm(), diagram, pendingDeltas);
              if (outcome.status === 'pending') {
                deltaId = outcome.deltaId;
                delta = outcome.delta;
                replyContent = isEn
                  ? `I have prepared the proposal for this change. You can preview the ghost elements on the canvas and confirm to build them.`
                  : `Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que la construya en vivo.`;
                ingressHandled = true;
              }
            }
          }
        } catch {
          // Graceful fallback to local heuristics on Groq error/timeout
        }
      }

      // 2. Degradación Elegante Offline / Local (si Groq no estaba disponible o no resolvió)
      if (!ingressHandled && !isSlashCommand) {
        // Guardián de Dominio y Anti-Jailbreak Local
        const chatGuard = evaluateChatGuard(parsed.data.content, diagram, isEn ? 'en' : 'es');
        if (chatGuard.blocked && chatGuard.replyContent) {
          replyContent = chatGuard.replyContent;
        }

        // Intérprete determinista local
        if (!replyContent && diagram && hasModelingIntent) {
          try {
            const sanitizedCommand = normalizeUmlUtterance(parsed.data.content);
            const outcome = await interpretCommand(sanitizedCommand, new FakeLlm(), diagram, pendingDeltas);
            if (outcome.status === 'pending') {
              deltaId = outcome.deltaId;
              delta = outcome.delta;
              replyContent = isEn
                ? `I have prepared the proposal for this change. You can preview the ghost elements on the canvas and confirm to build them.`
                : `Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que la construya en vivo.`;
            }
          } catch {}
        }
      }

      // Nivel 2: Agente unificado
      if (!replyContent) {
        const onChunk = isStream
          ? (chunk: string) => {
              try {
                reply.raw.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
              } catch {}
            }
          : undefined;

        try {
          const unified = await processUnifiedAmongusTurn(
            parsed.data.content,
            parsed.data.senderName,
            parsed.data.language ?? 'es',
            id,
            llm,
            diagram,
            chatHistory,
            onChunk,
            parsed.data.peerUsers,
            ingressHint,
            isSuggestIntent
          );
          if (unified.batchDelta) {
            const pending = pendingDeltas.put(id, unified.batchDelta);
            deltaId = pending.id;
            delta = pending.delta;
          }
          replyContent = unified.replyContent;
        } catch (turnErr: any) {
          app.log.error(turnErr, 'Error executing Amongus turn');
          replyContent = isEn
            ? 'An error occurred while processing your request. Please try again or rephrase.'
            : 'Ocurrió un error al procesar tu solicitud. Por favor probá nuevamente o reformulá la consulta.';
        }
      }

      const botMessage = await insertBotReply(
        pool,
        id,
        parsed.data.deviceId,
        parsed.data.senderName,
        parsed.data.channelType,
        replyContent,
        deltaId,
        delta
      );

      if (isStream) {
        reply.raw.write(`event: done\ndata: ${JSON.stringify(botMessage)}\n\n`);
        reply.raw.end();
        return;
      }
    } else if (isStream) {
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`);
      reply.raw.end();
      return;
    }

    return reply.status(201).send(message);
  });
}
