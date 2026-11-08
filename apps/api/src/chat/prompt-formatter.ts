/**
 * Formateo y sanitización de prompts y contexto de diagramas para el modelo de lenguaje.
 */
import { DEFAULT_LLM_MAX_TOKENS, DEFAULT_LLM_TIMEOUT_MS } from './chat-constants.js';
import { matchCanonicalDomain } from '../synthesis/domain-catalog/router.js';

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

  const formatSection = (header: string, content: string | string[] | undefined | null): string | null => {
    if (!content) return null;
    if (Array.isArray(content)) {
      return content.length > 0 ? `${header}:\n${content.join('\n')}` : null;
    }
    const trimmed = String(content).trim();
    return trimmed.length > 0 ? `${header}:\n${trimmed}` : null;
  };

  const sections = [
    `CLASES EN EL LIENZO:\n${classesStr}`,
    `RELACIONES EN EL LIENZO:\n${associations || 'Ninguna asociacion directa.'}`,
  ];
  const genSec = formatSection('HERENCIAS (GENERALIZACIONES)', generalizations);
  if (genSec) sections.push(genSec);
  const realSec = formatSection('REALIZACIONES (INTERFACES)', realizations);
  if (realSec) sections.push(realSec);
  const depSec = formatSection('DEPENDENCIAS', dependencies);
  if (depSec) sections.push(depSec);

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

