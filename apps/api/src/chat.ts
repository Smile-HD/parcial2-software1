import { Pool } from 'pg';
import { z } from 'zod';
import { robustParseDomainJson, expandSemanticDomainToDelta, synthesizeDomainModel } from './domain-synthesizer.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from './domain-catalog/router.js';
import { resolveDiagramFactualQuery } from './diagram-query-resolver.js';
import { auditDiagramOOAD } from './diagram-auditor.js';
import { normalizeUmlUtterance } from '@app/adapters-ai';

export const DEFAULT_LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 2000;
export const DEFAULT_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 180000;

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
               AND (device_id = $2 OR target_user = $3 OR sender_name = $3)
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

export function generateAmongusContextualReply(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es',
  peerUsers?: readonly string[]
): string {
  const text = userContent
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const isEn = language === 'en';

  // 1. Consultas de presencia de usuarios conectados
  const isPresenceQuery =
    /cu[aá]nt[ao]s?\s+(?:personas?|usuarios?|compa[ñn]eros?|miembros?|gente|conectad[ao]s?)|qui[eé]n(?:es)?\s+(?:est[aá]n?|hay)\s+(?:conectad[ao]s?|en\s+la\s+sala|en\s+el\s+diagrama|en\s+la\s+sesi[oó]n|ac[aá]|aqu[ií])|how\s+many\s+(?:users?|people|peers?|members?)|who\s+is\s+(?:connected|online|in\s+the\s+room|in\s+the\s+session)/i.test(
      text
    );

  if (isPresenceQuery) {
    const peers = peerUsers && peerUsers.length > 0
      ? Array.from(new Set(peerUsers))
      : [senderName];
    if (!peers.includes(senderName)) peers.push(senderName);
    const count = peers.length;
    const namesList = peers.join(', ');

    if (isEn) {
      return count === 1
        ? `Currently you are the only one connected in this room (${senderName}). You can share the diagram URL to collaborate with others in real time.`
        : `Currently there are ${count} people connected in this room: ${namesList}. (You are connected as ${senderName}).`;
    }
    return count === 1
      ? `Actualmente sos el único conectado en esta sala (${senderName}). Podés compartir el enlace del diagrama para colaborar en tiempo real.`
      : `Actualmente hay ${count} personas conectadas en esta sala: ${namesList}. (Vos estás conectado como ${senderName}).`;
  }

  // 2. Solicitudes ambiguas o indeterminadas
  const isAmbiguous =
    /^(?:agreg[aá]|cre[aá]|dise[ñn][aá]|model[aá]|arm[aá]|gener[aá]|constru[yí]|hac[eé]|haz)\s+(?:algo|cosas|entidades|clases|el\s+sistema|un\s+sistema|un\s+modelo|un\s+diagrama|lo\s+que\s+sea|todo)?$/i.test(
      text
    ) ||
    /^(?:conect[aá]|conectal[ao]s|relacion[aá]|relacional[ao]s|vincul[aá]|vinculal[ao]s)$/i.test(
      text
    );

  if (isAmbiguous) {
    return isEn
      ? `What domain or specific entities would you like to model, ${senderName}? Please tell me which classes and attributes to include or type '/model <topic>' (e.g. /model library or /model airline) so I can prepare an exact proposal on the canvas.`
      : `¿Qué entidades o dominio te gustaría modelar, ${senderName}? Podés decirme qué clases y atributos querés incluir o escribir '/model <tema>' (ej. /model biblioteca o /model aerolinea) para que arme la propuesta exacta en el lienzo.`;
  }

  if (isEn) {
    if (text.includes('layout') || text.includes('organize') || text.includes('order')) {
      return `The /layout command (and the top toolbar button) automatically rearranges classes using a force-directed layout with safety margins to prevent overlapping.`;
    }
    if (text.includes('audit')) {
      return `The /audit command evaluates your diagram against OOAD principles, detecting orphan classes, god classes, and relationship consistency.`;
    }
    if (text.includes('voice') || text.includes('mic') || text.includes('speech')) {
      return `You can use the microphone button to record voice notes transcribed by Groq Whisper into the chat input, allowing you to review before sending.`;
    }
    if (text.includes('devoluc') || text.includes('return') || text.includes('refund')) {
      return `For a return/refund transaction, ${senderName}, the recommended pattern is to model a 'Return' (or 'Devolucion') entity associated with 'Sale' (1 to 0..*) containing date, reason, and status, composed of 'ReturnItem' (quantity, refundAmount) pointing to 'Product'. You can tell me 'create class Return' to start!`;
    }
    if (text.includes('class') || text.includes('entity') || text.includes('object') || text.includes('clase')) {
      return `Hello ${senderName}, to create a class you can drag it from the Toolbox on the left or type 'create class <Name>' in the command bar above. Double-click it anytime to add attributes and methods.`;
    }
    if (text.includes('relat') || text.includes('associat') || text.includes('connect') || text.includes('inherit') || text.includes('compos') || text.includes('aggreg') || text.includes('conectar')) {
      return `Connecting classes is easy, ${senderName}: pick a relationship tool (Association, Composition, Aggregation, or Generalization) in the left panel, then drag the connector between the two classes on the canvas.`;
    }
    if (text.includes('export') || text.includes('xmi') || text.includes('spring') || text.includes('download') || text.includes('code') || text.includes('png')) {
      return `You can export your diagram anytime, ${senderName}! Use the toolbar buttons at the top to download an Enterprise Architect XMI 2.1 file, a high-resolution PNG image, or generate a complete executable Spring Boot project with JPA entities.`;
    }
    if (text.includes('help') || text.includes('what can you do') || text.includes('who are you')) {
      return `I am Amongus, your friendly UML design assistant! You can ask me how to structure classes, connect relationships, write natural language commands, or export your model.`;
    }
    if (text.includes('hi') || text.includes('hello') || text.includes('hey') || text.includes('how are you')) {
      return `Hello ${senderName}! Great to see you. How can I help you design your UML diagram today?`;
    }
    return `Hello ${senderName}! I am happy to help with your UML modeling. Feel free to ask me how to add classes, connect relationships, or export to Spring Boot!`;
  }

  // Español
  if (text.includes('layout') || text.includes('ordenar') || text.includes('organizar') || text.includes('acomodar')) {
    return `El comando /layout (y el botón en la barra superior) reorganiza automáticamente las clases en el lienzo usando un algoritmo con márgenes de seguridad para evitar solapamientos y ordenar las relaciones.`;
  }
  if (text.includes('audit') || text.includes('auditar') || text.includes('auditoria')) {
    return `El comando /audit analiza tu diagrama bajo principios de calidad OOAD: detecta clases aisladas o huérfanas, clases sobrecargadas (God Classes) y coherencia de multiplicidades.`;
  }
  if (text.includes('voz') || text.includes('microfono') || text.includes('audio') || text.includes('whisper')) {
    return `Podés usar el botón del micrófono para grabar notas de voz que se transcriben con Groq Whisper directamente en el campo de texto del chat, permitiéndote revisar el texto antes de enviarlo.`;
  }
  if (text.includes('devoluc') || text.includes('reembolso') || text.includes('devolver')) {
    return `Para modelar una devolucion, ${senderName}, el patron recomendado es crear una clase 'Devolucion' asociada a 'Venta' o 'Factura' (1 a 0..*), con atributos como fecha, motivo, estado y totalReembolsado. Ademas, suele componerse de 'ItemDevolucion' (cantidad, motivoEspecifico) relacionada con 'Producto'. Si queres, escribime 'crear clase Devolucion' y la construimos en el lienzo!`;
  }
  if (text.includes('clase') || text.includes('entidad') || text.includes('objeto') || text.includes('class')) {
    return `Hola ${senderName}! Para crear una clase podes arrastrarla directamente desde la Caja de Herramientas a la izquierda, o escribir 'crear clase Nombre' en la barra de comandos superior. Podes hacer doble clic para editar sus atributos y metodos.`;
  }
  if (text.includes('relacion') || text.includes('asoci') || text.includes('conectar') || text.includes('herencia') || text.includes('compo') || text.includes('agreg') || text.includes('relat')) {
    return `Conectar clases es muy sencillo, ${senderName}: selecciona la herramienta de relacion en el panel izquierdo (Asociacion, Agregacion, Composicion o Generalizacion) y arrastra el conector entre las dos clases en el lienzo.`;
  }
  if (text.includes('exportar') || text.includes('xmi') || text.includes('spring') || text.includes('descargar') || text.includes('codigo') || text.includes('png')) {
    return `Podes exportar tu modelo cuando quieras, ${senderName}! En la barra superior tenes los botones para descargar el archivo XMI 2.1 compatible con Enterprise Architect, una imagen PNG de alta resolucion o generar el proyecto completo de Spring Boot con entidades JPA.`;
  }
  if (text.includes('separad') || text.includes('aislad') || text.includes('desconect') || text.includes('suelt')) {
    return `Estan separados porque todavia no se les definio una asociacion o relacion en el diagrama, ${senderName}. Podes conectarlos seleccionando una 'Asociacion' en el panel izquierdo y arrastrando la linea de una clase a la otra.`;
  }
  if (text.includes('ayuda') || text.includes('que podes hacer') || text.includes('quien sos') || text.includes('quién sos')) {
    return `Soy Amongus, tu asistente de modelado UML! Podes consultarme como estructurar clases, conectar relaciones, pedirme cambios por lenguaje natural o exportar tu trabajo.`;
  }
  if (text.includes('hola') || text.includes('buenas') || text.includes('que tal') || text.includes('como estas') || text.includes('cómo estás')) {
    return `Hola ${senderName}! Que bueno tenerte por aca. En que puedo ayudarte hoy con el diseño de tu diagrama?`;
  }
  return `Hola ${senderName}! Con gusto te ayudo en tu modelado. Podes preguntarme sobre como conectar clases, agregar atributos, exportar a Spring Boot o pedirme que agregue elementos.`;
}

