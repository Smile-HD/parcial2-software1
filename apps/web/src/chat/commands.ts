/**
 * Catálogo y utilidades de comandos slash (/commands) para el asistente Amongus.
 */

export interface SlashCommand {
  name: string;
  description: string;
  descriptionEn: string;
  usage: string;
  usageEn: string;
  scope: 'client' | 'server';
  category: 'general' | 'modeling' | 'quality' | 'tools';
  example?: string;
  exampleEn?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: 'Guía interactiva de comandos y ejemplos de uso',
    descriptionEn: 'Interactive command guide and usage examples',
    usage: '/help [comando]',
    usageEn: '/help [command]',
    scope: 'client',
    category: 'general',
    example: '/help model',
    exampleEn: '/help model',
  },
  {
    name: 'model',
    description: 'Genera directamente una propuesta de clases para un dominio',
    descriptionEn: 'Directly generate a class model proposal for a domain',
    usage: '/model <tema>',
    usageEn: '/model <topic>',
    scope: 'server',
    category: 'modeling',
    example: '/model aerolíneas',
    exampleEn: '/model airlines',
  },
  {
    name: 'audit',
    description: 'Audita el diagrama con principios OOAD y calidad UML',
    descriptionEn: 'Audit diagram with OOAD and UML quality principles',
    usage: '/audit',
    usageEn: '/audit',
    scope: 'server',
    category: 'quality',
    example: '/audit',
    exampleEn: '/audit',
  },
  {
    name: 'suggest',
    description: 'Sugiere las próximas entidades para completar el negocio',
    descriptionEn: 'Suggest next entities to complete the business domain',
    usage: '/suggest',
    usageEn: '/suggest',
    scope: 'server',
    category: 'modeling',
    example: '/suggest',
    exampleEn: '/suggest',
  },
  {
    name: 'reset',
    description: 'Vacía el contexto y la memoria del chat para máxima velocidad',
    descriptionEn: 'Clear chat context and memory for maximum speed',
    usage: '/reset',
    usageEn: '/reset',
    scope: 'client',
    category: 'tools',
    example: '/reset',
    exampleEn: '/reset',
  },
  {
    name: 'context',
    description: 'Muestra los tokens cargados y el semáforo de velocidad en CPU',
    descriptionEn: 'Show current context tokens and CPU speed indicator',
    usage: '/context',
    usageEn: '/context',
    scope: 'server',
    category: 'tools',
    example: '/context',
    exampleEn: '/context',
  },
  {
    name: 'clear',
    description: 'Propuesta segura para vaciar el lienzo (con confirmación)',
    descriptionEn: 'Safe proposal to clear the canvas (requires confirmation)',
    usage: '/clear',
    usageEn: '/clear',
    scope: 'client',
    category: 'tools',
    example: '/clear',
    exampleEn: '/clear',
  },
  {
    name: 'export',
    description: 'Exporta a Spring Boot JPA, Enterprise Architect XMI o imagen',
    descriptionEn: 'Export to Spring Boot JPA, Enterprise Architect XMI, or image',
    usage: '/export <spring|xmi|png>',
    usageEn: '/export <spring|xmi|png>',
    scope: 'client',
    category: 'tools',
    example: '/export spring',
    exampleEn: '/export spring',
  },
  {
    name: 'layout',
    description: 'Reorganiza visualmente las clases para evitar solapamientos',
    descriptionEn: 'Auto-arrange classes visually on the canvas',
    usage: '/layout',
    usageEn: '/layout',
    scope: 'client',
    category: 'tools',
    example: '/layout',
    exampleEn: '/layout',
  },
  {
    name: 'apply',
    description: 'Aplica y construye la propuesta activa o última sugerencia en el lienzo',
    descriptionEn: 'Apply and build the active proposal or latest suggestion on the canvas',
    usage: '/apply',
    usageEn: '/apply',
    scope: 'client',
    category: 'modeling',
    example: '/apply',
    exampleEn: '/apply',
  },
];

/**
 * Genera el reporte de estado de contexto y recomendación de velocidad en CPU.
 */
