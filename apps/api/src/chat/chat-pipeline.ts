/**
 * Orquestador del turno unificado de conversación con Amongus (processUnifiedAmongusTurn).
 * Gestiona guardrails, detección de intenciones, llamadas al LLM y generación de deltas.
 */
import type { BatchDelta } from '@app/core';
import {
  robustParseDomainJson,
  expandSemanticDomainToDelta,
  synthesizeDomainModel,
  canonicalToSemantic,
  extractExplicitModelMutations,
} from '../synthesis/index.js';
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
import {
  breakDegenerativeLoops,
  isChimeraClassName,
  pruneSuggestionsToMax3,
  generateAmongusReply,
  generateAmongusContextualReply,
  summarizeDiagramForPrompt,
  stripEmojis,
} from './prompt-formatter.js';
import { DEFAULT_LLM_MAX_TOKENS, DEFAULT_LLM_TIMEOUT_MS } from './chat-constants.js';

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
        const suggestion = isEn
          ? ` If you want to create a new class, use 'create class <Name>'.`
          : ` Si querés crear una nueva clase, podés pedirme "creá la clase <Nombre>".`;
        return {
          replyContent: isEn
            ? `I could not find the class ${missingEn} in the current diagram. Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.${suggestion}`
            : `No encontré la clase ${missing} en el diagrama actual. Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.${suggestion}`,
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

  // 0b1. Guardián de Dominio y Anti-Jailbreak (0 ms, 0 tokens)
  const chatGuard = evaluateChatGuard(userContent, diagram, language);
  if (chatGuard.blocked && chatGuard.replyContent) {
    return {
      replyContent: chatGuard.replyContent,
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
    /^(?:por\s+favor\s+)?(?:implement[aá]r?|aplic[aá]r?|constru[yí]r?|arm[aá]r?)\b/i.test(trimmedLower) ||
    /^(?:por\s+favor\s+)?cre[aá]r?\s+(?:las?\s+sugerencias?|lo\s+sugerido|lo\s+que\s+(?:me\s+)?sugeriste|las?\s+clases?\s+sugeridas?)/i.test(trimmedLower);

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

  // 00d. Si el usuario solicita una mutación puntual o creación determinista de clase/relación/atributo
  // resolverla de forma 100% determinista e inmediata ANTES de llamar al LLM.
  // Esto previene que el LLM alucine clases o relaciones viejas en turnos de edición de grafo.
  if (diagram) {
    const explicitMutation = extractExplicitModelMutations(cleanContent, diagram);
    if (explicitMutation) {
      const mutationDelta = expandSemanticDomainToDelta(explicitMutation, diagramId, diagram, cleanContent);
      if (mutationDelta && mutationDelta.deltas.length > 0) {
        let defaultReply = isEn
          ? 'I have prepared the proposal for this change. You can preview the updated elements on the canvas and confirm to apply.'
          : 'Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que se aplique en vivo.';
        const hasUnlink = mutationDelta.deltas.some((d: any) => d.kind === 'association' && (d as any).newAssociationClassId === null);
        const hasClassCreate = mutationDelta.deltas.some((d: any) => d.kind === 'class' && d.op === 'create');
        if (hasUnlink) {
          defaultReply = isEn
            ? 'I have prepared the proposal to unlink the association class. The relationship and classes remain intact on the canvas.'
            : 'Preparé la propuesta para desvincular la clase de asociación. La relación base y las clases se conservan intactas en el lienzo.';
        } else if (hasClassCreate) {
          defaultReply = isEn
            ? 'I have prepared the proposal for this change. You can preview it on the canvas and confirm to apply.'
            : 'Preparé la propuesta para este cambio. Podés ver la previsualización en el lienzo y confirmarla para que la construya en vivo.';
        }
        return {
          replyContent: defaultReply,
          batchDelta: mutationDelta,
        };
      }
      if (explicitMutation.deletions && Array.isArray(explicitMutation.deletions.attributes) && explicitMutation.deletions.attributes.length === 0) {
        return {
          replyContent: isEn
            ? 'The requested attribute does not exist in the diagram, so no changes were made.'
            : 'El atributo solicitado no existe en el diagrama, por lo que no se realizaron modificaciones.',
        };
      }
    }
  }

  // 00e. Sanitizador NLP de intenciones atómicas: Si el usuario solicitó una mutación puntual
  // pero el extractor rápido no lo cazó de primera por lenguaje coloquial o complejo, consultar al LLM
  // con un prompt estricto de traducción a AST para que devuelva ÚNICAMENTE el JSON atómico, evitando síntesis completa.
  if (diagram && diagram.classes && diagram.classes.length > 0 && isAction && llm && typeof llm.chat === 'function') {
    const isMutationColloquial =
      /(?:cambi|modific|pon|sac|borr|elimin|renombr|pas|ajust|hered|generaliz|conect|relacion|multiplicidad|rol|campo|atributo|tipo|m[eé]todo|operaci|funci|method|function)/i.test(cleanContent);
    if (isMutationColloquial) {
      try {
        const nlpMessages: Array<{ role: 'system' | 'user'; content: string }> = [
          {
            role: 'system',
            content: [
              'Sos un parser de lenguaje natural a operaciones UML sobre el diagrama actual.',
              `ESTADO ACTUAL DEL DIAGRAMA:\n${diagramContext}`,
              'INSTRUCCIÓN:',
              'Traducí la petición del usuario a la mutación atómica en formato JSON estructurado dentro de ```json ```.',
              'Formato esperado:',
              '```json',
              '{',
              '  "action": "modify",',
              '  "updates": {',
              '    "associations": [{ "source": "A", "target": "B", "sourceMultiplicity": "1", "targetMultiplicity": "1..*", "aggregation": "composite"|"shared"|"none", "sourceRole": "rol", "targetRole": "rol" }],',
              '    "attributes": [{ "class": "Clase", "name": "attr", "type": "int"|"string"|"date"|"boolean"|"float", "newName": "nuevo" }],',
              '    "methods": [{ "class": "Clase", "name": "calcular", "returnType": "float", "parameters": [{ "name": "x", "type": "int" }] }],',
              '    "classes": [{ "name": "Clase", "isAbstract": true, "classKind": "class"|"interface" }]',
              '  },',
              '  "classes": [{ "name": "Clase", "methods": [{ "name": "calcular", "returnType": "float", "parameters": [{ "name": "x", "type": "int" }] }] }],',
              '  "generalizations": [{ "subclass": "Sub", "superclass": "Super" }],',
              '  "renames": { "classes": [{ "from": "Viejo", "to": "Nuevo" }], "methods": [{ "class": "C", "from": "viejo", "to": "nuevo" }] },',
              '  "deletions": { "classes": ["X"], "associations": [{"source": "A", "target": "B"}], "attributes": [{"class": "C", "attribute": "a"}], "methods": [{"class": "C", "method": "m"}] }',
              '}',
              '```',
              'REGLAS CRÍTICAS: NUNCA generes clases ni atributos nuevos que no existan en el diagrama a menos que el usuario lo pida explícitamente.',
            ].join('\n'),
          },
          { role: 'user', content: cleanContent },
        ];
        const rawJson = await llm.chat(nlpMessages, { timeoutMs: 12000, maxTokens: 400 });
        const parsedNlpModel = robustParseDomainJson(rawJson);
        if (parsedNlpModel && (parsedNlpModel.updates || parsedNlpModel.generalizations || parsedNlpModel.renames || parsedNlpModel.deletions || parsedNlpModel.associations || parsedNlpModel.classes)) {
          const nlpDelta = expandSemanticDomainToDelta(parsedNlpModel, diagramId, diagram, cleanContent);
          if (nlpDelta && nlpDelta.deltas.length > 0) {
            const defaultReply = isEn
              ? 'I have prepared the proposal for this change. You can preview the updated elements on the canvas and confirm to apply.'
              : 'Preparé la propuesta para este cambio. Podés previsualizar la relación en el lienzo y confirmarla para que se actualice en vivo.';
            return {
              replyContent: defaultReply,
              batchDelta: nlpDelta,
            };
          }
        }
      } catch {}
    }
  }

  if (!llm || typeof llm.chat !== 'function') {
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
      const explicitMutation = extractExplicitModelMutations(cleanContent, diagram);
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

      // 2b.2 Síntesis resiliente: SOLO para creación/modelado de dominios completos desde cero.
      // NUNCA disparar synthesizeDomainModel con historial completo si el turno es de mutación puntual (relación, atributo, borrado, renombrado),
      // ya que eso causa que el LLM regenere todas las entidades del chat previo y alucine cambios no solicitados.
      const isMutationIntent =
        /(?:cambi|modific|elimin|borr|sac[aá]|quit[aá]|renombr|pas[aá]|convert|turn|change|rename|delete|remove|hace\s+que|hac[eé]\s+que|ponele|agreg[aáeé]|a[ñn]ad[eé]|sum[aá]|insert)\b/i.test(
          cleanContent
        ) ||
        /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|multiplicidad)/i.test(
          cleanContent
        );

      const isExplicitModelingRequest =
        !isMutationIntent &&
        /(?:model|dise[ñn]|arm[aá]|gener[aá]|constru[yí]|sistema|dominio|aerolinea|hospital|banco|tienda|comercio|universidad|biblioteca|factur|cre[aá]\s+un\s+modelo)/i.test(
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