export function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s{2,}/g, ' ').trim();
}

export function breakDegenerativeLoops(text: string): string {
  if (!text) return text;
  let s = text;
  // 1. Colapsar repetición inmediata de fragmentos de 4 a 80 caracteres repetidos 2 o más veces
  s = s.replace(/(.{4,80}?)(?:\s*\1){2,}/gi, '$1');

  // 2. Colapsar repetición de líneas enteras
  const lines = s.split('\n');
  const seen = new Map<string, number>();
  const deduped: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.length > 15) {
      const count = (seen.get(trimmed) || 0) + 1;
      seen.set(trimmed, count);
      if (count > 2) continue;
    }
    deduped.push(line);
  }
  s = deduped.join('\n');

  // 3. Purgar URLs falsas o inventadas
  s = s.replace(/https?:\/\/(?:www\.)?(?:i\.)?imgur\.com\/\S+/gi, '');
  s = s.replace(/https?:\/\/\S*(?:your-diagram|example\.com|placeholder)\S*/gi, '');

  return s.trim();
}

export function summarizeDiagramForPrompt(diagram?: any): string {
  if (!diagram || !diagram.classes || diagram.classes.length === 0) {
    return 'Lienzo actualmente vacio (sin clases ni relaciones).';
  }
  const classMap = new Map((diagram.classes as any[]).map(c => [c.id, c.name]));
  const classesStr = (diagram.classes as any[]).map(c => {
    const attrs = (c.attributes || []).map((a: any) => `${a.name}: ${a.type || 'string'}`).join(', ');
    const methods = (c.methods || []).map((m: any) => `${m.name}(): ${m.returnType || 'void'}`).join(', ');
    const details = [attrs ? `atributos: [${attrs}]` : null, methods ? `metodos: [${methods}]` : null].filter(Boolean).join(' | ');
    const isAbs = c.isAbstract ? ' [abstract]' : '';
    const isIntf = c.isInterface ? ' [interface]' : '';
    return `- Clase "${c.name}"${isAbs}${isIntf}${details ? ` (${details})` : ''}`;
  }).join('\n');

  const associations = (diagram.associations || []).map((a: any) => {
    const src = classMap.get(a.sourceClassId) || a.sourceClassId;
    const tgt = classMap.get(a.targetClassId) || a.targetClassId;
    const agg = a.aggregation && a.aggregation !== 'none' ? a.aggregation : 'asociacion';
    const mult = `multiplicidad: ${a.sourceMultiplicity || '1'} a ${a.targetMultiplicity || '1'}`;
    const roles = [
      a.sourceRole ? `rol origen: "${a.sourceRole}"` : null,
      a.targetRole ? `rol destino: "${a.targetRole}"` : null,
    ].filter(Boolean).join(', ');
    const assocCls = a.associationClassId ? ` [clase de asociacion: "${classMap.get(a.associationClassId) || a.associationClassId}"]` : '';
    return `- Relacion entre "${src}" y "${tgt}" (${agg}, ${mult}${roles ? `, ${roles}` : ''}${assocCls})`;
  }).join('\n');

  const generalizations = (diagram.generalizations || []).map((g: any) => {
    const src = classMap.get(g.sourceClassId) || g.sourceClassId;
    const tgt = classMap.get(g.targetClassId) || g.targetClassId;
    return `- Herencia: "${src}" hereda de "${tgt}"`;
  }).join('\n');

  const realizations = (diagram.realizations || []).map((r: any) => {
    const src = classMap.get(r.sourceClassId) || r.sourceClassId;
    const tgt = classMap.get(r.targetClassId) || r.targetClassId;
    return `- Realizacion: "${src}" implementa "${tgt}"`;
  }).join('\n');

  const dependencies = (diagram.dependencies || []).map((d: any) => {
    const src = classMap.get(d.sourceClassId) || d.sourceClassId;
    const tgt = classMap.get(d.targetClassId) || d.targetClassId;
    return `- Dependencia: "${src}" depende de "${tgt}"`;
  }).join('\n');

  const sections = [
    `CLASES EN EL LIENZO:\n${classesStr}`,
    `RELACIONES EN EL LIENZO:\n${associations || 'Ninguna asociacion directa.'}`,
  ];
  if (generalizations.length > 0) sections.push(`HERENCIAS (GENERALIZACIONES):\n${generalizations.join('\n')}`);
  if (realizations.length > 0) sections.push(`REALIZACIONES (INTERFACES):\n${realizations.join('\n')}`);
  if (dependencies.length > 0) sections.push(`DEPENDENCIAS:\n${dependencies.join('\n')}`);

  return sections.join('\n\n');
}

