/**
 * Guardrails e interceptores tempranos de intención para Amongus.
 * Ejecuta validaciones de 0 ms / 0 tokens antes de llamar a modelos de lenguaje:
 * - Ruido léxico y contradicciones
 * - Validaciones de entidades faltantes (borrado/mutación)
 * - Consultas de presencia en la sala
 * - Ambigüedades y filtros de guardián de dominio
 * - Consultas factuales del lienzo y preguntas teóricas UML
 * - Relaciones reflexivas directas
 */
import type { BatchDelta } from '@app/core';
import { detectContradiction } from '@app/adapters-ai';
import { resolveDiagramFactualQuery } from '../../diagram-query-resolver.js';
import { evaluateChatGuard } from '../chat-guard.js';
import { matchCanonicalDomain } from '../../synthesis/domain-catalog/router.js';
import type { UnifiedTurnResult } from '../chat-pipeline.js';

export interface GuardrailCheckParams {
  userContent: string;
  cleanContent: string;
  normalized: string;
  senderName: string;
  language: 'es' | 'en';
  diagram?: any;
  peerUsers?: readonly string[];
}

export type GuardrailOutcome =
  | { handled: true; result: UnifiedTurnResult }
  | { handled: false; isAction: boolean; diagramContext: string };

export function checkIntentGuardrails(params: GuardrailCheckParams): GuardrailOutcome {
  const { userContent, cleanContent, normalized, senderName, language, diagram, peerUsers } = params;
  const isEn = language === 'en';

  // 00a. Guardrail de entrada: descartar ruido léxico, símbolos puros o números sin texto (0 ms, 0 tokens)
  const rawClean = cleanContent.trim();
  const letterCount = (rawClean.match(/[\p{L}]/gu) || []).length;
  if (letterCount < 2) {
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `I didn't understand your message, ${senderName}. You can ask architectural questions, request UML modeling actions (e.g. 'create class User'), or use commands like /help, /model, or /suggest.`
          : `No entendí tu mensaje, ${senderName}. Podés hacerme consultas de arquitectura, pedirme cambios en el diagrama (ej. "creá la clase Usuario") o usar comandos como /help, /model o /suggest.`,
      },
    };
  }

  // 00a2. Detección temprana de comandos contradictorios (crear y borrar la misma clase a la vez)
  const contradiction = detectContradiction(cleanContent);
  if (contradiction.contradictory && contradiction.className) {
    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `Contradictory request detected: you asked to both create and delete the class "${contradiction.className}" in the same message. Please clarify which action you want to perform.`
          : `Detecté una solicitud contradictoria: estás pidiendo crear y eliminar la clase "${contradiction.className}" en el mismo mensaje. Por favor indicá cuál de las dos acciones preferís realizar.`,
      },
    };
  }

  // 00b. Detección temprana de borrado de clase inexistente
  const deleteClassMatch = /\b(?:delete|remove|elimina|eliminá|eliminar|elmina|borra|borrá|borrar|brra|sacar|sacá|saca)\b[\s\S]*?\b(?:class|clase|calse|clse|tabla|table|entidad)\s+(?:llamada\s+|llamado\s+|llamda\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(userContent);
  if (deleteClassMatch) {
    const rawTarget = deleteClassMatch[1]!;
    const STOP_WORDS = new Set(['que', 'de', 'la', 'el', 'un', 'una', 'los', 'las', 'cualquier', 'cada', 'that', 'which', 'the', 'a', 'an', 'any', 'every']);
    const existingClassNames = ((diagram?.classes as any[]) || []).map((c: any) => c.name);

    if (STOP_WORDS.has(rawTarget.toLowerCase())) {
      if (/(?:que\s+no\s+existe|that\s+does\s+not\s+exist)/i.test(userContent)) {
        return {
          handled: true,
          result: {
            replyContent: isEn
              ? `No valid class was specified for deletion. If you want to delete a class, specify its name (e.g. 'delete class User'). Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`
              : `No se especificó ninguna clase válida para eliminar. Si querés borrar una clase, indicá su nombre exacto (ej. "borrá la clase Usuario"). Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`,
          },
        };
      }
    } else {
      const exists = existingClassNames.some((n: string) => n.toLowerCase() === rawTarget.toLowerCase());
      if (!exists && existingClassNames.length > 0) {
        return {
          handled: true,
          result: {
            replyContent: isEn
              ? `The class "${rawTarget}" does not exist in the current diagram. Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`
              : `La clase "${rawTarget}" no existe en el diagrama actual. Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.`,
          },
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
          handled: true,
          result: {
            replyContent: isEn
              ? `I could not find the class ${missingEn} in the current diagram. Available classes: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.${suggestion}`
              : `No encontré la clase ${missing} en el diagrama actual. Las clases disponibles son: ${existingClassNames.map((n: string) => `"${n}"`).join(', ')}.${suggestion}`,
          },
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

    return {
      handled: true,
      result: {
        replyContent: isEn
          ? count === 1
            ? `Currently you are the only one connected in this room (${senderName}). You can share the diagram URL to collaborate with others in real time.`
            : `Currently there are ${count} people connected in this room: ${namesList}. (You are connected as ${senderName}).`
          : count === 1
            ? `Actualmente sos el único conectado en esta sala (${senderName}). Podés compartir el enlace del diagrama para colaborar en tiempo real.`
            : `Actualmente hay ${count} personas conectadas en esta sala: ${namesList}. (Vos estás conectado como ${senderName}).`,
      },
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
        handled: true,
        result: {
          replyContent: isEn
            ? `Which class would you like to modify, ${senderName}? Classes on canvas: ${existingClasses}. Please tell me the specific class name and what attributes or methods to add.`
            : `¿A cuál de las clases querés agregarle cosas, ${senderName}? En el lienzo tenés: ${existingClasses}. Por favor indicame el nombre de la clase y qué atributos o métodos querés sumarle.`,
        },
      };
    }

    return {
      handled: true,
      result: {
        replyContent: isEn
          ? `What domain or specific entities would you like to model, ${senderName}? Please tell me which classes and attributes to include or type '/model <topic>' (e.g. /model library or /model airline) so I can prepare an exact proposal on the canvas.`
          : `¿Qué entidades o dominio te gustaría modelar, ${senderName}? Podés decirme qué clases y atributos querés incluir o escribir '/model <tema>' (ej. /model biblioteca o /model aerolinea) para que arme la propuesta exacta en el lienzo.`,
      },
    };
  }

  // 0b1. Guardián de Dominio y Anti-Jailbreak (0 ms, 0 tokens)
  const chatGuard = evaluateChatGuard(userContent, diagram, language);
  if (chatGuard.blocked && chatGuard.replyContent) {
    return {
      handled: true,
      result: {
        replyContent: chatGuard.replyContent,
      },
    };
  }

  // 0c. Inspección factual determinista del estado del lienzo (0 ms, 0% alucinación)
  const factualReply = resolveDiagramFactualQuery(userContent, diagram, language);
  if (factualReply) {
    return {
      handled: true,
      result: {
        replyContent: factualReply,
      },
    };
  }

  // 0c1. Interceptor de preguntas teóricas de modelado UML y OOAD
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
      handled: true,
      result: {
        replyContent: theoreticalReply,
      },
    };
  }

  // 0c2. Interceptor de relaciones reflexivas explícitas sobre clases existentes
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

      const batch: BatchDelta = {
        kind: 'batch',
        baseVersion: diagram.version ?? 0,
        deltas: [assocDelta],
      };

      return {
        handled: true,
        result: {
          replyContent: isEn
            ? `Added a reflexive relationship to class "${targetClass.name}". You can preview it on the canvas and confirm to apply.`
            : `Preparé la relación reflexiva sobre la clase "${targetClass.name}". Podés previsualizarla en el lienzo y confirmarla para aplicarla.`,
          batchDelta: batch,
        },
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
      handled: true,
      result: {
        replyContent: isEn
          ? `As a software architecture and UML tutor, my specialty is helping you design, structure, and audit software systems (classes, relationships, OOAD patterns, and Spring Boot generation). Is there a software domain or diagram concept you would like to explore?`
          : `Como tutor de arquitectura y diseño UML, mi especialidad es ayudarte a diseñar, estructurar y auditar sistemas de software (clases, relaciones, principios OOAD y generación a Spring Boot). ¿Hay algún sistema o concepto de software que quieras que modelemos o analicemos?`,
      },
    };
  }

  return {
    handled: false,
    isAction,
    diagramContext: '',
  };
}
