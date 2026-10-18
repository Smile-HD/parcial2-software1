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
  language: z.enum(['es', 'en']).optional(),
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
    delta: row.delta ?? undefined,
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
    delta: row.delta ?? undefined,
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
    delta: row.delta ?? undefined,
  }));
}

export async function purgeExpiredChatMessages(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '7 days'`
  );
  return result.rowCount ?? 0;
}

export function generateAmongusContextualReply(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es'
): string {
  const text = userContent.toLowerCase().trim();

  if (language === 'en') {
    if (text.includes('hi') || text.includes('hello') || text.includes('hey') || text.includes('how are you')) {
      return `Hello ${senderName}! Great to see you. How can I help you design your UML diagram today?`;
    }
    if (text.includes('class') || text.includes('entity') || text.includes('object') || text.includes('clase')) {
      return `Hello ${senderName}, to create a class you can drag it from the Toolbox on the left or type 'create class <Name>' in the command bar above. Double-click it anytime to add attributes and methods.`;
    }
    if (text.includes('relat') || text.includes('associat') || text.includes('connect') || text.includes('inherit') || text.includes('compos') || text.includes('aggreg') || text.includes('conectar')) {
      return `Connecting classes is easy, ${senderName}: pick a relationship tool (Association, Composition, Aggregation, or Generalization) in the left panel, then drag the connector between the two classes on the canvas.`;
    }
    if (text.includes('export') || text.includes('xmi') || text.includes('spring') || text.includes('download') || text.includes('code')) {
      return `You can export your diagram anytime, ${senderName}! Use the toolbar buttons at the top to download an Enterprise Architect XMI 2.1 file or generate a complete executable Spring Boot project with JPA entities.`;
    }
    if (text.includes('help') || text.includes('what can you do') || text.includes('who are you')) {
      return `I am Amongus, your friendly UML design assistant! You can ask me how to structure classes, connect relationships, write natural language commands, or export your model.`;
    }
    return `Hello ${senderName}! I am happy to help with your UML modeling. Feel free to ask me how to add classes, connect relationships, or export to Spring Boot!`;
  }

  // Español
  if (text.includes('hola') || text.includes('buenas') || text.includes('que tal') || text.includes('como estas') || text.includes('cómo estás')) {
    return `Hola ${senderName}! Que bueno tenerte por aca. En que puedo ayudarte hoy con el diseño de tu diagrama?`;
  }
  if (text.includes('clase') || text.includes('entidad') || text.includes('objeto') || text.includes('class')) {
    return `Hola ${senderName}! Para crear una clase podes arrastrarla directamente desde la Caja de Herramientas a la izquierda, o escribir 'crear clase Nombre' en la barra de comandos superior. Podes hacer doble clic para editar sus atributos y metodos.`;
  }
  if (text.includes('relacion') || text.includes('asoci') || text.includes('conectar') || text.includes('herencia') || text.includes('compo') || text.includes('agreg') || text.includes('relat')) {
    return `Conectar clases es muy sencillo, ${senderName}: selecciona la herramienta de relacion en el panel izquierdo (Asociacion, Agregacion, Composicion o Generalizacion) y arrastra el conector entre las dos clases en el lienzo.`;
  }
  if (text.includes('exportar') || text.includes('xmi') || text.includes('spring') || text.includes('descargar') || text.includes('codigo')) {
    return `Podes exportar tu modelo cuando quieras, ${senderName}! En la barra superior tenes los botones para descargar el archivo XMI 2.1 compatible con Enterprise Architect o generar el proyecto completo de Spring Boot con entidades JPA.`;
  }
  if (text.includes('ayuda') || text.includes('que podes hacer') || text.includes('quien sos') || text.includes('quién sos')) {
    return `Soy Amongus, tu asistente de modelado UML! Podes consultarme como estructurar clases, conectar relaciones, pedirme cambios por lenguaje natural o exportar tu trabajo.`;
  }
  return `Hola ${senderName}! Con gusto te ayudo en tu modelado. Podes preguntarme sobre como conectar clases, agregar atributos, exportar a Spring Boot o pedirme que agregue elementos.`;
}

export function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s{2,}/g, ' ').trim();
}

export async function generateAmongusReply(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es',
  llm?: any
): Promise<string> {
  if (llm && typeof llm.chat === 'function') {
    const isEn = language === 'en';
    const systemPrompt = isEn
      ? [
          'You are Amongus, a friendly, helpful, and concise software architecture tutor inside a web collaborative UML modeling tool.',
          `You are speaking with ${senderName}.`,
          'Help the user with UML class diagram modeling, relations (associations, aggregations, compositions, generalizations, dependencies, realizations, n-ary associations), design patterns, and exporting to Spring Boot JPA or Enterprise Architect XMI.',
          'If the user asks how to do things in the app:',
          '- Classes: Drag from the Toolbox on the left or type natural language in the top command bar. Double-click any class to edit attributes and methods.',
          '- Relations: Pick a relation in the Toolbox and drag between classes on canvas.',
          '- Export: Use the toolbar buttons to generate Spring Boot project or download XMI.',
          'CRITICAL RULE: DO NOT use any emojis or emoticons in your response under any circumstance. Keep answers clear, direct, and under 3 short paragraphs.',
        ].join('\n')
      : [
          'Sos Amongus, un asistente amigable, cercano y conciso de arquitectura de software dentro de una herramienta web colaborativa de diagramado UML.',
          `Estas conversando con ${senderName}.`,
          'Ayuda al usuario con modelado de clases UML, relaciones (asociaciones, agregaciones, composiciones, generalizaciones, dependencias, realizaciones, asociaciones n-arias), patrones de diseño y exportacion a Spring Boot con JPA o Enterprise Architect XMI.',
          'Si el usuario pregunta como hacer algo en la aplicacion:',
          '- Clases: Arrastra desde la Caja de Herramientas a la izquierda o escribe en la barra superior en lenguaje natural. Doble clic en una clase para editar atributos y metodos.',
          '- Relaciones: Selecciona la relacion en la Caja de Herramientas y arrastra entre las clases en el lienzo.',
          '- Exportar: Usa los botones de la barra superior para descargar el proyecto Spring Boot o el XMI.',
          'REGLA ESTRICTA: NUNCA uses emojis ni emoticones en tu respuesta bajo ninguna circunstancia. Mantene las respuestas claras, concisas y de no mas de 3 parrafos cortos.',
        ].join('\n');

    try {
      const response = await llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${senderName}: ${userContent}` },
        ],
        { timeoutMs: 5000 }
      );
      const clean = stripEmojis(response);
      if (clean.length > 0) {
        return clean;
      }
    } catch {
      // Graceful fallback to contextual deterministic reply
    }
  }

  return generateAmongusContextualReply(userContent, senderName, language);
}

