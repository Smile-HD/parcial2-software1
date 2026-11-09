import { Pool } from 'pg';
import { z } from 'zod';
import { robustParseDomainJson, expandSemanticDomainToDelta, synthesizeDomainModel, canonicalToSemantic, extractExplicitModelMutations } from '../domain-synthesizer.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from '../synthesis/domain-catalog/router.js';
import { resolveDiagramFactualQuery } from '../diagram-query-resolver.js';
import { auditDiagramOOAD } from '../diagram-auditor.js';
import { evaluateChatGuard } from './chat-guard.js';
import {
  normalizeUmlUtterance,
  detectContradiction,
  findClosestSlashCommand,
} from '@app/adapters-ai';
import {
  normalizeChatInput,
  classifyTurnIntent,
  resolveSystemPrompt,
} from '../prompt-builder.js';

export const DEFAULT_LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 2000;
export const DEFAULT_LLM_TIMEOUT_MS = Math.max(120000, Number(process.env.LLM_TIMEOUT_MS) || 180000);

export const ChatChannelTypeSchema = z.enum(['group', 'direct_bot']);
export type ChatChannelType = z.infer<typeof ChatChannelTypeSchema>;

export const SenderTypeSchema = z.enum(['user', 'bot']);
export type SenderType = z.infer<typeof SenderTypeSchema>;

export const CreateChatMessageSchema = z.object({
  deviceId: z.string().min(1),
  senderName: z.string().min(1),
  channelType: ChatChannelTypeSchema,
  content: z.string().min(1),
  language: z.enum(['es', 'en']).optional(),
  peerUsers: z.array(z.string()).optional(),
  currentDiagram: z.any().optional(),
});
export type CreateChatMessageInput = z.infer<typeof CreateChatMessageSchema>;

export interface ChatMessage {
  id: string;
  diagramId: string;
  deviceId: string;
  senderName: string;
  senderType: SenderType;
  channelType: ChatChannelType;
  targetUser?: string | null;
  content: string;
  createdAt: string;
  deltaId?: string | null;
  delta?: any | null;
}

export function parseDelta(raw: any): any {
  if (!raw) return undefined;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function insertChatMessage(
  pool: Pool,
  diagramId: string,
  input: CreateChatMessageInput,
  senderType: SenderType = 'user'
): Promise<ChatMessage> {
  const targetUser = input.channelType === 'direct_bot' ? input.senderName : null;
  const result = await pool.query(
    `INSERT INTO chat_messages (diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at, delta_id, delta`,
    [diagramId, input.deviceId, input.senderName, senderType, input.channelType, targetUser, input.content]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    diagramId: row.diagram_id,
    deviceId: row.device_id,
    senderName: row.sender_name,
    senderType: row.sender_type,
    channelType: row.channel_type,
    targetUser: row.target_user,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    deltaId: row.delta_id ?? undefined,
    delta: parseDelta(row.delta),
  };
}

export async function insertBotReply(
  pool: Pool,
  diagramId: string,
  deviceId: string,
  targetUser: string,
  channelType: ChatChannelType,
  content: string,
  deltaId?: string | null,
  delta?: any | null
): Promise<ChatMessage> {
  const result = await pool.query(
    `INSERT INTO chat_messages (diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, delta_id, delta)
     VALUES ($1, $2, 'Amongus', 'bot', $3, $4, $5, $6, $7)
     RETURNING id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at, delta_id, delta`,
    [diagramId, deviceId, channelType, targetUser, content, deltaId ?? null, delta ? JSON.stringify(delta) : null]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    diagramId: row.diagram_id,
    deviceId: row.device_id,
    senderName: row.sender_name,
    senderType: row.sender_type,
    channelType: row.channel_type,
    targetUser: row.target_user,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    deltaId: row.delta_id ?? undefined,
    delta: parseDelta(row.delta),
  };
}

export async function listChatMessages(
  pool: Pool,
  diagramId: string,
  channelType: ChatChannelType,
  deviceId?: string,
  userName?: string
): Promise<ChatMessage[]> {
  let query: string;
  let params: any[];

  if (channelType === 'group') {
    query = `SELECT id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at, delta_id, delta
             FROM chat_messages
             WHERE diagram_id = $1 
               AND channel_type = 'group'
               AND created_at >= NOW() - INTERVAL '7 days'
             ORDER BY created_at ASC`;
    params = [diagramId];
  } else {
    if (!deviceId || !userName) {
      return [];
    }
    query = `SELECT id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at, delta_id, delta
             FROM chat_messages
             WHERE diagram_id = $1 
               AND channel_type = 'direct_bot'
               AND device_id = $2
               AND target_user = $3
               AND created_at >= NOW() - INTERVAL '7 days'
             ORDER BY created_at ASC`;
    params = [diagramId, deviceId, userName];
  }

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    id: row.id,
    diagramId: row.diagram_id,
    deviceId: row.device_id,
    senderName: row.sender_name,
    senderType: row.sender_type,
    channelType: row.channel_type,
    targetUser: row.target_user,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    deltaId: row.delta_id ?? undefined,
    delta: parseDelta(row.delta),
  }));
}

export async function purgeExpiredChatMessages(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '7 days'`
  );
  return result.rowCount ?? 0;
}

export * from './prompt-formatter.js';
export * from './chat-constants.js';
import {
  generateAmongusContextualReply,
  stripEmojis,
  breakDegenerativeLoops,
  summarizeDiagramForPrompt,
  generateAmongusReply,
  isChimeraClassName,
  pruneSuggestionsToMax3,
} from './prompt-formatter.js';

export * from './chat-pipeline.js';
