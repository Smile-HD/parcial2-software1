import { Pool } from 'pg';
import { z } from 'zod';

export const ChatChannelTypeSchema = z.enum(['group', 'direct_bot']);
export type ChatChannelType = z.infer<typeof ChatChannelTypeSchema>;

export const SenderTypeSchema = z.enum(['user', 'bot']);
export type SenderType = z.infer<typeof SenderTypeSchema>;

export const CreateChatMessageSchema = z.object({
  deviceId: z.string().min(1),
  senderName: z.string().min(1),
  channelType: ChatChannelTypeSchema,
  content: z.string().min(1),
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
     RETURNING id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at`,
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
  };
}

export async function insertBotReply(
  pool: Pool,
  diagramId: string,
  deviceId: string,
  targetUser: string,
  channelType: ChatChannelType,
  content: string
): Promise<ChatMessage> {
  const result = await pool.query(
    `INSERT INTO chat_messages (diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content)
     VALUES ($1, $2, 'Amongus', 'bot', $3, $4, $5)
     RETURNING id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at`,
    [diagramId, deviceId, channelType, targetUser, content]
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
    query = `SELECT id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at
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
    query = `SELECT id, diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at
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
  }));
}

export async function purgeExpiredChatMessages(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '7 days'`
  );
  return result.rowCount ?? 0;
}

export function generateAmongusContextualReply(userContent: string, senderName: string): string {
  const text = userContent.toLowerCase();
  if (text.includes('clase') || text.includes('class')) {
    return `Hola ${senderName}, para crear una clase podes arrastrarla desde la caja de herramientas o escribir 'crear clase Nombre' en el comando de voz o texto.`;
  }
  if (text.includes('relacion') || text.includes('asoci') || text.includes('conectar')) {
    return `Para conectar clases, selecciona la herramienta de asociacion en la barra lateral y arrastra el conector entre las dos clases en el lienzo.`;
  }
  if (text.includes('exportar') || text.includes('xmi') || text.includes('spring')) {
    return `Podes exportar el modelo a Enterprise Architect XMI 2.1 o generar el backend Spring Boot usando los botones de la barra superior.`;
  }
  return `Hola ${senderName}! Soy Amongus, tu asistente UML. Podes pedirme que agregue clases, relaciones, o consultar dudas sobre el diseno.`;
}
