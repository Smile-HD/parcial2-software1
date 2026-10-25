import { Pool } from 'pg';
import { z } from 'zod';
import { robustParseDomainJson, expandSemanticDomainToDelta, synthesizeDomainModel } from './domain-synthesizer.js';

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
    if (text.includes('devoluc') || text.includes('return') || text.includes('refund')) {
      return `For a return/refund transaction, ${senderName}, the recommended pattern is to model a 'Return' (or 'Devolucion') entity associated with 'Sale' (1 to 0..*) containing date, reason, and status, composed of 'ReturnItem' (quantity, refundAmount) pointing to 'Product'. You can tell me 'create class Return' to start!`;
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
    if (text.includes('hi') || text.includes('hello') || text.includes('hey') || text.includes('how are you')) {
      return `Hello ${senderName}! Great to see you. How can I help you design your UML diagram today?`;
    }
    return `Hello ${senderName}! I am happy to help with your UML modeling. Feel free to ask me how to add classes, connect relationships, or export to Spring Boot!`;
  }

  // Español
  if (text.includes('devoluc') || text.includes('reembolso') || text.includes('devolver')) {
    return `Para modelar una devolucion, ${senderName}, el patron recomendado es crear una clase 'Devolucion' asociada a 'Venta' o 'Factura' (1 a 0..*), con atributos como fecha, motivo, estado y totalReembolsado. Ademas, suele componerse de 'ItemDevolucion' (cantidad, motivoEspecifico) relacionada con 'Producto'. Si queres, escribime 'crear clase Devolucion' y la construimos en el lienzo!`;
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

export function summarizeDiagramForPrompt(diagram?: any): string {
  if (!diagram || !diagram.classes || diagram.classes.length === 0) {
    return 'Lienzo actualmente vacio (sin clases ni relaciones).';
  }
  const classMap = new Map((diagram.classes as any[]).map(c => [c.id, c.name]));
  const classesStr = (diagram.classes as any[]).map(c => {
    const attrs = (c.attributes || []).map((a: any) => `${a.name}: ${a.type || 'string'}`).join(', ');
    const methods = (c.methods || []).map((m: any) => `${m.name}(): ${m.returnType || 'void'}`).join(', ');
    const details = [attrs ? `atributos: [${attrs}]` : null, methods ? `metodos: [${methods}]` : null].filter(Boolean).join(' | ');
    return `- Clase "${c.name}"${details ? ` (${details})` : ''}`;
  }).join('\n');

  const associations = (diagram.associations || []).map((a: any) => {
    const src = classMap.get(a.sourceClassId) || a.sourceClassId;
    const tgt = classMap.get(a.targetClassId) || a.targetClassId;
    return `- Relacion entre "${src}" y "${tgt}" (${a.aggregation && a.aggregation !== 'none' ? a.aggregation : 'asociacion'})`;
  }).join('\n');

  return `CLASES EN EL LIENZO:\n${classesStr}\n\nRELACIONES EN EL LIENZO:\n${associations || 'Ninguna (las clases estan desconectadas sin relaciones entre si)'}`;
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
        { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000 }
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
  onChunk?: (chunk: string) => void
): Promise<UnifiedTurnResult> {
  const isEn = language === 'en';

  if (!llm || typeof llm.chat !== 'function') {
    return {
      replyContent: generateAmongusContextualReply(userContent, senderName, language),
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
    const canvasTokens = classCount * 35;
    const historyTokens = historyCount * 65;
    const totalTokens = baseTokens + canvasTokens + historyTokens;

    let latency = isEn ? '🟢 Fast (~3-6s on CPU)' : '🟢 Rápida (~3-6s en CPU)';
    let tip = isEn ? 'Memory is optimal.' : 'Memoria óptima.';
    if (totalTokens >= 2400) {
      latency = isEn ? '🔴 Heavy (>30s on CPU)' : '🔴 Pesada (>30s en CPU)';
      tip = isEn ? 'Use /reset to clear history.' : 'Usá /reset para limpiar el historial.';
    } else if (totalTokens >= 1200) {
      latency = isEn ? '🟡 Moderate (~10-20s on CPU)' : '🟡 Moderada (~10-20s en CPU)';
      tip = isEn ? 'Acceptable speed.' : 'Velocidad aceptable.';
    }

    const reply = isEn
      ? `📊 Context Status: ~${totalTokens} total tokens (Base: ${baseTokens}, Canvas: ${canvasTokens}, History: ${historyTokens}). Velocity: ${latency}. Tip: ${tip}`
      : `📊 Estado del Contexto: ~${totalTokens} tokens totales (Base: ${baseTokens}, Lienzo: ${canvasTokens}, Historial: ${historyTokens}). Velocidad: ${latency}. Consejo: ${tip}`;

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

  if (trimmedLower === '/audit') {
    const auditPrompt = isEn
      ? [
          'You are Amongus, a senior software architect conducting a formal OOAD and UML quality audit of the current diagram.',
          `CURRENT CANVAS STATE:\n${diagramContext}`,
          'EVALUATE AND REPORT (under 3 concise sections, NO emojis, NO code blocks):',
          '1. Structural Cohesion & Orphan Classes: Are there disconnected classes?',
          '2. Responsibility & Complexity: Are any classes overloaded with attributes or methods?',
          '3. Relationship Quality: Are compositions, aggregations, and multiplicities appropriate?',
          '4. Recommended Improvements: Specific concrete architectural next steps.',
        ].join('\n')
      : [
          'Sos Amongus, un arquitecto de software senior realizando una auditoría formal de calidad OOAD y UML del diagrama actual.',
          `ESTADO ACTUAL DEL LIENZO:\n${diagramContext}`,
          'EVALUÁ Y REPORTÁ (en 3 secciones claras y concisas, SIN emojis, SIN bloques de código):',
          '1. Cohesión estructural y Clases huérfanas: ¿Hay clases desconectadas o aisladas?',
          '2. Responsabilidad y Complejidad: ¿Hay clases sobrecargadas de atributos o métodos (God Classes)?',
          '3. Calidad de Relaciones: ¿Las composiciones, agregaciones y multiplicidades son correctas?',
          '4. Mejoras Recomendadas: Próximos pasos concretos de arquitectura.',
        ].join('\n');

    let auditChunks = '';
    const wrappedAuditChunk = (chunk: string) => {
      auditChunks += chunk;
      onChunk?.(chunk);
    };

    try {
      const auditResult = await llm.chat(
        [
          { role: 'system', content: auditPrompt },
          { role: 'user', content: 'Ejecutar auditoría OOAD del diagrama actual' },
        ],
        { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000, maxTokens: 450, onChunk: wrappedAuditChunk }
      );
      return { replyContent: stripEmojis(auditResult).trim() };
    } catch {
      if (auditChunks.trim().length > 30) {
        return { replyContent: stripEmojis(auditChunks).trim() };
      }
      return {
        replyContent: isEn
          ? 'Could not complete the audit at this time. Please try again.'
          : 'No se pudo completar la auditoría en este momento. Por favor intentá nuevamente.',
      };
    }
  }

  if (trimmedLower === '/suggest') {
    if (!diagram || !diagram.classes || diagram.classes.length === 0) {
      return {
        replyContent: isEn
          ? 'The canvas is currently empty. You can start by typing /model <topic> (e.g. /model ecommerce) or asking me to create your first class.'
          : 'El lienzo está vacío actualmente. Podés arrancar usando /model <tema> (ej. /model ecommerce) o pidiéndome crear tu primera clase.',
      };
    }

    const suggestPrompt = isEn
      ? [
          'You are Amongus, a senior software architecture tutor.',
          `CURRENT CANVAS CONTEXT:\n${diagramContext}`,
          'Suggest exactly 2 or 3 essential missing entities or relationships (max 3) with a concise 2-line explanation each.',
          'Provide clear architectural reasoning without code blocks or JSON, ensuring the reply is complete and concise.',
        ].join('\n')
      : [
          'Sos Amongus, tutor senior de arquitectura de software.',
          `ESTADO ACTUAL DEL LIENZO:\n${diagramContext}`,
          'Sugerí exactamente 2 o 3 entidades clave faltantes o relaciones clave (máximo 3) con una explicación concisa de 2 líneas cada una.',
          'Explicá claramente el por qué de cada sugerencia desde la perspectiva OOAD, sin bloques de código ni JSON. Sé directo y asegurá que tu respuesta esté completa.',
        ].join('\n');

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
        { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000, maxTokens: 1000, onChunk: wrappedSuggestChunk }
      );
      return { replyContent: stripEmojis(suggestResult).trim() };
    } catch {
      if (suggestChunks.trim().length > 30) {
        return { replyContent: stripEmojis(suggestChunks).trim() };
      }
      return {
        replyContent: isEn
          ? 'I suggest reviewing transaction details or intermediate entities for your model.'
          : 'Te sugiero revisar si tu modelo necesita clases intermedias para transacciones (como detalles de comprobante o historiales).',
      };
    }
  }

  if (trimmedLower === '/apply' || trimmedLower.startsWith('/apply ') || trimmedLower === '/aplicar' || trimmedLower.startsWith('/aplicar ')) {
    const specificTopic = userContent.trim().replace(/^\/(?:apply|aplicar)\s*/i, '').trim();
    const lastAssistantMsg = [...(chatHistory || [])].reverse().find((m) => m.role === 'assistant');
    const recentHistory = (chatHistory || [])
      .slice(-4)
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n');
    const topic = specificTopic
      ? specificTopic
      : lastAssistantMsg
        ? `Conversación previa:\n${recentHistory}\nImplementar lo sugerido: ${lastAssistantMsg.content}`
        : 'entidades del dominio sugeridas';
    const synthesized = await synthesizeDomainModel(topic, diagramId, llm, diagram, true);
    if (synthesized && synthesized.deltas.length > 0) {
      return {
        replyContent: isEn
          ? 'I prepared the domain proposal for the suggested entities. You can preview it on the canvas and confirm to build.'
          : 'Preparé la propuesta para las entidades sugeridas. Podés ver la previsualización en el lienzo y confirmarla.',
        batchDelta: synthesized,
      };
    }
    return {
      replyContent: isEn
        ? 'Could not generate an automatic proposal for this suggestion. You can specify: /model <topic>'
        : 'No se pudo generar una propuesta automática para esta sugerencia. Podés especificar: /model <tema>',
    };
  }

  const normalized = userContent
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const isExplicitQuestion =
    /^(que|por\s*que|como\s+funciona|cual|cuales|explic|diferencia|ayuda|significa|para\s+que|what|why|how|explain)/i.test(
      normalized.replace(/^[¿?¡!\s]+/, '')
    ) || (normalized.includes('?') && !/(hace|haz|crea|agrega|arma|genera|modela|inserta|pone|pon\b)/i.test(normalized));

  const isAction =
    !isExplicitQuestion &&
    /(agreg|crea|dise[ñn]|model|conecta|generaliz|hered|implement|depend|n-ari|cambi|modific|marca|actualiz|pone|pon\b|insert|quit|borr|elimin|hace|haz|arma|genera|constru|plante|propon|levant|falt|diagrama|base de datos|sistema|dominio|aerolinea|vuelo|hotel|hospital|tienda|comercio|banco|escuela|universidad|reserva|factura|venta|alquiler|biblioteca|add|create|connect|modify|link|delete|remove|abstract|interface)/i.test(
      normalized
    );

  const systemPrompt = isEn
    ? [
        'You are Amongus, a senior software architecture tutor inside a web collaborative UML modeling tool.',
        `You are conversing with ${senderName}.`,
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
              '   RELATION INTEGRITY: If classes already exist and are connected in the canvas, DO NOT duplicate or re-add relationships between them. Only link new entities without creating redundant relationships.',
              '   Exact JSON output format required:',
              '   ```json',
              '   {',
              '     "action": "modify",',
              '     "classes": [',
              '       { "name": "Airline", "attributes": [{ "name": "name", "type": "string" }] },',
              '       { "name": "Flight", "attributes": [{ "name": "code", "type": "string" }, { "name": "capacity", "type": "int" }] }',
              '     ],',
              '     "associations": [',
              '       { "source": "Airline", "target": "Flight", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
              '     ]',
              '   }',
              '   ```',
              '   CATALOG OF SUPPORTED OPERATIONS:',
              '   - Classes: "classes": [{"name": "Animal", "attributes": [{"name": "age", "type": "int"}], "methods": [{"name": "move", "returnType": "void"}]}]',
              '   - Interfaces: "classes": [{"name": "Flyable", "isInterface": true, "methods": [{"name": "fly", "returnType": "void"}]}]',
              '   - Associations: "associations": [{"source": "Customer", "target": "Order", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]',
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
              '   INTEGRIDAD DE RELACIONES: Si dos clases ya existen y están conectadas en el lienzo (ver "RELACIONES EN EL LIENZO"), ¡NO vuelvas a crear una relación entre ellas! Solo vinculá entidades nuevas sin duplicar relaciones existentes.',
              '   Formato exacto de salida requerido:',
              '   ```json',
              '   {',
              '     "action": "modify",',
              '     "classes": [',
              '       { "name": "Aerolinea", "attributes": [{ "name": "nombre", "type": "string" }] },',
              '       { "name": "Vuelo", "attributes": [{ "name": "codigo", "type": "string" }, { "name": "capacidad", "type": "int" }] }',
              '     ],',
              '     "associations": [',
              '       { "source": "Aerolinea", "target": "Vuelo", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
              '     ]',
              '   }',
              '   ```',
              '   CATÁLOGO DE OPERACIONES:',
              '   - Clases: "classes": [{"name": "Animal", "attributes": [{"name": "edad", "type": "int"}], "methods": [{"name": "moverse", "returnType": "void"}]}]',
              '   - Interfaces: "classes": [{"name": "Volador", "isInterface": true, "methods": [{"name": "volar", "returnType": "void"}]}]',
              '   - Asociaciones: "associations": [{"source": "Cliente", "target": "Pedido", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]',
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
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory ?? []),
      { role: 'user', content: userContent },
    ];

    const raw = await llm.chat(
      messages,
      { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000, maxTokens: 800, onChunk }
    );

    // 1. Sanitizar prefijo Amongus y colapsar bucles de repetición degenerativos (ej. "de emergencia de emergencia...")
    let clean = stripEmojis(raw).replace(/^Amongus:\s*/i, '').trim();
    clean = clean.replace(/(.{4,40}?)\1{3,}/gi, '$1').trim();

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
      const batchDelta = expandSemanticDomainToDelta(parsedModel, diagramId, diagram);
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

    // 3. Si no fue propuesta o fue una explicación conversacional:
    // Purgar cualquier bloque ```json ... ``` huérfano para que el usuario nunca vea código crudo en la burbuja de chat
    clean = clean.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim();

    if (clean.length > 0) {
      return { replyContent: clean };
    }
  } catch (err) {
    console.error('Error in processUnifiedAmongusTurn:', err);
  }

  return {
    replyContent: generateAmongusContextualReply(userContent, senderName, language),
  };
}