export async function generateAmongusReply(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es',
  llm?: any,
  diagram?: any
): Promise<string> {
  if (llm && typeof llm.chat === 'function') {
    const isEn = language === 'en';
    const diagramContext = summarizeDiagramForPrompt(diagram);
    const systemPrompt = isEn
      ? [
          'You are Amongus, a friendly, helpful, and senior software architecture tutor inside a web collaborative UML modeling tool.',
          `You are speaking with ${senderName}.`,
          'ROLE AND EXPERTISE:',
          '- You provide expert advice on Object-Oriented Analysis and Design (OOAD), UML class modeling, relations, domain modeling, and design patterns.',
          '- You understand business domain problems (e.g., sales, returns, payments, invoices, inventory, reservations, banking).',
          '- Example for returns: When modeling a return/refund transaction, recommend an associative or dedicated transaction entity (e.g. Return/Devolucion) linked to Sale/Invoice, containing ReturnItem/ItemDevolucion, tracking date, reason, refund amount, and status.',
          '- Explain differences between Composition (strong ownership/lifecycle) and Aggregation (independent lifecycle), Generalization (inheritance), and Associative Classes for M:N relations with extra data.',
          '- In the application, users can build elements by dragging from the Toolbox or typing natural language commands. They can also ask you to create classes directly.',
          'CRITICAL RULE: DO NOT use any emojis or emoticons under any circumstance. Keep answers clear, insightful, practical, and under 3 short paragraphs.',
          'CANVAS STATE RULE: NEVER claim that you cleared, deleted, modified, or created elements on the canvas from this text response. All canvas mutations require a structured proposal card. If the user asks to clear, delete, or modify the canvas, guide them to use a modeling command.',
          `CURRENT CANVAS CONTEXT:\n${diagramContext}\nUse this context to accurately answer questions about which classes exist, why they are connected or separated, or how to model them.`,
        ].join('\n')
      : [
          'Sos Amongus, un asistente amigable, cercano y experto de arquitectura de software dentro de una herramienta web colaborativa de diagramado UML.',
          `Estas conversando con ${senderName}.`,
          'ROL Y CONOCIMIENTO ARQUITECTÓNICO:',
          '- Sos un tutor experto en Análisis y Diseño Orientado a Objetos (OOAD), diagramas de clases UML, patrones de diseño y modelado de dominio.',
          '- Ayudas con conceptos reales de negocio (ventas, devoluciones, compras, facturación, stock, reservas, etc.).',
          '- Ejemplo devoluciones: Cuando te pregunten cómo modelar una devolución o reembolso, recomendá crear la entidad transaccional propia ("Devolucion") vinculada a "Venta"/"Factura", compuesta por "ItemDevolucion" (que apunta a Producto), con atributos como fecha, motivo, estado y montoReembolso.',
          '- Explicá cuándo usar Composición (cuando los ítems no tienen sentido sin el padre, como Factura y LineaFactura), Agregación (cuando las partes tienen ciclo de vida independiente), Generalización (herencia) o Clases Intermedias para relaciones muchos a muchos con datos propios.',
          '- En la app, los usuarios pueden arrastrar elementos desde la Caja de Herramientas, usar los conectores entre clases o pedirte directamente que propongas o crees clases.',
          'REGLA ESTRICTA: NUNCA uses emojis ni emoticones bajo ninguna circunstancia. Mantene las respuestas claras, prácticas, directas y en no más de 3 párrafos cortos.',
          'REGLA SOBRE EL ESTADO DEL LIENZO: NUNCA digas que limpiaste, borraste o modificaste el lienzo desde este mensaje de texto. El lienzo solo se modifica mediante tarjetas de propuesta estructuradas. Si te piden limpiar o borrar, indícales el comando adecuado.',
          `ESTADO ACTUAL DEL DIAGRAMA EN EL LIENZO:\n${diagramContext}\nUsa este contexto para responder con precision a preguntas sobre que clases existen, por que estan separadas o como conectarlas.`,
        ].join('\n');

    try {
      const response = await llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${senderName}: ${userContent}` },
        ],
        { timeoutMs: DEFAULT_LLM_TIMEOUT_MS, maxTokens: DEFAULT_LLM_MAX_TOKENS }
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
  peerUsers?: readonly string[]
): Promise<UnifiedTurnResult> {
  const cleanContent = normalizeUmlUtterance(userContent);
  const isEn = language === 'en';

  const normalized = cleanContent
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 00a. Guardrail de entrada: descartar ruido léxico, símbolos puros o números sin texto (0 ms, 0 tokens)
  const rawClean = cleanContent.trim();
  const letterCount = (rawClean.match(/[\p{L}]/gu) || []).length;
  if (letterCount < 2) {
    return {
      replyContent: isEn
        ? `I didn't understand your message, ${senderName}. You can ask architectural questions, request UML modeling actions (e.g. 'create class User'), or use commands like /help, /model, or /suggest.`
        : `No entendí tu mensaje, ${senderName}. Podés hacerme consultas de arquitectura, pedirme cambios en el diagrama (ej. "creá la clase Usuario") o usar comandos como /help, /model o /suggest.`,
    };
  }

  // 00b. Detección temprana de borrado de clase inexistente (evita bloqueos o alucinaciones en modelos chicos)
  const deleteClassMatch = /\b(?:delete|remove|elimina|eliminá|eliminar|elmina|borra|borrá|borrar|brra|sacar|sacá|saca)\b[\s\S]*?\b(?:class|clase|calse|clse|tabla|table|entidad)\s+(?:llamada\s+|llamado\s+|llamda\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(userContent);
  if (deleteClassMatch) {
    const rawTarget = deleteClassMatch[1]!;
    const STOP_WORDS = new Set(['que', 'de', 'la', 'el', 'un', 'una', 'los', 'las', 'cualquier', 'cada', 'that', 'which', 'the', 'a', 'an', 'any', 'every']);
    const existingClassNames = ((diagram?.classes as any[]) || []).map((c: any) => c.name);

    if (STOP_WORDS.has(rawTarget.toLowerCase())) {
      if (/(?:que\s+no\s+existe|that\s+does\s+not\s+exist)/i.test(userContent)) {
        return {
          replyContent: isEn
            ? `No valid class was specified for deletion. If you want to delete a class, specify its name (e.g. 'delete class User'). Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`
            : `No se especificó ninguna clase válida para eliminar. Si querés borrar una clase, indicá su nombre exacto (ej. "borrá la clase Usuario"). Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`,
        };
      }
    } else {
      const exists = existingClassNames.some((n: string) => n.toLowerCase() === rawTarget.toLowerCase());
      if (!exists && existingClassNames.length > 0) {
        return {
          replyContent: isEn
            ? `The class "${rawTarget}" does not exist in the current diagram. Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`
            : `La clase "${rawTarget}" no existe en el diagrama actual. Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`,
        };
      }
    }
  }

  // 0a. Detección inmediata de consultas sobre personas/usuarios conectados en la sala
  const isPresenceQuery =
    /cu[aá]nt[ao]s?\s+(?:personas?|usuarios?|compa[ñn]eros?|miembros?|gente|conectad[ao]s?)|qui[eé]n(?:es)?\s+(?:est[aá]n?|hay)\s+(?:conectad[ao]s?|en\s+la\s+sala|en\s+el\s+diagrama|en\s+la\s+sesi[oó]n|ac[aá]|aqu[ií])|how\s+many\s+(?:users?|people|peers?|members?)|who\s+is\s+(?:connected|online|in\s+the\s+room|in\s+the\s+session)/i.test(
      normalized
    );

  if (isPresenceQuery) {
    const peers = peerUsers && peerUsers.length > 0
      ? Array.from(new Set(peerUsers))
      : [senderName];
    if (!peers.includes(senderName)) peers.push(senderName);
    const count = peers.length;
    const namesList = peers.join(', ');

    if (isEn) {
      return {
        replyContent: count === 1
          ? `Currently you are the only one connected in this room (${senderName}). You can share the diagram URL to collaborate with others in real time.`
          : `Currently there are ${count} people connected in this room: ${namesList}. (You are connected as ${senderName}).`,
      };
    }
    return {
      replyContent: count === 1
        ? `Actualmente sos el único conectado en esta sala (${senderName}). Podés compartir el enlace del diagrama para colaborar en tiempo real.`
        : `Actualmente hay ${count} personas conectadas en esta sala: ${namesList}. (Vos estás conectado como ${senderName}).`,
    };
  }

  // 0b. Solicitudes de modelado ambiguas o sin entidades/dominio especificado
  const isAmbiguous =
    /^(?:agreg[aá]|cre[aá]|dise[ñn][aá]|model[aá]|arm[aá]|gener[aá]|constru[yí]|hac[eé]|haz)\s+(?:algo|cosas|entidades|clases|el\s+sistema|un\s+sistema|un\s+modelo|un\s+diagrama|lo\s+que\s+sea|todo)?$/i.test(
      normalized.trim()
    ) ||
    /^(?:conect[aá]|conectal[ao]s|relacion[aá]|relacional[ao]s|vincul[aá]|vinculal[ao]s)$/i.test(
      normalized.trim()
    );

  const isVagueReferent =
    /(?:ponele|pon\s+le|ponle|agregale|agrega\s+le|sumale|metele|modificame|cambiale|add\s+to|put\s+into)\s+.*(?:esa\s+clase|esa\s+entidad|esa\s+cosa|that\s+class|that\s+entity)/i.test(
      normalized
    ) ||
    /^(?:ponele|pon\s+le|ponle|agregale|agrega\s+le|sumale|metele)\s+(?:m[aá]s\s+)?(?:cosas|atributos|campos|metodos|datos)$/i.test(
      normalized.trim()
    );

  if (isAmbiguous || isVagueReferent) {
    const existingClasses = Array.isArray(diagram?.classes) && diagram.classes.length > 0
      ? diagram.classes.map((c: any) => `"${c.name}"`).join(', ')
      : null;

    if (existingClasses) {
      return {
        replyContent: isEn
          ? `Which class would you like to modify, ${senderName}? Classes on canvas: ${existingClasses}. Please tell me the specific class name and what attributes or methods to add.`
          : `¿A cuál de las clases querés agregarle cosas, ${senderName}? En el lienzo tenés: ${existingClasses}. Por favor indicame el nombre de la clase y qué atributos o métodos querés sumarle.`,
      };
    }

    return {
      replyContent: isEn
        ? `What domain or specific entities would you like to model, ${senderName}? Please tell me which classes and attributes to include or type '/model <topic>' (e.g. /model library or /model airline) so I can prepare an exact proposal on the canvas.`
        : `¿Qué entidades o dominio te gustaría modelar, ${senderName}? Podés decirme qué clases y atributos querés incluir o escribir '/model <tema>' (ej. /model biblioteca o /model aerolinea) para que arme la propuesta exacta en el lienzo.`,
    };
  }

  // 0c. Inspección factual determinista del estado del lienzo (0 ms, 0% alucinación)
  const factualReply = resolveDiagramFactualQuery(userContent, diagram, language);
  if (factualReply) {
    return {
      replyContent: factualReply,
    };
  }

  // 0c1. Interceptor de preguntas teóricas de modelado UML y OOAD (evita confusión/alucinación en SLM locales)
  const isTheoreticalUmlQuestion =
    /(?:diferencia\s+(?:hay\s+)?entre\s+agregaci[oó]n\s+y\s+composici[oó]n|agregaci[oó]n\s+vs\s+composici[oó]n|cu[aá]ndo\s+usar\s+(?:agregaci[oó]n|composici[oó]n)|difference\s+between\s+aggregation\s+and\s+composition)/i.test(
      userContent
    );
  if (isTheoreticalUmlQuestion) {
    const theoreticalReply = isEn
      ? `In UML, both aggregation and composition represent "whole-part" relationships (has-a), but they differ fundamentally in lifecycle dependency and exclusivity:

1. **Composition (Filled Diamond — Strong Form)**:
   - **Strict Lifecycle Dependency**: The part cannot exist without the whole. If the container is destroyed, its parts are destroyed with it.
   - **Exclusive Ownership**: A part belongs to exactly one container at any given time (multiplicity on the whole end is always 1).
   - **Example**: \`Invoice\` and \`InvoiceItem\`, or \`Building\` and \`Room\`. An invoice line item has no domain purpose without the invoice.

2. **Aggregation (Hollow Diamond — Weak Form)**:
   - **Independent Lifecycle**: Parts exist independently before, during, and after belonging to the whole. If the container is destroyed, parts continue to exist.
   - **Shared Membership**: An entity can belong to multiple aggregators or none.
   - **Example**: \`Department\` and \`Professor\`, or \`Team\` and \`Player\`. If the department closes, the professor still exists and can be reassigned.

**Practical OOAD Rule of Thumb**: Default to **plain association**. Only use **composition** when there is strict lifecycle dependency and the child entity has no independent identity outside the parent.`
      : `En UML, tanto la agregación como la composición representan relaciones "todo-parte" (has-a), pero difieren radicalmente en la dependencia de ciclo de vida y la exclusividad:

1. **Composición (Rombo relleno — Fuerte)**:
   - **Dependencia de ciclo de vida estricta**: La parte no puede existir sin el todo. Si el objeto contenedor se destruye, sus partes se destruyen con él.
   - **Pertenencia exclusiva**: Cada parte pertenece exactamente a un único contenedor a la vez (la multiplicidad del todo siempre es 1).
   - **Ejemplo**: \`Factura\` y \`DetalleFactura\`, o \`Edificio\` y \`Habitacion\`. Un renglón de factura carece de sentido de existencia en el negocio si no pertenece a una factura.

2. **Agregación (Rombo hueco — Débil)**:
   - **Ciclo de vida independiente**: Las partes existen por sí mismas antes, durante y después de pertenecer al todo. Si el contenedor se destruye, las partes continúan existiendo.
   - **Pertenencia compartida**: Un elemento puede pertenecer a varios contenedores o a ninguno.
   - **Ejemplo**: \`Departamento\` y \`Profesor\`, o \`Equipo\` y \`Jugador\`. Si el departamento cierra, el profesor sigue existiendo y puede pertenecer a otro departamento.

**Criterio OOAD práctico**: Por defecto, usá siempre **asociación simple**. Solo usá **composición** cuando exista una relación existencial indivisible donde la parte no tenga identidad de negocio fuera del todo.`;

    return {
      replyContent: theoreticalReply,
    };
  }

  // 0c2. Interceptor de relaciones reflexivas explícitas sobre clases existentes (evita clases intermedias alucinadas)
  const isReflexiveIntent =
    /(?:relaci[oó]n\s+reflexiva|reflexiva|consigo\s+misma|auto-?asociaci[oó]n|self-?association|reflexive\s+association)/i.test(
      userContent
    );
  if (isReflexiveIntent && diagram && Array.isArray(diagram.classes) && diagram.classes.length > 0) {
    const existingClasses = diagram.classes as Array<{ id: string; name: string }>;
    const targetClass = existingClasses.find((c) =>
      new RegExp(`\\b${c.name}\\b`, 'i').test(userContent)
    );
    if (targetClass) {
      let multSource = '0..*';
      let multTarget = '0..*';
      if (/\b(?:1\s*:\s*1|uno\s+a\s+uno|1\s+a\s+1)\b/i.test(userContent)) {
        multSource = '1';
        multTarget = '1';
      } else if (/\b(?:1\s*:\s*n|uno\s+a\s+muchos|1\s+a\s+muchos)\b/i.test(userContent)) {
        multSource = '1';
        multTarget = '0..*';
      }

      const nameMatch = /(?:relaci[oó]n\s+reflexiva\s+(?:de\s+)?|con\s+nombre\s+|llamada\s+)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(userContent);
      const assocName = nameMatch && !/(?:consigo|misma|con|de|en|sobre)/i.test(nameMatch[1]!) ? nameMatch[1] : 'amistad';

      const assocDelta: import('@app/core').AssociationDelta = {
        kind: 'association',
        op: 'create',
        baseVersion: diagram.version ?? 0,
        associationId: crypto.randomUUID(),
        sourceClassId: targetClass.id,
        targetClassId: targetClass.id,
        directed: false,
        name: assocName,
        sourceRole: assocName,
        targetRole: assocName,
        sourceMultiplicity: multSource,
        targetMultiplicity: multTarget,
      };

      const batch: import('@app/core').BatchDelta = {
        kind: 'batch',
        baseVersion: diagram.version ?? 0,
        deltas: [assocDelta],
      };

      return {
        replyContent: isEn
          ? `Added a reflexive relationship to class "${targetClass.name}". You can preview it on the canvas and confirm to apply.`
          : `Preparé la relación reflexiva sobre la clase "${targetClass.name}". Podés previsualizarla en el lienzo y confirmarla para aplicarla.`,
        batchDelta: batch,
      };
    }
  }

  // 0d. Filtro fuera de dominio / preguntas filosóficas o de cultura general
  const isToolQuery =
    /(?:c[oó]mo\s+(?:se\s+)?export|c[oó]mo\s+(?:se\s+)?guarda|c[oó]mo\s+(?:se\s+)?usa|c[oó]mo\s+funciona\s+(?:la\s+herramienta|el\s+editor|el\s+lienzo|el\s+layout|el\s+audit|el\s+chat|amongus|la\s+voz)|qu[eé]\s+(?:herramientas?|funciones?|capacidades?|comandos?|opciones?)\s+(?:tiene|hay|ofrece|soporta)|para\s+qu[eé]\s+sirve\s+(?:el\s+layout|el\s+audit|el\s+export|spring|xmi|png)|exportaci[oó]n|importaci[oó]n|how\s+to\s+export|how\s+does\s+(?:the\s+tool|the\s+editor|layout|audit|amongus)\s+work|what\s+tools\s+(?:are\s+there|exist))/i.test(
      normalized
    );

  const isQuestionPrefix = /^(?:que|por\s*que|como|cual|cuales|quien|quienes|cuanto|cuanta|cuantos|cuantas|explic|diferencia|ayuda|significa|para\s+que|what|why|how|who|where|which|can\s+you|could\s+you|explain)/i.test(
    normalized.replace(/^[¿?¡!\s]+/, '').trim()
  );

  const isExplicitQuestion =
    isToolQuery ||
    isQuestionPrefix ||
    normalized.includes('?');

  const isImperativeAction =
    /^(?:por\s+favor\s+)?(?:agreg[aá]|agrga|agregar|craer|cre[aá]|crear|dise[ñn][aá]|model[aá]|conect[aá]|incorpor[aá]|insert[aá]|quit[aá]|borr[aá]|brra|borrar|elimi[nñ][aá]|elmina|eliminar|arm[aá]|gener[aá]|constru[yí]|add|create|connect|link|delete|remove)\b/i.test(
      normalized.replace(/^[¿?¡!\s]+/, '').trim()
    );

  const isAction =
    !isExplicitQuestion &&
    !isToolQuery &&
    (isImperativeAction ||
      /(agreg|agrga|crea|craer|dise[ñn]|model|conecta|generaliz|hered|implement|depend|n-ari|cambi|modific|marca|actualiz|pone|pon\b|insert|quit|borr|brra|elimin|elmina|hace|haz|arma|genera|constru|plante|propon|levant|falt|base de datos|aerolinea|vuelo|hotel|hospital|tienda|comercio|banco|escuela|universidad|reserva|factura|venta|alquiler|biblioteca|pizzeria|add|create|connect|modify|link|delete|remove|abstract|interface)/i.test(
        normalized
      ));

  const isSoftwareOrDomainQuery =
    /(?:uml|clase|class|calse|clse|objeto|entidad|entity|metodo|method|atributo|attribute|relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|herencia|generalizaci[oó]n|interfaz|interface|patr[oó]n|dise[ñn]o|arquitectura|software|sistema|modelo|spring|java|c[oó]digo|code|export|import|layout|audit|tabla|base\s+de\s+datos|bd|db|api|endpoint|backend|frontend|canvas|lienzo|diagrama|amongus|whisper|micro|audio|presencia|usuario|sala|room|peer|ayuda|help|comand|propuest|delta|multiplicidad)/i.test(
      normalized
    ) ||
    matchCanonicalDomain(userContent) !== null ||
    (Array.isArray(diagram?.classes) &&
      diagram.classes.some((c: any) => normalized.includes(c.name.toLowerCase())));

  const isPhilosophicalOrOutOfDomain =
    /^(?:qu[eé]\s+(?:es|significa)\s+(?:la\s+vida|el\s+amor|la\s+muerte|el\s+universo|la\s+felicidad|dios|el\s+sentido)|qui[eé]n\s+(?:gan[oó]|invent[oó]|descubri[oó]|es\s+(?:messi|maradona|el\s+presidente))|cu[aá]nto\s+(?:es|vale)\s+\d+|contame\s+un\s+chiste|h[aá]blame\s+de\s+(?:filosof[ií]a|pol[ií]tica)|recit[aá]|qu[eé]\s+opinas\s+de\s+(?:la\s+vida|dios))/i.test(
      normalized.replace(/^[¿?¡!\s]+/, '').trim()
    ) || (isExplicitQuestion && !isSoftwareOrDomainQuery && !isToolQuery);

  if (isPhilosophicalOrOutOfDomain && !isToolQuery) {
    return {
      replyContent: isEn
        ? `As a software architecture and UML tutor, my specialty is helping you design, structure, and audit software systems (classes, relationships, OOAD patterns, and Spring Boot generation). Is there a software domain or diagram concept you would like to explore?`
        : `Como tutor de arquitectura y diseño UML, mi especialidad es ayudarte a diseñar, estructurar y auditar sistemas de software (clases, relaciones, principios OOAD y generación a Spring Boot). ¿Hay algún sistema o concepto de software que quieras que modelemos o analicemos?`,
    };
  }

  if (!llm || typeof llm.chat !== 'function') {
    return {
      replyContent: generateAmongusContextualReply(userContent, senderName, language, peerUsers),
    };
  }

  const diagramContext = summarizeDiagramForPrompt(diagram);

  // 0. Manejo de Comandos Slash Explícitos (/help, /model, /audit, /suggest)
  const trimmedLower = userContent.trim().toLowerCase();

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
    return { replyContent: helpLines };
  }

  if (trimmedLower === '/reset') {
    return {
      replyContent: isEn
        ? 'Chat context reset. Conversational memory has been cleared to 0 tokens for maximum speed on CPU.'
        : 'Contexto del chat reiniciado. La memoria conversacional se vació a 0 tokens para máxima velocidad en CPU.',
    };
  }

  if (trimmedLower === '/context') {
    const classCount = diagram?.classes?.length || 0;
    const historyCount = chatHistory?.length || 0;
    const baseTokens = 450;
    const canvasTokens = Math.ceil(diagramContext.length / 4);
    const historyTokens = Math.ceil(
      (chatHistory || []).reduce((acc, m) => acc + (m.content?.length || 0), 0) / 4
    );
    const totalTokens = baseTokens + canvasTokens + historyTokens;

    let latency = isEn ? 'Optimal (~15-25s on CPU)' : 'Óptima (~15-25s en CPU)';
    let tip = isEn ? 'Context size is well-balanced.' : 'Tamaño de contexto balanceado.';
    if (totalTokens >= 2400) {
      latency = isEn ? 'Heavy (>45s on CPU)' : 'Pesada (>45s en CPU)';
      tip = isEn ? 'Use /reset to clear conversational memory.' : 'Usá /reset para limpiar la memoria conversacional.';
    } else if (totalTokens >= 1200) {
      latency = isEn ? 'Moderate (~25-40s on CPU)' : 'Moderada (~25-40s en CPU)';
      tip = isEn ? 'Acceptable speed.' : 'Velocidad aceptable.';
    }

    const reply = isEn
      ? `Context Status: ~${totalTokens} total tokens (Base: ${baseTokens}, Canvas: ${canvasTokens}, History: ${historyTokens}). Estimated CPU Latency: ${latency}. Recommendation: ${tip}`
      : `Estado del Contexto: ~${totalTokens} tokens totales (Base: ${baseTokens}, Lienzo: ${canvasTokens}, Historial: ${historyTokens}). Latencia estimada en CPU: ${latency}. Recomendación: ${tip}`;

    return { replyContent: reply };
  }

  if (trimmedLower.startsWith('/model ') || trimmedLower === '/model') {
    const domainTopic = userContent.trim().slice(6).trim();
    if (!domainTopic) {
      return {
        replyContent: isEn
          ? 'Please specify a domain topic, e.g. /model airline or /model hospital'
          : 'Por favor indicá un tema de dominio, ej: /model aerolineas o /model hospital',
      };
    }
    const synthesized = await synthesizeDomainModel(domainTopic, diagramId, llm, diagram, true);
    if (synthesized && synthesized.deltas.length > 0) {
      return {
        replyContent: isEn
          ? `Prepared domain proposal for "${domainTopic}". You can preview it on the canvas and confirm to apply.`
          : `Preparé la propuesta de modelo para "${domainTopic}". Podés previsualizarla en el lienzo y confirmarla.`,
        batchDelta: synthesized,
      };
    }
  }

  const isAuditIntent =
    trimmedLower === '/audit' ||
    /(?:est[aá]\s+bien\s+(?:armado|hecho|planteado|dise[ñn]ado)\s+(?:el\s+modelo|el\s+diagrama|el\s+sistema)|qu[eé]\s+le\s+falta\s+(?:al\s+modelo|al\s+diagrama)?|c[oó]mo\s+ves\s+el\s+(?:modelo|diagrama)|evalua\s+(?:el\s+modelo|el\s+diagrama)|audita\s+(?:el\s+modelo|el\s+diagrama)|is\s+the\s+model\s+(?:good|well\s+designed)|what\s+is\s+missing\s+in\s+the\s+(?:model|diagram))/i.test(
      normalized
    );

  if (isAuditIntent) {
    const report = auditDiagramOOAD(diagram, language);
    return {
      replyContent: report,
    };
  }

function pruneSuggestionsToMax3(text: string, existingClassNames: string[] = []): string {
  if (!text) return text;
  let cleaned = text.trim();

  if (existingClassNames.length >= 2) {
    const blocks = cleaned.split(/\n\s*\n/);
    const filteredBlocks = blocks.filter((block) => {
      const match = block.match(/\*\*(?:Clase\s+)?["']?([^"'*]+)["']?\*\*/i);
      if (!match) return true;
      const proposed = match[1]!.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hits = existingClassNames.filter((ec) => {
        const cleanEc = ec.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanEc.length >= 3 && proposed.includes(cleanEc);
      });
      return hits.length < 2;
    });
    if (filteredBlocks.length > 0) {
      cleaned = filteredBlocks.join('\n\n');
    }
  }

  return cleaned;
}

  if (trimmedLower === '/layout' || trimmedLower === '/layout canvas') {
    const classCount = diagram?.classes?.length || 0;
    if (classCount === 0) {
      return {
        replyContent: isEn
          ? 'The canvas is currently empty. Add classes before running /layout.'
          : 'El lienzo está vacío actualmente. Agregá clases antes de ejecutar /layout.',
      };
    }
    return {
      replyContent: isEn
        ? `The /layout command is executed in the web interface to reposition the ${classCount} classes without overlaps. Click Auto-Layout in the canvas toolbar or run /layout in the web chat.`
        : `El comando /layout se ejecuta en la interfaz web para reposicionar las ${classCount} clases sin solapamientos. Hacé clic en Auto-Layout en la barra del lienzo o ejecutá /layout en el chat web.`,
    };
  }

  if (trimmedLower === '/suggest') {
    if (!diagram || !diagram.classes || diagram.classes.length === 0) {
      return {
        replyContent: isEn
          ? 'The canvas is currently empty. You can start by typing /model <topic> (e.g. /model ecommerce) or asking me to create your first class.'
          : 'El lienzo está vacío actualmente. Podés arrancar usando /model <tema> (ej. /model ecommerce) o pidiéndome crear tu primera clase.',
      };
    }

    const classCount = diagram.classes.length;
    const existingNames = diagram.classes.map((c: any) => c.name);
    const domainMatch = matchCanonicalDomain(diagramContext);
    const domainGrounding = domainMatch ? `\n\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

    const suggestPrompt = isEn
      ? [
          'You are Amongus, a senior software architecture tutor.',
          `CURRENT CANVAS CONTEXT (${classCount} classes):\n${diagramContext}`,
          domainGrounding,
          'CRITICAL ARCHITECTURAL RULES (AVOID OVER-ENGINEERING & COMBINATORIAL BLOAT):',
          '- PROPOSAL LIMIT (MAX 5 NEW CLASSES): In this suggestion, propose AT MOST 5 new classes (minimum 1 if essential entities are missing, maximum 5). NEVER propose more than 5 classes at once.',
          '- IF DOMAIN IS ALREADY COVERED: If the existing classes already represent the core domain concepts and no essential entity is truly missing, DO NOT invent superfluous classes or artificial intermediaries! In that case, propose ZERO new classes and focus EXCLUSIVELY on refining existing classes (attributes and methods).',
          '- PRIORITIZE REFINING EXISTING CLASSES (ATTRIBUTES & METHODS):',
          '  1. ADD MISSING ATTRIBUTES: Suggest essential missing domain attributes on existing classes (e.g. status, seatNumber, basePrice, dateOfBirth).',
          '  2. REMOVE OR CLEAN MALFORMED ATTRIBUTES: Suggest removing redundant attributes, duplicate fields, or type-leaked names (e.g. clean "name:string").',
          '  3. ADD BUSINESS METHODS: Suggest essential business operations to overcome an anemic domain model (e.g. calculateTotal(), bookSeat(), cancel()).',
          '- STRICT ANTI-CHIMERA RULE: NEVER invent compound class names by concatenating two existing class names (e.g. NEVER "AirportAirline", "FlightPassenger", "PaymentInvoice"). Relationships between existing entities must be direct associations, not artificial intermediate classes.',
          '- FORMAT: Structure your suggestion with clear, direct sections:',
          '  1. **New Essential Entities** (only if truly missing, at most 5 classes; omit if none needed)',
          '  2. **Attributes to Add or Remove in Existing Classes** (key attributes to add or cleanup)',
          '  3. **Key Business Methods** (operations to give life to entities)',
          'Provide clear, concise architectural reasoning without code blocks or JSON.',
        ].filter(Boolean).join('\n')
      : [
          'Sos Amongus, tutor senior de arquitectura de software.',
          `ESTADO ACTUAL DEL LIENZO (${classCount} clases):\n${diagramContext}`,
          domainGrounding,
          'REGLAS CRÍTICAS DE ARQUITECTURA (EVITAR SOBREINGENIERÍA Y ALUCINACIONES COMBINATORIAS):',
          '- LÍMITE DE LA PROPUESTA (MÁXIMO 5 CLASES NUEVAS): En esta sugerencia podés proponer como MÁXIMO 5 clases nuevas (mínimo 1 si faltan conceptos clave, máximo 5). NUNCA propongas más de 5 clases en una sola respuesta.',
          '- SI EL DOMINIO YA ESTÁ CUBIERTO: Si las clases existentes ya representan los conceptos nucleares del dominio y no falta ninguna entidad esencial, ¡NO inventes clases superfluas ni intermediarios artificiosos solo para rellenar! En ese caso, proponé CERO clases nuevas y dedicate EXCLUSIVAMENTE a enriquecer atributos y métodos de las clases existentes.',
          '- PRIORIZÁ ENRIQUECER Y DEPURAR LAS CLASES EXISTENTES (ATRIBUTOS Y MÉTODOS):',
          '  1. AUMENTAR ATRIBUTOS FALTANTES: Detectá clases existentes a las que les falten atributos clave del dominio (ej. agregar "estado", "asiento", "precioBase", "fechaEmision") y sugerí incorporarlos.',
          '  2. QUITAR O SANEAR ATRIBUTOS: Sugerí quitar o limpiar atributos redundantes, duplicados o malformados (ej. corregir "nombre:string" o eliminar campos innecesarios).',
          '  3. MÉTODOS DE NEGOCIO: Sugerí métodos clave en las entidades principales para superar el modelo de dominio anémico (ej. calcularTotal(), reservar(), emitirBoleto()).',
          '- REGLA ESTRICTA ANTI-QUIMERAS: NUNCA inventes nombres combinando o fusionando clases existentes (ej: NUNCA "AeropuertoAerolinea", "VueloPasajero", "PagoFactura"). Si dos entidades interactúan, usá una asociación directa simple (1..* o *..*), NUNCA una clase intermedia artificiosa.',
          '- FORMATO DE SUGERENCIAS:',
          '  1. **Nuevas Entidades Clave** (sólo si realmente faltan en el negocio, máximo 5 clases; omitir esta sección si el dominio ya está cubierto)',
          '  2. **Atributos a Aumentar o Quitar en Clases Existentes** (atributos clave a sumar o sanear)',
          '  3. **Métodos de Negocio Clave** (operaciones de negocio para dotar de comportamiento al modelo)',
          'Explicá el por qué desde la perspectiva de diseño OOAD limpio, sin bloques de código ni JSON. Sé directo y conciso.',
        ].filter(Boolean).join('\n');

    let suggestChunks = '';
    const wrappedSuggestChunk = (chunk: string) => {
      suggestChunks += chunk;
      onChunk?.(chunk);
    };

    try {
      const suggestResult = await llm.chat(
        [
          { role: 'system', content: suggestPrompt },
          { role: 'user', content: 'Sugerir próximas entidades para completar el dominio' },
        ],
        { timeoutMs: DEFAULT_LLM_TIMEOUT_MS, maxTokens: DEFAULT_LLM_MAX_TOKENS, onChunk: wrappedSuggestChunk }
      );
      return { replyContent: pruneSuggestionsToMax3(stripEmojis(suggestResult), existingNames).trim() };
    } catch {
      if (suggestChunks.trim().length > 30) {
        return { replyContent: pruneSuggestionsToMax3(stripEmojis(suggestChunks), existingNames).trim() };
      }
      return {
        replyContent: isEn
          ? 'I suggest reviewing transaction details or intermediate entities for your model.'
          : 'Te sugiero revisar si tu modelo necesita clases intermedias para transacciones (como detalles de comprobante o historiales).',
      };
    }
  }

  const isApplyTrigger =
    trimmedLower === '/apply' ||
    trimmedLower.startsWith('/apply ') ||
    trimmedLower === '/aplicar' ||
    trimmedLower.startsWith('/aplicar ') ||
    trimmedLower.startsWith('implement') ||
    trimmedLower.startsWith('aplica') ||
    trimmedLower.startsWith('crea e implement') ||
    trimmedLower.startsWith('creá e implement') ||
    /^(?:por\s+favor\s+)?(?:implement[aá]r?|aplic[aá]r?|constru[yí]r?|arm[aá]r?|cre[aá]r?)\b/i.test(trimmedLower);

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

    const lastAssistantMsg = [...(chatHistory || [])].reverse().find((m) => m.role === 'assistant');
    const recentHistory = (chatHistory || [])
      .slice(-4)
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n');

    let topic: string;
    if (isReferencingSuggestion) {
      if (lastAssistantMsg) {
        topic = `Implementar y modelar las siguientes clases y entidades sugeridas previamente por el asistente:\n${lastAssistantMsg.content}\n\nContexto reciente:\n${recentHistory}`;
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
        replyContent: isEn
          ? 'I prepared the domain proposal on the canvas with all suggested entities and relationships. You can inspect the preview on the canvas and click **Confirm** in the card below or send `/apply` again to materialize it.'
          : 'Preparé la propuesta en el lienzo con las entidades y relaciones sugeridas. Podés revisar la previsualización en el lienzo y hacer clic en **Confirmar** en la tarjeta de abajo o enviar `/apply` nuevamente para materializarla.',
        batchDelta: synthesized,
      };
    }
    return {
      replyContent: isEn
        ? 'Could not generate an automatic proposal for this suggestion. You can specify: /model <topic>'
        : 'No se pudo generar una propuesta automática para esta sugerencia. Podés especificar: /model <tema>',
    };
  }

  const activePeers = peerUsers && peerUsers.length > 0
    ? Array.from(new Set(peerUsers))
    : [senderName];
  if (!activePeers.includes(senderName)) activePeers.push(senderName);
  const activePeersSummary = activePeers.join(', ');

  const systemPrompt = isEn
    ? [
        'You are Amongus, a senior software architecture tutor inside a web collaborative UML modeling tool.',
        `You are conversing with ${senderName}.`,
        'TOOL CAPABILITIES AND CURRENT ROOM CONTEXT:',
        `- You are running inside an interactive collaborative UML modeling tool (UML Collaborative Editor).`,
        `- Active users currently connected in this room: ${activePeersSummary}.`,
        '- Editor features and toolbar tools:',
        '  * Live UML Modeling: Classes, Interfaces, Attributes, Methods, Associations with multiplicities, Compositions, Aggregations, Generalizations/Inheritance, Realizations, Dependencies, and intermediate Association Classes.',
        '  * Real-time collaboration: Yjs CRDT synchronization and live multi-user presence.',
        '  * Top toolbar:',
        '    - Export Spring Boot: downloads a complete runnable Java Spring Boot project with JPA entities, repositories, and controllers based on the current diagram.',
        '    - Export XMI 2.1: standard interchange format for Enterprise Architect, Visual Paradigm, etc.',
        '    - Export PNG: high-resolution diagram screenshot.',
        '    - Import XMI: load an existing diagram from an XMI file.',
        '    - Auto-Layout (/layout): force-directed collision-free layout algorithm to organize classes cleanly without overlaps.',
        '  * Amongus Chat Commands:',
        '    - /help: interactive command guide.',
        '    - /model <topic>: full domain model proposal for the requested domain.',
        '    - /suggest: suggest missing domain entities according to OOAD principles.',
        '    - /audit: formal OOAD quality audit (orphan classes, god classes, low cohesion).',
        '    - /apply: materialize active proposal or suggestion onto the live canvas.',
        '    - /layout: automatically rearrange classes to remove overlaps.',
        '    - /clear: safely clear canvas with confirmation card.',
        '    - /context: context tokens and velocity indicator.',
        '    - /reset: reset chat history to 0 tokens.',
        '  * Voice notes: transcribed using Groq Whisper (whisper-large-v3-turbo) directly to the chat input field.',
        '',
        'AMBIGUITY AND TOOL QUESTIONS HANDLING:',
        '- If the user asks a vague, underspecified, or ambiguous request (e.g. "make a model", "add things", "connect them" without specifying entities or domain):',
        '  * DO NOT guess or invent random classes.',
        '  * Politely ask for clarification: ask which entities, attributes, or business rules they need, or suggest using `/model <topic>`.',
        '- If the user asks questions about the tool or how it works, answer accurately using the tool features above.',
        '',
        'CRITICAL RULES:',
        '1. NO EMOJIS or emoticons under any circumstance.',
        '2. THE USER NEVER WRITES JSON OR CODE: The user interacts visually or via conversational chat. NEVER output JSON tutorials, schema examples, or tell the user how to format JSON.',
        '3. NEVER use the word "code" or say "here is the code". The user is interacting with an interactive visual UML diagramming canvas, not writing source code.',
        isAction
          ? [
              '4. USER REQUESTED TO CREATE, MODEL, OR MODIFY CLASSES OR A DOMAIN/SYSTEM (e.g. airline, store, hotel, hospital):',
              '   STRICT: NEVER output class attributes or entities as plain text bullet points.',
              '   YOUR ENTIRE RESPONSE MUST START IMMEDIATELY WITH THE ```json BLOCK.',
              '   DO NOT WRITE INTRODUCTIONS, DO NOT GREET, DO NOT SAY "HERE IS THE CODE".',
              '   CRITICAL OOAD QUALITY RULES:',
              '   - DEFAULT TO PLAIN ASSOCIATION: Most relationships between classes are plain associations ("aggregation": "none"). Use composition ("aggregation": "composite") ONLY when part lifecycle strictly depends on whole (e.g. Invoice -> LineItem). Use aggregation ("aggregation": "shared") only for independent collections. NEVER overuse aggregation for regular references.',
              '   - MODIFYING OR CHANGING RELATIONSHIPS: To change an existing relationship (e.g. change composition to association, or update multiplicities), emit the association between those two classes with the new "aggregation": "none" or updated multiplicities.',
              '   - RECURSIVE ASSOCIATIONS: When a class relates to itself (e.g. Employee supervises Employee), put the same class name in source and target and assign roles ("sourceRole": "supervisor", "targetRole": "subordinate").',
              '   - ROLES ON EDGES: You can include "sourceRole", "targetRole" and "name" to label relationship paths.',
              '   - ASSOCIATION CLASSES: Use an association class ONLY when an M:N relationship genuinely carries its own link attributes (e.g. Enrollment between Student and Course with date/grade). In that case, specify "associationClass": "ClassName" on the association and declare it in "classes". For relationships without link attributes (1:1, 1:N, or attribute-less M:N), use direct associations without intermediate classes. NEVER concatenate class names (e.g. NEVER "StudentCourse").',
              '   - INHERITANCE / GENERALIZATION: Use "generalizations": [{"subclass": "Child", "superclass": "Parent"}] for "is-a" relationships. Subclasses inherit attributes and do not repeat them. NEVER create an association between a subclass and its superclass.',
              '   - ZERO DUPLICATES: Between any two classes, create AT MOST ONE relationship. NEVER output two associations or association + aggregation between the same pair of classes.',
              '   - ZERO ORPHAN OR EMPTY CLASSES: Every class must have 2 to 4 domain attributes with types and be connected to at least one other class.',
              '   Exact JSON output format required:',
              '   ```json',
              '   {',
              '     "action": "modify",',
              '     "classes": [',
              '       { "name": "Airline", "attributes": [{ "name": "airlineName", "type": "string" }, { "name": "iataCode", "type": "string" }] },',
              '       { "name": "Flight", "attributes": [{ "name": "flightNumber", "type": "string" }, { "name": "capacity", "type": "int" }] }',
              '     ],',
              '     "associations": [',
              '       { "source": "Airline", "target": "Flight", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
              '     ]',
              '   }',
              '   ```',
              '   CATALOG OF SUPPORTED OPERATIONS:',
              '   - Classes: "classes": [{"name": "Animal", "attributes": [{"name": "age", "type": "int"}], "methods": [{"name": "move", "returnType": "void"}]}]',
              '   - Interfaces: "classes": [{"name": "Flyable", "isInterface": true, "methods": [{"name": "fly", "returnType": "void"}]}]',
              '   - Associations: "associations": [{"source": "Customer", "target": "Order", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]',
              '   - Generalization: "generalizations": [{"subclass": "Dog", "superclass": "Animal"}]',
              '   - Realization: "realizations": [{"clientClass": "Pigeon", "supplierInterface": "Flyable"}]',
              '   - Deletions: "deletions": {"classes": ["DeletedClass"]}',
              '   STRICT: NEVER include code blocks, JSON syntax, or dummy placeholders in your conversational replies.',
            ].join('\n')
          : [
              '4. THEORETICAL OR ADVICE QUESTION (e.g. what is aggregation vs composition?):',
              '   Answer 100% in natural, pedagogical human language explaining the architecture.',
              '   STRICT: NEVER include code blocks, JSON syntax, or dummy placeholders in your conversational replies.',
            ].join('\n'),
        '',
        'NAME DISAMBIGUATION:',
        '- In UML, "class" is the concept of an entity. But in this diagram the user also has a specific entity literally named "Clase" (lesson/course entity). Use the conversation context and history to differentiate between the OOP concept of class and the specific entity named "Clase".',
        '',
        `CURRENT CANVAS CONTEXT:\n${diagramContext}`,
      ].join('\n')
    : [
        'Sos Amongus, un tutor senior de arquitectura de software dentro de una herramienta web colaborativa de diagramado UML.',
        `Estas conversando con ${senderName}.`,
        'CONOCIMIENTO DE LA HERRAMIENTA Y ENTORNO ACTUAL:',
        `- Estás integrado en un editor web colaborativo de diagramas UML (UML Collaborative Editor).`,
        `- Usuarios actualmente conectados en esta sala: ${activePeersSummary}.`,
        '- Capacidades y herramientas del editor:',
        '  * Modelado UML en vivo: Clases, Interfaces, Atributos, Métodos, Asociaciones con multiplicidades, Composiciones (rombo relleno), Agregaciones (rombo hueco), Generalizaciones / Herencia (flecha hueca), Realizaciones (flecha discontinua), Dependencias y Clases de Asociación intermedias.',
        '  * Colaboración en tiempo real: sincronización multiusuario con Yjs (CRDT) y presencia en vivo.',
        '  * Barra superior:',
        '    - Exportar Spring Boot: genera y descarga un proyecto Java Spring Boot ejecutable con entidades JPA, repositorios y controladores basados en el diagrama actual.',
        '    - Exportar XMI 2.1: estándar interoperable para Enterprise Architect, Visual Paradigm, etc.',
        '    - Exportar PNG: captura gráfica de alta resolución del diagrama.',
        '    - Importar XMI: carga un diagrama desde un archivo XMI estándar.',
        '    - Auto-Layout (/layout): algoritmo de fuerza dirigida con separación y márgenes de seguridad para ordenar las clases y evitar solapamientos.',
        '  * Asistente Amongus y Comandos Slash en Chat:',
        '    - /help: guía interactiva de todos los comandos.',
        '    - /model <tema>: propuesta completa de clases y relaciones para el dominio pedido.',
        '    - /suggest: sugiere entidades faltantes según los principios OOAD.',
        '    - /audit: auditoría formal OOAD del diagrama actual (acoplamiento, clases huérfanas, god classes).',
        '    - /apply: aplica y materializa en vivo la propuesta activa en el lienzo.',
        '    - /layout: reorganiza automáticamente los nodos para evitar solapamientos.',
        '    - /clear: vacía el lienzo de manera segura.',
        '    - /context: métricas de tokens y velocidad.',
        '    - /reset: limpia la memoria a 0 tokens para máxima velocidad.',
        '  * Notas de voz: transcripción con Groq Whisper (whisper-large-v3-turbo) directamente al chat.',
        '',
        'MANEJO DE AMBIGÜEDAD Y PREGUNTAS DE LA HERRAMIENTA:',
        '- Si el usuario hace una solicitud ambigua o incompleta (ej. "hacé el sistema", "agregá cosas", "conectalos", "hacé un modelo" sin decir qué dominio ni qué entidades):',
        '  * NUNCA inventes clases al azar sin consultar.',
        '  * Preguntale amablemente qué entidades, atributos o reglas de negocio específicas desea modelar, o sugerile usar /model <tema> si quiere que diseñes un dominio completo.',
        '- Si te pregunta sobre la herramienta, su funcionamiento, comandos o usuarios conectados, respondé con total precisión usando la información anterior.',
        '',
        'REGLAS CRÍTICAS:',
        '1. NUNCA uses emojis ni emoticones bajo ninguna circunstancia.',
        '2. EL USUARIO NUNCA ESCRIBE JSON NI CÓDIGO: El usuario interactúa de forma visual o mediante chat. NUNCA le des tutoriales de JSON ni le muestres cómo formatear JSON.',
        '3. NUNCA uses la palabra "código" ni digas "aquí tienes el código" o "acá tenés el código". El usuario interactúa con un lienzo visual interactivo de diagramas UML, no escribe código fuente.',
        isAction
          ? [
              '4. EL USUARIO PIDE CREAR, MODIFICAR O MODELAR CLASES O UN DOMINIO/SISTEMA (ej. aerolíneas, tienda, hotel, ventas):',
              '   ESTRICTO: NUNCA escribas los atributos ni las entidades como viñetas de texto plano.',
              '   TU RESPUESTA DEBE EMPEZAR INMEDIATAMENTE CON EL BLOQUE ```json.',
              '   ESTÁ ESTRICTAMENTE PROHIBIDO: Escribir introducciones, saludos o frases como "acá tenés el código". Si te piden un modelo o sistema, TODO debe ir estructurado en JSON.',
              '   REGLAS CRÍTICAS DE CALIDAD OOAD:',
              '   - ASOCIACIÓN SIMPLE POR DEFECTO: La gran mayoría de relaciones son asociaciones simples ("aggregation": "none"). Usá composición ("aggregation": "composite") SOLO cuando el ciclo de vida de la parte depende estrictamente del todo (ej. Factura -> Detalle). Usá agregación ("aggregation": "shared") únicamente para colecciones independientes. NUNCA uses composición para referencias entre entidades pares como Pasajero, Aerolínea, Sucursal o Viaje.',
              '   - MODIFICAR O CAMBIAR RELACIONES EXISTENTES: Si el usuario pide cambiar una relación existente (ej. cambiar composición a asociación simple, o cambiar multiplicidades), emití la asociación entre esas clases con el nuevo "aggregation": "none" o las nuevas multiplicidades.',
              '   - ASOCIACIONES RECURSIVAS: Cuando una clase se relaciona consigo misma (ej. Empleado supervisa a Empleado), poné la misma clase en source y target y asigná roles claros ("sourceRole": "supervisor", "targetRole": "subordinado").',
              '   - ROLES EN EL CAMINO DE LA RELACIÓN: Podés incluir "sourceRole", "targetRole" y "name" para rotular el camino de las relaciones.',
              '   - CLASES DE ASOCIACIÓN: Usá una clase de asociación ÚNICAMENTE cuando una relación M:N posea atributos propios del vínculo (ej: Inscripcion entre Estudiante y Curso con fecha/nota). En ese caso, especificá "associationClass": "NombreClase" en la asociación y definila en "classes". Para relaciones sin atributos de enlace (1:1, 1:N o M:N sin atributos), usá asociaciones directas sin clases intermedias. NUNCA nombres clases concatenando nombres existentes (ej: NUNCA "EstudianteCurso").',
              '   - HERENCIA / GENERALIZACIÓN: Usá "generalizations": [{"subclass": "Hijo", "superclass": "Padre"}] para relaciones "es un" (is-a). Las subclases heredan atributos y no los repiten. NUNCA crees una asociación entre una subclase y su superclase.',
              '   - EXTENDER MODELO EXISTENTE: Si el usuario pide agregar una clase nueva y asociarla a clases ya existentes en el lienzo, poné en "classes" ÚNICAMENTE la clase nueva. NO re-declares las clases existentes en "classes". En "associations" usá los nombres exactos de las clases existentes como source o target.',
              '   - DIRECCIÓN DE MULTIPLICIDADES: "sourceMultiplicity" corresponde al extremo de "source" y "targetMultiplicity" al extremo de "target". Si "un Libro tiene muchas Reservas", entonces Libro tiene 1 y Reserva tiene 1..* (o 0..*). No inviertas el orden de las multiplicidades.',
              '   - CERO DUPLICADOS: Entre cualquier par de clases debe haber COMO MÁXIMO UNA relación. NUNCA generes dos asociaciones ni asociación + agregación entre el mismo par de clases.',
              '   - CERO CLASES VACÍAS NI HUÉRFANAS: Toda clase debe tener entre 2 y 4 atributos de dominio con tipos y estar conectada al menos con otra clase.',
              '   Formato exacto de salida requerido:',
              '   ```json',
              '   {',
              '     "action": "modify",',
              '     "classes": [',
              '       { "name": "Aerolinea", "attributes": [{ "name": "nombre", "type": "string" }, { "name": "codigoIATA", "type": "string" }] },',
              '       { "name": "Vuelo", "attributes": [{ "name": "codigo", "type": "string" }, { "name": "capacidad", "type": "int" }] }',
              '     ],',
              '     "associations": [',
              '       { "source": "Aerolinea", "target": "Vuelo", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
              '     ]',
              '   }',
              '   ```',
              '   CATÁLOGO DE OPERACIONES:',
              '   - Clases: "classes": [{"name": "Animal", "attributes": [{"name": "edad", "type": "int"}], "methods": [{"name": "moverse", "returnType": "void"}]}]',
              '   - Interfaces: "classes": [{"name": "Volador", "isInterface": true, "methods": [{"name": "volar", "returnType": "void"}]}]',
              '   - Asociaciones: "associations": [{"source": "Cliente", "target": "Pedido", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]',
              '   - Generalización: "generalizations": [{"subclass": "Perro", "superclass": "Animal"}]',
              '   - Realización: "realizations": [{"clientClass": "Paloma", "supplierInterface": "Volador"}]',
              '   - Eliminaciones: "deletions": {"classes": ["ClaseABorrar"]}',
            ].join('\n')
          : [
              '4. PREGUNTA TEÓRICA O CONCEPTUAL (ej. ¿qué es agregación?, ¿por qué separar entidades?):',
              '   Respondé 100% en lenguaje natural humano, claro y pedagógico como arquitecto de software.',
              '   ESTRICTO: NUNCA incluyas bloques de código, JSON ni plantillas de ejemplo en tu respuesta conversacional.',
            ].join('\n'),
        '',
        'DESAMBIGUACIÓN DE NOMBRES:',
        '- En UML la palabra "clase" suele referirse al concepto general de entidad. Pero en este lienzo el usuario tiene además una entidad nombrada literalmente "Clase" (para una clase o sesión escolar, con profesor y materia). Usá el contexto y el historial de la conversación para discernir si habla del concepto o de su entidad específica "Clase".',
        '',
        `ESTADO ACTUAL DEL DIAGRAMA EN EL LIENZO:\n${diagramContext}`,
      ].join('\n');

  try {
    const isSpecificClassCreation = /\b(?:clase|calse|clse|class|tabla)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ]/i.test(cleanContent);
    const domainMatch = !isSpecificClassCreation ? matchCanonicalDomain(cleanContent) : null;
    const domainGrounding = domainMatch ? `\n\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt + domainGrounding },
      ...(chatHistory ?? []),
      { role: 'user', content: cleanContent },
    ];

    const raw = await llm.chat(
      messages,
      { timeoutMs: DEFAULT_LLM_TIMEOUT_MS, maxTokens: DEFAULT_LLM_MAX_TOKENS, onChunk: isAction ? undefined : onChunk }
    );

    // 1. Sanitizar prefijo Amongus y colapsar bucles de repetición degenerativos (ej. "de emergencia de emergencia...")
    let clean = breakDegenerativeLoops(stripEmojis(raw).replace(/^Amongus:\s*/i, '').trim());

    // 2. Si el modelo devolvió una propuesta de modelado estructurada en JSON
    const parsedModel = robustParseDomainJson(clean);
    const hasAnyContent =
      parsedModel &&
      ((parsedModel.classes && parsedModel.classes.length > 0) ||
        (parsedModel.associations && parsedModel.associations.length > 0) ||
        (parsedModel.generalizations && parsedModel.generalizations.length > 0) ||
        (parsedModel.realizations && parsedModel.realizations.length > 0) ||
        (parsedModel.dependencies && parsedModel.dependencies.length > 0) ||
        (parsedModel.naryAssociations && parsedModel.naryAssociations.length > 0) ||
        (parsedModel.deletions && (
          (parsedModel.deletions.classes && parsedModel.deletions.classes.length > 0) ||
          (parsedModel.deletions.attributes && parsedModel.deletions.attributes.length > 0) ||
          (parsedModel.deletions.methods && parsedModel.deletions.methods.length > 0) ||
          (parsedModel.deletions.associations && parsedModel.deletions.associations.length > 0)
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

    // 2b. Resiliencia: si el usuario solicitó modelar o crear un dominio/sistema pero el modelo no devolvió JSON,
    // sintetizar la propuesta directamente para que el usuario reciba su tarjeta visual en lugar de texto plano
    if (!hasAnyContent && isAction) {
      const isExplicitModelingRequest =
        /(?:model|dise[ñn]|cre[aá]|arm[aá]|gener[aá]|constru[yí]|sistema|dominio|aerolinea|hospital|banco|tienda|comercio|universidad|biblioteca|factur|agrga|agreg|clse|calse|craer)/i.test(
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

    // 3. Si no fue propuesta o fue una explicación conversacional:
    // Purgar cualquier bloque ```json ... ``` huérfano para que el usuario nunca vea código crudo en la burbuja de chat
    clean = breakDegenerativeLoops(clean.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim());

    if (clean.length > 0) {
      return { replyContent: clean };
    }
  } catch (err: any) {
    console.error('Error in processUnifiedAmongusTurn:', err);
    if (
      err &&
      (err.name === 'AbortError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('timeout') ||
        err.code === 'ETIMEDOUT')
    ) {
      return {
        replyContent: isEn
          ? 'The local model exceeded the response time limit (60s). Please ask a more specific question, or use commands like /audit or /model.'
          : 'El modelo local de lenguaje excedió el tiempo límite de respuesta (60s). Probá con una consulta más puntual, o usá comandos directos como /audit o /model.',
      };
    }
  }

  return {
    replyContent: generateAmongusContextualReply(userContent, senderName, language),
  };
}