export function buildContextReport(
  historyCount: number,
  canvasClassCount: number,
  isEn: boolean = false
): string {
  const basePromptTokens = 450;
  const canvasTokens = canvasClassCount * 35;
  const historyTokens = historyCount * 65;
  const totalTokens = basePromptTokens + canvasTokens + historyTokens;

  let speedStatus: string;
  let speedDiagnosis: string;
  let recommendation: string;

  if (totalTokens < 1200) {
    speedStatus = isEn ? 'Optimal (~15 - 25 sec latency)' : 'Óptimo (~15 - 25 seg de latencia)';
    speedDiagnosis = isEn
      ? 'Context is lightweight. Ollama responds with expected agility on CPU.'
      : 'Contexto liviano. Ollama responde con agilidad esperada en CPU.';
    recommendation = isEn
      ? 'No action required. Memory is operating at top speed.'
      : 'No requiere acción. La memoria está operando a velocidad adecuada.';
  } else if (totalTokens < 2400) {
    speedStatus = isEn ? 'Moderate (~25 - 40 sec latency)' : 'Moderado (~25 - 40 seg de latencia)';
    speedDiagnosis = isEn
      ? 'Context is growing. Processing prior conversational history adds noticeable CPU time.'
      : 'El contexto está creciendo. Evaluar el historial previo agrega tiempo de CPU notable.';
    recommendation = isEn
      ? 'Consider typing /reset when starting a new design topic.'
      : 'Te sugerimos usar /reset cuando comiences un tema de diseño nuevo.';
  } else {
    speedStatus = isEn ? 'Heavy (> 45 sec latency)' : 'Pesado (> 45 seg de latencia)';
    speedDiagnosis = isEn
      ? 'High token load. Risk of server timeouts or sluggish response on CPU.'
      : 'Carga alta de tokens. Riesgo de demoras excesivas o timeouts en CPU.';
    recommendation = isEn
      ? 'Recommended action: Run /reset now to purge conversation history and restore normal speeds.'
      : 'Acción recomendada: Ejecutá /reset ahora para vaciar el historial y recuperar velocidad.';
  }

  if (isEn) {
    return [
      'Amongus Context & Speed Monitor',
      `• Estimated Total Context: ~${totalTokens} tokens`,
      `  - Base Metamodel & Tutor Prompt: ~${basePromptTokens} tokens`,
      `  - Canvas State (${canvasClassCount} classes): ~${canvasTokens} tokens`,
      `  - Chat History (${historyCount} messages): ~${historyTokens} tokens`,
      '',
      `• CPU Velocity Level: ${speedStatus}`,
      `• Diagnosis: ${speedDiagnosis}`,
      `• Advice: ${recommendation}`,
    ].join('\n');
  }

  return [
    'Monitor de Contexto y Velocidad de Amongus',
    `• Contexto Total Estimado: ~${totalTokens} tokens`,
    `  - Metamodelo base y Prompt de Arquitectura: ~${basePromptTokens} tokens`,
    `  - Estado actual del Lienzo (${canvasClassCount} clases): ~${canvasTokens} tokens`,
    `  - Historial de Chat (${historyCount} mensajes): ~${historyTokens} tokens`,
    '',
    `• Nivel de Velocidad en CPU: ${speedStatus}`,
    `• Diagnóstico: ${speedDiagnosis}`,
    `• Recomendación: ${recommendation}`,
  ].join('\n');
}

/**
 * Filtra los comandos coincidentes con el prefijo tipeado por el usuario.
 */
export function matchSlashCommands(query: string): SlashCommand[] {
  const clean = query.trim().replace(/^\//, '').toLowerCase();
  if (clean.length === 0) {
    return SLASH_COMMANDS;
  }
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().startsWith(clean) ||
      cmd.description.toLowerCase().includes(clean) ||
      cmd.descriptionEn.toLowerCase().includes(clean)
  );
}

/**
 * Formatea la tarjeta o mensaje interactivo para /help.
 */
export function buildHelpContent(commandName?: string, isEn: boolean = false): string {
  if (commandName) {
    const cmd = SLASH_COMMANDS.find((c) => c.name.toLowerCase() === commandName.toLowerCase().replace(/^\//, ''));
    if (!cmd) {
      return isEn
        ? `Unknown command '/${commandName}'. Type /help to see all available commands.`
        : `Comando desconocido '/${commandName}'. Escribí /help para ver los comandos disponibles.`;
    }
    const desc = isEn ? cmd.descriptionEn : cmd.description;
    const usage = isEn ? cmd.usageEn : cmd.usage;
    const example = isEn ? cmd.exampleEn : cmd.example;
    return isEn
      ? `Command Details: /${cmd.name}\n\nDescription: ${desc}\nUsage: ${usage}\nExample: ${example || usage}\nScope: ${cmd.scope}`
      : `Detalles del comando: /${cmd.name}\n\nDescripción: ${desc}\nUso: ${usage}\nEjemplo: ${example || usage}\nÁmbito: ${cmd.scope === 'client' ? 'Cliente (inmediato)' : 'Servidor (IA)'}`;
  }

  if (isEn) {
    const lines = [
      'Amongus Command Guide:',
      'Type / in the chat bar to trigger command autocomplete.\n',
      'AVAILABLE COMMANDS:',
      ...SLASH_COMMANDS.map((c) => `• ${c.usageEn} — ${c.descriptionEn}`),
      '\nNATURAL LANGUAGE:',
      'You can also talk to me normally: "add class Customer with id and email", "connect Order to Product", or "how should I model returns?".',
    ];
    return lines.join('\n');
  }

  const lines = [
    'Guía de Comandos de Amongus:',
    'Escribí / en la barra de chat para desplegar el autocompletado interactivo.\n',
    'COMANDOS DISPONIBLES:',
    ...SLASH_COMMANDS.map((c) => `• ${c.usage} — ${c.description}`),
    '\nLENGUAJE NATURAL:',
    'También podés hablarme con total libertad: "creá la clase Cliente con nombre y dni", "conectá Pedido con Producto" o "¿cómo modelo una devolución?".',
  ];
  return lines.join('\n');
}
