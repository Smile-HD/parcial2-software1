import { Pool } from 'pg';
import { z } from 'zod';
import { robustParseDomainJson, expandSemanticDomainToDelta, synthesizeDomainModel, canonicalToSemantic, extractExplicitModelMutations } from './domain-synthesizer.js';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from './domain-catalog/router.js';
import { resolveDiagramFactualQuery } from './diagram-query-resolver.js';
import { auditDiagramOOAD } from './diagram-auditor.js';
import {
  normalizeUmlUtterance,
  detectContradiction,
  findClosestSlashCommand,
} from '@app/adapters-ai';
import {
  normalizeChatInput,
  classifyTurnIntent,
  resolveSystemPrompt,
} from './prompt-builder.js';

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

export function generateAmongusContextualReply(
  userContent: string,
  senderName: string,
  language: 'es' | 'en' = 'es',
  peerUsers?: readonly string[],
  diagram?: any
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

  // 3. Consultas sobre el contexto, significado o clases del diagrama actual
  const isDiagramContextQuery =
    /(?:contexto|de\s+qu[eé]\s+trata|explic(?:ame|a|ar)?\s+(?:el\s+)?(?:diagrama|modelo|lienzo)|qu[eé]\s+(?:hace|modela|representa)\s+(?:el\s+)?(?:diagrama|modelo|sistema)|qu[eé]\s+clases?\s+(?:hay|tenemos|existen)|resumen\s+del\s+(?:diagrama|modelo)|what\s+does\s+the\s+diagram\s+(?:do|represent)|explain\s+(?:the\s+)?(?:diagram|model|canvas)|what\s+classes\s+are\s+there)/i.test(
      text
    );

  if (isDiagramContextQuery) {
    if (!diagram || !diagram.classes || diagram.classes.length === 0) {
      return isEn
        ? 'The canvas is currently empty (no classes or relationships). You can ask me to model a domain (e.g. /model ecommerce) or create your first class.'
        : 'Actualmente el lienzo está vacío (sin clases ni relaciones). Podés pedirme modelar un dominio (ej. /model ecommerce) o crear tu primera clase.';
    }

    const classNames = diagram.classes.map((c: any) => c.name);
    const domainMatch = matchCanonicalDomain(classNames.join(' '));
    const domainTitle = domainMatch ? ` (${domainMatch.domain.title})` : '';

    if (isEn) {
      const summaryList = diagram.classes.map((c: any) => {
        const attrs = (c.attributes || []).map((a: any) => a.name).join(', ');
        return `• **${c.name}**${attrs ? `: ${attrs}` : ''}`;
      }).join('\n');
      return `The current diagram models the domain architecture${domainTitle}. It contains ${diagram.classes.length} classes:\n${summaryList}\n\nYou can ask me to extend the model, modify relationships, or audit its OOAD structure.`;
    }

    const summaryList = diagram.classes.map((c: any) => {
      const attrs = (c.attributes || []).map((a: any) => a.name).join(', ');
      return `• **${c.name}**${attrs ? `: ${attrs}` : ''}`;
    }).join('\n');
    return `El diagrama actual modela la arquitectura del dominio${domainTitle}. Contiene ${diagram.classes.length} clases principales:\n${summaryList}\n\nPodés pedirme que agregue nuevas entidades, cambie el tipo de relación entre clases (ej. a composición) o audite el diseño con /audit.`;
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
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    const sub = g.subClassId ?? g.sourceClassId;
    const sup = g.superClassId ?? g.targetClassId;
    const src = classMap.get(sub) || sub;
    const tgt = classMap.get(sup) || sup;
    return `- Herencia: "${src}" hereda de "${tgt}"`;
  }).join('\n');

  const realizations = (diagram.realizations || []).map((r: any) => {
    const client = r.clientClassId ?? r.sourceClassId;
    const supplier = r.supplierInterfaceId ?? r.targetClassId;
    const src = classMap.get(client) || client;
    const tgt = classMap.get(supplier) || supplier;
    return `- Realizacion: "${src}" implementa "${tgt}"`;
  }).join('\n');

  const dependencies = (diagram.dependencies || []).map((d: any) => {
    const client = d.clientClassId ?? d.sourceClassId;
    const supplier = d.supplierClassId ?? d.targetClassId;
    const src = classMap.get(client) || client;
    const tgt = classMap.get(supplier) || supplier;
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

export function isChimeraClassName(name: string, existingClassNames: string[]): boolean {
  if (!name || existingClassNames.length < 2) return false;
  const cleanProposed = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanProposed.length < 4) return false;

  const hits = existingClassNames.filter((ec) => {
    const cleanEc = ec.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanEc.length >= 3 && cleanProposed.includes(cleanEc);
  });
  return hits.length >= 2;
}

export function pruneSuggestionsToMax3(text: string, existingClassNames: string[] = []): string {
  if (!text) return text;
  let cleaned = breakDegenerativeLoops(text.trim());

  const lines = cleaned.split('\n');
  const resultLines: string[] = [];
  let suggestionCount = 0;
  let inSuggestionBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isNewNumberedItem = /^\s*(?:[1-9]\d*[\.\)-]|\*\s*\*\*(?:Clase\s+)?["']?([^"'*]+)["']?\*\*)\s+/i.test(line);

    if (isNewNumberedItem) {
      const numMatch = line.match(/^\s*([1-9]\d*)[\.\)-]/);
      if (numMatch && parseInt(numMatch[1]!, 10) > 3) {
        break; // Corte duro a maximo 3 sugerencias
      }

      suggestionCount++;
      if (suggestionCount > 3) {
        break; // Corte duro
      }

      // Detector de quimeras en el encabezado
      const nameMatch = line.match(/\*\*(?:Clase\s+)?["']?([^"'*:]+)["']?\*\*/i) ||
                        line.match(/^[1-9]\d*[\.\)-]\s+["']?([A-Za-z_][\w]*)/i);
      if (nameMatch && isChimeraClassName(nameMatch[1]!, existingClassNames)) {
        suggestionCount--;
        inSuggestionBlock = false;
        continue;
      }

      inSuggestionBlock = true;
      resultLines.push(line);
    } else if (inSuggestionBlock || suggestionCount === 0) {
      const inlineChimera = line.match(/\*\*([A-Za-z_]{6,})\*\*/);
      if (inlineChimera && isChimeraClassName(inlineChimera[1]!, existingClassNames)) {
        continue;
      }
      resultLines.push(line);
    }
  }

  const pruned = resultLines.join('\n').trim();
  return breakDegenerativeLoops(pruned || cleaned);
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
  const { cleanContent, normalized } = normalizeChatInput(userContent);
  const isEn = language === 'en';

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

  // 00a2. Detección temprana de comandos contradictorios (S4: crear y borrar la misma clase a la vez)
  const contradiction = detectContradiction(cleanContent);
  if (contradiction.contradictory && contradiction.className) {
    return {
      replyContent: isEn
        ? `Contradictory request detected: you asked to both create and delete the class "${contradiction.className}" in the same message. Please clarify which action you want to perform.`
        : `Detecté una solicitud contradictoria: estás pidiendo crear y eliminar la clase "${contradiction.className}" en el mismo mensaje. Por favor indicá cuál de las dos acciones preferís realizar.`,
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

  // 00c. Detección temprana de mutación de relaciones con clases inexistentes en el diagrama
  const relationMutationMatch =
    /(?:cambi|modific|hac|haz|convert|set|poner?|pon\b|que\s+sea|renombr|change|modify|switch|turn|make).*?(?:relaci[oó]n|asociaci[oó]n|tipo\s+de\s+relaci[oó]n|v[ií]nculo|relation|relationship|association|link).*?(?:entre|between)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?:["']?)\s+(?:y|and)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
      userContent
    );
  if (relationMutationMatch) {
    const rawClassA = relationMutationMatch[1]!;
    const rawClassB = relationMutationMatch[2]!;
    const existingClasses = ((diagram?.classes as any[]) || []);
    const existingClassNames = existingClasses.map((c: any) => c.name);

    if (existingClassNames.length > 0) {
      const classExists = (target: string) => {
        const normTarget = target.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return existingClasses.some((c: any) => {
          const normC = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          return normC === normTarget || normC.includes(normTarget) || normTarget.includes(normC);
        });
      };

      const missingA = !classExists(rawClassA);
      const missingB = !classExists(rawClassB);

      if (missingA || missingB) {
        const missing = missingA && missingB ? `"${rawClassA}" ni "${rawClassB}"` : (missingA ? `"${rawClassA}"` : `"${rawClassB}"`);
        const missingEn = missingA && missingB ? `"${rawClassA}" nor "${rawClassB}"` : (missingA ? `"${rawClassA}"` : `"${rawClassB}"`);
        return {
          replyContent: isEn
            ? `I could not find the class ${missingEn} in the current diagram. Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`
            : `No encontré la clase ${missing} en el diagrama actual. Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`,
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
    /(?:c[oó]mo\s+(?:se\s+)?export|c[oó]mo\s+(?:se\s+)?guarda|c[oó]mo\s+(?:se\s+)?usa|c[oó]mo\s+funciona\s+(?:la\s+herramienta|el\s+editor|el\s+lienzo|el\s+layout|el\s+audit|el\s+chat|amongus|la\s+voz)|qu[eé]\s+(?:herramientas?|funciones?|capacidades?|comandos?|opciones?)\s+(?:tiene|hay|ofrece|soporta)|qu[eé]\s+(?:pod[eé]s|puedes|hac[eé]s)\s+(?:hacer)?|what\s+can\s+you\s+do|para\s+qu[eé]\s+sirve\s+(?:el\s+layout|el\s+audit|el\s+export|spring|xmi|png)|exportaci[oó]n|importaci[oó]n|how\s+to\s+export|how\s+does\s+(?:the\s+tool|the\s+editor|layout|audit|amongus)\s+work|what\s+tools\s+(?:are\s+there|exist))/i.test(
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
    /^(?:por\s+favor\s+)?(?:agreg[aá]|agrga|agregar|craer|cre[aá]|crear|dise[ñn][aá]|model[aá]|conect[aá]|incorpor[aá]|insert[aá]|quit[aá]|borr[aá]|brra|borrar|elimi[nñ][aá]|elmina|eliminar|arm[aá]|gener[aá]|constru[yí]|renombr[aá]|renombrar|cambi[aá]|cambiar|modific[aá]|modificar|add|create|connect|link|delete|remove|rename|modify)\b/i.test(
      normalized.replace(/^[¿?¡!\s]+/, '').trim()
    );

  const isAction =
    !isExplicitQuestion &&
    !isToolQuery &&
    (isImperativeAction ||
      /(agreg|agrga|crea|craer|dise[ñn]|model|conecta|generaliz|hered|implement|depend|n-ari|cambi|modific|marca|actualiz|pone|pon\b|insert|quit|borr|brra|elimin|elmina|hace|haz|arma|genera|constru|plante|propon|levant|falt|renombr|rename|base de datos|aerolinea|vuelo|hotel|hospital|tienda|comercio|banco|escuela|universidad|reserva|factura|venta|alquiler|biblioteca|pizzeria|add|create|connect|modify|link|delete|remove|abstract|interface)/i.test(
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
    // Cálculo real de tokens para el sistema (prompt modular ultraliviano bimodal)
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

  if (trimmedLower === '/clear' || trimmedLower === '/limpiar' || trimmedLower === '/vaciar') {
    const classCount = diagram?.classes?.length || 0;
    if (classCount === 0) {
      return {
        replyContent: isEn
          ? 'The canvas is currently empty. There are no classes to clear.'
          : 'El lienzo está vacío actualmente. No hay clases para eliminar.',
      };
    }

    const deltas: import('@app/core').ClassDelta[] = (diagram?.classes || []).map((c: any) => ({
      kind: 'class',
      op: 'delete',
      id: crypto.randomUUID(),
      diagramId,
      timestamp: new Date().toISOString(),
      classId: c.id,
    }));

    const batchDelta: import('@app/core').BatchDelta = {
      kind: 'batch',
      id: crypto.randomUUID(),
      diagramId,
      timestamp: new Date().toISOString(),
      deltas,
    };

    return {
      replyContent: isEn
        ? `I prepared a proposal to clear the canvas (deleting all ${classCount} classes and their relationships). You can review the preview on the canvas and click **Confirm** in the card below to apply.`
        : `Preparé una propuesta para vaciar el lienzo (eliminando las ${classCount} clases y sus relaciones). Podés revisar la previsualización en el lienzo y hacer clic en **Confirmar** para aplicarla.`,
      batchDelta,
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

      // Si el acumulador detecta el inicio de un 4to ítem numerado, cortamos el stream para mantener el límite estricto de 3
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
          onChunk: onChunk ? wrappedSuggestChunk : undefined, // Streaming en tiempo real a la UI token a token
          stop: ['\n4.', '\n4 ', '4. ', '4.-', '<|im_end|>'],
          repeatPenalty: 1.15,
          repeatLastN: 128,
        } as any
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
        replyContent: isEn
          ? 'There is no pending proposal or active suggestion to apply. You can ask for changes in natural language or use /model <topic>.'
          : 'No hay ninguna propuesta pendiente ni sugerencia activa para aplicar. Podés pedirme cambios en lenguaje natural o usar /model <tema>.',
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

  // S7: Intercepción de slash commands desconocidos o con typo (ej. /auditt)
  if (trimmedLower.startsWith('/')) {
    const rawCmd = trimmedLower.split(/\s+/)[0]!;
    const suggestion = findClosestSlashCommand(rawCmd);
    const didYouMean = suggestion
      ? (isEn ? ` Did you mean ${suggestion}?` : ` ¿Quisiste decir ${suggestion}?`)
      : '';
    return {
      replyContent: isEn
        ? `Unknown command "${rawCmd}".${didYouMean} Type /help to see available commands.`
        : `Comando "${rawCmd}" no reconocido.${didYouMean} Escribí /help para ver los comandos disponibles.`,
    };
  }

  if (!llm || typeof llm.chat !== 'function') {
    const explicitMutation = extractExplicitModelMutations(userContent, diagram);
    if (explicitMutation) {
      const mutationDelta = expandSemanticDomainToDelta(explicitMutation, diagramId, diagram, cleanContent);
      if (mutationDelta && mutationDelta.deltas.length > 0) {
        const defaultReply = isEn
          ? 'I have prepared the proposal for this change. You can preview the updated elements on the canvas and confirm to apply.'
          : 'Preparé la propuesta para este cambio. Podés previsualizar la relación en el lienzo y confirmarla para que se actualice en vivo.';
        return {
          replyContent: defaultReply,
          batchDelta: mutationDelta,
        };
      }
    }
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
    // El catálogo canónico solo debe intervenir cuando el usuario solicita explícitamente diseñar o modelar un nuevo dominio/sistema completo desde cero.
    // NUNCA debe inyectarse en operaciones granulares, mutaciones sobre el lienzo existente ni consultas explicativas.
    const isFullDomainSynthesisRequest =
      !isSpecificClassCreation &&
      !isDiagramExplanationQuery &&
      /(?:model|dise[ñn]|cre[aá]|arm[aá]|gener[aá]|constru[yí]|design|model|build)\s+(?:un|una|el|la|a|an)?\s*(?:sistema|modelo|dominio|plataforma|system|management)\b/i.test(cleanContent);
    const domainMatch = isFullDomainSynthesisRequest ? matchCanonicalDomain(cleanContent) : null;
    const domainGrounding = domainMatch ? `\n\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt + domainGrounding },
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
        // Rescate ante timeout, error de gateway (504/502) o falla de conexión en CPU:
        // 1. Intentar reconstruir el JSON parcial acumulado en los chunks generados antes del corte
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

        // 2. Si no llegó a generar clases en el chunk, usar el catálogo canónico como fallback inmediato
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

        // 3. Rescate agnóstico: si falló el LLM y no hubo match en catálogo, sintetizar de forma determinista
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

    // 1. Sanitizar prefijo Amongus y colapsar bucles de repetición degenerativos (ej. "de emergencia de emergencia...")
    let clean = breakDegenerativeLoops(stripEmojis(raw).replace(/^Amongus:\s*/i, '').trim());

    // 2. Si el modelo devolvió una propuesta de modelado estructurada en JSON
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

    // 2b. Resiliencia: si el usuario solicitó modelar, cambiar relaciones o mutar clases pero el modelo no devolvió JSON
    if (!hasAnyContent && isAction) {
      // 2b.1 Extraer mutación determinista directa (cambio de tipo de relación a composición/agregación, clase abstracta, renombre, borrado, etc.)
      const explicitMutation = extractExplicitModelMutations(userContent, diagram);
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

      // 2b.2 Síntesis resiliente si el usuario pidió modelar o modificar pero el modelo no emitió JSON
      const isExplicitModelingRequest =
        /(?:model|dise[ñn]|cre[aá]|arm[aá]|gener[aá]|constru[yí]|sistema|dominio|aerolinea|hospital|banco|tienda|comercio|universidad|biblioteca|factur|agrga|agreg|clse|calse|craer|cambi|modific|relaci[oó]n|composici[oó]n|agregaci[oó]n|asociaci[oó]n)/i.test(
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

    // S1 Guardrail: Evitar falso positivo conversacional si el LLM dice que preparó propuesta pero no hay batchDelta
    if (/(?:prepar[eé]\s+la\s+propuesta|cre[eé]\s+la\s+propuesta|aqu[ií]\s+est[aá]\s+la\s+propuesta|prepared\s+the\s+proposal)/i.test(clean)) {
      clean = isEn
        ? 'I could not interpret the requested changes into a proposal. Please specify the class name and attributes (e.g., "create class Employee with name and salary").'
        : 'No pude interpretar los cambios para generar la propuesta. Por favor indicá el nombre de la clase y los atributos (ej. "creá la clase Empleado con nombre y sueldo").';
    }

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

