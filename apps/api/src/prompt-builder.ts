import { normalizeUmlUtterance } from '@app/adapters-ai';
import { matchCanonicalDomain } from './domain-catalog/router.js';

export interface ChatInputNormalization {
  /** Texto con sinónimos, acentos de verbos y cardinalidades estandarizadas */
  cleanContent: string;
  /** Texto normalizado NFD, sin diacríticos y en minúsculas para coincidencia léxica determinista */
  normalized: string;
}

export function normalizeChatInput(rawContent: string): ChatInputNormalization {
  const cleanContent = normalizeUmlUtterance(rawContent);
  const normalized = cleanContent
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return { cleanContent, normalized };
}

export interface IntentClassification {
  isPresenceQuery: boolean;
  isAmbiguous: boolean;
  isVagueReferent: boolean;
  isToolQuery: boolean;
  isExplicitQuestion: boolean;
  isImperativeAction: boolean;
  isAction: boolean;
  isSoftwareOrDomainQuery: boolean;
  isPhilosophicalOrOutOfDomain: boolean;
}

export function classifyTurnIntent(
  userContent: string,
  normalized: string,
  diagram?: any
): IntentClassification {
  const isPresenceQuery =
    /cu[aá]nt[ao]s?\s+(?:personas?|usuarios?|compa[ñn]eros?|miembros?|gente|conectad[ao]s?)|qui[eé]n(?:es)?\s+(?:est[aá]n?|hay)\s+(?:conectad[ao]s?|en\s+la\s+sala|en\s+el\s+diagrama|en\s+la\s+sesi[oó]n|ac[aá]|aqu[ií])|how\s+many\s+(?:users?|people|peers?|members?)|who\s+is\s+(?:connected|online|in\s+the\s+room|in\s+the\s+session)/i.test(
      normalized
    );

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

  return {
    isPresenceQuery,
    isAmbiguous,
    isVagueReferent,
    isToolQuery,
    isExplicitQuestion,
    isImperativeAction,
    isAction,
    isSoftwareOrDomainQuery,
    isPhilosophicalOrOutOfDomain,
  };
}

export interface PromptBuildOptions {
  senderName: string;
  language: 'es' | 'en';
  diagramContext: string;
  activePeersSummary?: string;
  isAction: boolean;
}

/**
 * Prompt quirúrgico de modelado (Modo Acción).
 * Elimina toda la folletería de UI (Spring Boot, XMI, notas de voz, comandos slash)
 * para concentrar el presupuesto de tokens (< 220 tokens) exclusivamente en las reglas OOAD y el JSON.
 */
export function buildActionPrompt(options: Omit<PromptBuildOptions, 'isAction'>): string {
  const { language, diagramContext } = options;
  const isEn = language === 'en';

  if (isEn) {
    return [
      'You are Amongus, a senior UML software architect.',
      'CRITICAL RULES:',
      '1. NEVER output plain text introductions, greetings, explanations, or Markdown bullet points.',
      '2. YOUR ENTIRE RESPONSE MUST START IMMEDIATELY WITH THE ```json BLOCK.',
      '3. STRICT LIMIT: Generate AT MOST 5 classes in your proposal (ideally 3 to 5 core classes). NEVER exceed 5 classes in a turn.',
      '4. OOAD DESIGN & MUTATIONS:',
      '   - Default: "aggregation": "none". Composition (existential): "composite". Aggregation: "shared".',
      '   - To mutate relation: specify source, target, and new aggregation ("composite"|"shared"|"none").',
      '   - Multiplicities: "1", "0..1", "1..*", "0..*".',
      '   - Inheritance: "generalizations": [{"subclass": "Child", "superclass": "Parent"}]. Never link child to parent.',
      '   - Mutations: use "updates" and "renames". Deletions: "deletions".',
      'Output schema:',
      '```json',
      '{',
      '  "action": "modify",',
      '  "classes": [',
      '    { "name": "Airline", "attributes": [{ "name": "name", "type": "string" }, { "name": "iataCode", "type": "string" }] }',
      '  ],',
      '  "associations": [',
      '    { "source": "Airline", "target": "Flight", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
      '  ],',
      '  "updates": {',
      '    "associations": [{ "source": "Order", "target": "OrderItem", "aggregation": "composite", "sourceMultiplicity": "1", "targetMultiplicity": "1..*" }],',
      '    "classes": [{ "name": "Vehicle", "isAbstract": true }]',
      '  },',
      '  "renames": { "classes": [{ "from": "OldName", "to": "NewName" }] },',
      '  "deletions": { "classes": ["ObsoleteClass"], "associations": [{ "source": "A", "target": "B" }] }',
      '}',
      '```',
      `CURRENT CANVAS CONTEXT:\n${diagramContext}`,
    ].join('\n');
  }

  return [
    'Sos Amongus, arquitecto senior de software UML.',
    'REGLAS CRÍTICAS DE SALIDA:',
    '1. NUNCA escribas introducciones, saludos, explicaciones ni viñetas en texto plano.',
    '2. TU RESPUESTA DEBE EMPEZAR INMEDIATAMENTE CON EL BLOQUE ```json.',
    '3. LÍMITE ESTRICTO: Generá como MÁXIMO 5 clases en la propuesta (idealmente entre 3 y 5 clases núcleo). NUNCA generes más de 5 clases en un solo turno.',
    '4. REGLAS OOAD Y MUTACIONES:',
    '   - Por defecto: "aggregation": "none". Composición (existencial): "composite". Agregación: "shared".',
    '   - Para mutar relación: declará source, target y la nueva aggregation ("composite"|"shared"|"none").',
    '   - Multiplicidades: "1", "0..1", "1..*", "0..*".',
    '   - Herencia: "generalizations": [{"subclass": "Hijo", "superclass": "Padre"}]. NUNCA asocies subclase con superclase.',
    '   - Mutaciones: usá "updates" y "renames". Eliminaciones: "deletions".',
    'Formato de salida requerido:',
    '```json',
    '{',
    '  "action": "modify",',
    '  "classes": [',
    '    { "name": "Aerolinea", "attributes": [{ "name": "nombre", "type": "string" }, { "name": "codigoIATA", "type": "string" }] }',
    '  ],',
    '  "associations": [',
    '    { "source": "Aerolinea", "target": "Vuelo", "aggregation": "none", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }',
    '  ],',
    '  "updates": {',
    '    "associations": [{ "source": "Zapato", "target": "Material", "aggregation": "composite", "sourceMultiplicity": "1", "targetMultiplicity": "1" }],',
    '    "classes": [{ "name": "Vehiculo", "isAbstract": true }]',
    '  },',
    '  "renames": { "classes": [{ "from": "ViejoNombre", "to": "NuevoNombre" }] },',
    '  "deletions": { "classes": ["ClaseObsoleta"], "associations": [{ "source": "A", "target": "B" }] }',
    '}',
    '```',
    `ESTADO ACTUAL DEL DIAGRAMA EN EL LIENZO:\n${diagramContext}`,
  ].join('\n');
}

/**
 * Prompt conversacional y pedagógico (Modo Consulta / Ayuda).
 * Se envía cuando el usuario hace preguntas teóricas, arquitectónicas o de uso de la herramienta.
 * Cero esquemas JSON crudos, enfocado en lenguaje humano y pedagógico.
 */
export function buildConversationalPrompt(options: Omit<PromptBuildOptions, 'isAction'>): string {
  const { senderName, language, diagramContext, activePeersSummary = 'solo tú' } = options;
  const isEn = language === 'en';

  if (isEn) {
    return [
      'You are Amongus, a senior software architecture tutor inside an interactive collaborative UML modeling tool.',
      `You are conversing with ${senderName}.`,
      `Active users in this room: ${activePeersSummary}.`,
      'TOOL CAPABILITIES:',
      '- Visual UML Modeling: Classes, Interfaces, Associations, Compositions, Aggregations, Generalizations, Realizations, Dependencies.',
      '- Real-time collaboration: multi-user presence and synchronization.',
      '- Top toolbar: Export Spring Boot, Export XMI 2.1, Export PNG, Import XMI, Auto-Layout (/layout).',
      '- Commands: /help, /model <topic>, /suggest, /audit, /apply, /layout, /clear, /context, /reset.',
      'CONVERSATIONAL GUIDELINES:',
      '- Answer in natural, clear, pedagogical human language explaining architectural principles and trade-offs.',
      '- STRICT: NEVER output raw JSON blocks or code tutorials in conversational mode.',
      '- NEVER say "here is the code". The user interacts with a visual diagramming canvas.',
      '- When asked about the current diagram, its context, or what the model represents: analyze the classes and relationships from CURRENT CANVAS CONTEXT and provide a clear, pedagogical overview of the business domain, key entities, and how they interact.',
      `CURRENT CANVAS CONTEXT:\n${diagramContext}`,
    ].join('\n');
  }

  return [
    'Sos Amongus, tutor senior de arquitectura de software en un editor colaborativo UML.',
    `Estás conversando con ${senderName}.`,
    `Usuarios conectados en esta sala: ${activePeersSummary}.`,
    'CAPACIDADES DEL EDITOR:',
    '- Modelado UML en vivo: Clases, Interfaces, Asociaciones, Composiciones, Agregaciones, Generalizaciones, Realizaciones y Dependencias.',
    '- Colaboración en tiempo real: presencia multiusuario y sincronización.',
    '- Barra superior: Exportar Spring Boot (JPA), Exportar XMI 2.1, Exportar PNG, Importar XMI, Auto-Layout (/layout).',
    '- Comandos slash: /help, /model <tema>, /suggest, /audit, /apply, /layout, /clear, /context, /reset.',
    'PAUTAS DE RESPUESTA:',
    '- Respondé siempre en lenguaje natural humano, claro y pedagógico como arquitecto de software.',
    '- ESTRICTO: NUNCA incluyas bloques de código ni JSON crudo en tus respuestas conversacionales.',
    '- NUNCA digas "aquí tienes el código" o "acá tenés el código". El usuario interactúa con un lienzo visual.',
    '- Cuando te pregunten sobre el diagrama actual, su contexto o de qué trata el modelo: analizá las clases y relaciones de ESTADO ACTUAL DEL DIAGRAMA EN EL LIENZO y explicá con claridad pedagógica el dominio de negocio modelado, sus entidades clave y cómo colaboran.',
    `ESTADO ACTUAL DEL DIAGRAMA EN EL LIENZO:\n${diagramContext}`,
  ].join('\n');
}

/**
 * Resuelve el System Prompt óptimo según la intención (acción vs conversación).
 */
export function resolveSystemPrompt(options: PromptBuildOptions): string {
  if (options.isAction) {
    return buildActionPrompt(options);
  }
  return buildConversationalPrompt(options);
}

