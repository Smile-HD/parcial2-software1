/**
 * Guardián de Dominio y Anti-Jailbreak para el chat de Amongus.
 * 
 * Responsabilidades:
 * 1. Interceptar intentos de prompt injection / jailbreak ("olvida tus instrucciones", "act as", etc.)
 *    y rechazarlos de forma inmediata (0 llamadas al LLM, 0 ms, 0 tokens quemados).
 * 2. Bloquear consultas completamente ajenas al modelado de software (recetas, poemas, historias, política)
 *    para proteger la cuota de inferencia y evitar alucinaciones.
 * 3. Proteger consultas pedagógicas legítimas (ejemplos de conceptos UML/OOAD) para que reciban
 *    orientación educativa sin ensuciar el lienzo con deltas automáticos a menos que se pida explícitamente.
 */

export interface GuardEvaluation {
  /** Indica si la consulta fue interceptada y debe devolverse una respuesta inmediata */
  blocked: boolean;
  /** Contenido de respuesta inmediata si blocked es true */
  replyContent?: string;
  /** Si es una pregunta pedagógica de ejemplo (ej. "dame un ejemplo de clase de asociacion") */
  isPedagogicalExample?: boolean;
  /** Si el usuario pidió explícitamente ver el ejemplo dibujado en el lienzo */
  wantsCanvasPreview?: boolean;
}

export function evaluateChatGuard(
  userQuery: string,
  diagram?: any,
  language: 'es' | 'en' = 'es'
): GuardEvaluation {
  const text = (userQuery || '').trim();
  if (!text) return { blocked: false };

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const isEn = language === 'en' || /\b(?:how|what|why|show|give|explain)\b/i.test(text);

  // 1. Detección de Intentos de Jailbreak / Prompt Injection
  const isJailbreak =
    /(?:ignora|olvida|descart[aá])\s+(?:todas\s+)?(?:las\s+|tus\s+)?(?:instrucciones|reglas|directrices|prompts?)/i.test(normalized) ||
    /(?:ignore|forget|discard)\s+(?:all\s+)?(?:previous\s+|your\s+)?(?:instructions|rules|system\s+prompt|guidelines)/i.test(normalized) ||
    /(?:act[uú]a\s+como|hacete\s+pasar\s+por|fing[eé]\s+que\s+sos|comportate\s+como)\s+(?!un\s+(?:tutor|arquitecto|dise[ñn]ador|profesor)\b)/i.test(normalized) ||
    /(?:act\s+as|pretend\s+(?:to\s+be|you\s+are)|you\s+are\s+now)\s+(?!a\s+(?:tutor|software\s+architect|designer)\b)/i.test(normalized) ||
    /\b(?:dan\s+mode|jailbreak|developer\s+mode\s+enabled|modo\s+desarrollador|bypass\s+rules|rompe\s+las\s+reglas)\b/i.test(normalized) ||
    /(?:dame|mostra(?:me)?|repite|imprime|reveal|print|repeat)\s+(?:el|tu|the|your)?\s*(?:system\s+prompt|prompt\s+del\s+sistema|instrucciones\s+ocultas)/i.test(normalized);

  if (isJailbreak) {
    const refusal = isEn
      ? 'As a software architecture and UML tutor, my operating rules are strictly defined to help you design, audit, and generate software systems. I cannot modify my system instructions, ignore guidelines, or simulate unrelated personas. How can I assist you with your class diagram or software architecture?'
      : 'Como tutor de arquitectura de software y diseño UML, mis reglas operativas están estrictamente enfocadas en guiarte a modelar, auditar y generar sistemas de software. No tengo permitido ignorar mis directrices ni adoptar roles ajenos a la ingeniería de software. ¿Qué modelo o concepto arquitectónico querés que trabajemos?';
    return {
      blocked: true,
      replyContent: refusal,
    };
  }

  // 2. Detección de Pedidos Pedagógicos de Ejemplos sobre UML / OOAD
  const isExampleRequest =
    /(?:dame|mostra(?:me)?|da|pasame|escribime|give|show|provide)?\s*(?:un\s+|unos\s+|an?\s+)?(?:ejemplos?|examples?)\s+(?:de|sobre|para|of|about)\s+/i.test(normalized) ||
    /(?:c[oó]mo\s+ser[ií]a\s+un\s+ejemplo|what\s+would\s+be\s+an\s+example)/i.test(normalized);

  const wantsCanvasPreview =
    /(?:en\s+el\s+lienzo|en\s+el\s+canvas|dibuj[aá]|mostr[aá]melo\s+en\s+el\s+lienzo|ponelo\s+en\s+el\s+lienzo|on\s+canvas|draw\s+it)/i.test(normalized);

  const umlDomainKeywords =
    /(?:uml|clase|asociaci[oó]n|composici[oó]n|agregaci[oó]n|generalizaci[oó]n|herencia|interfaz|realizaci[oó]n|dependencia|n-aria|ternaria|asociaci[oó]n\s+n-aria|clase\s+de\s+asociaci[oó]n|multiplicidad|cardinalidad|patr[oó]n|ooad|spring|entidad)/i;

  if (isExampleRequest && umlDomainKeywords.test(normalized)) {
    // Si es un ejemplo de clase de asociación
    if (/(?:clase\s+de\s+asociaci[oó]n|association\s+class)/i.test(normalized)) {
      if (!wantsCanvasPreview) {
        const reply = isEn
          ? `**Association Class Concept & Example**:

An **Association Class** models properties or behaviors that belong strictly to the *relationship* between two entities, rather than either entity alone.

• **Classic Example**: \`Student\` (Estudiante) and \`Course\` (Curso).
• A student can take many courses, and a course has many students ($M:N$).
• Where does the \`grade\` (calificación) or \`enrollmentDate\` (fechaInscripción) belong?
  - Not in \`Student\` (a student has multiple grades, one per course).
  - Not in \`Course\` (a course has multiple grades, one per student).
  - It belongs to the link between them: the association class **\`Enrollment\`** (Matrícula).

💡 *If you want me to draw this example on the canvas so you can inspect it, ask: "dibujame el ejemplo de clase de asociacion en el lienzo".*`
          : `**Concepto y Ejemplo de Clase de Asociación**:

Una **Clase de Asociación** modela atributos o métodos que pertenecen intrínsecamente al *vínculo* entre dos clases, y no a ninguna de ellas por separado.

• **Ejemplo clásico**: \`Estudiante\` y \`Curso\` (relación muchos a muchos).
• ¿Dónde vive la \`calificacion\` o la \`fechaInscripcion\`?
  - No en \`Estudiante\` (un estudiante tiene distintas notas según el curso).
  - No en \`Curso\` (un curso tiene distintas notas según cada alumno).
  - Pertenece a la relación: la clase de asociación **\`Matricula\`** (o \`EstudianteCurso\`), con atributos como \`calificacion: float\` y \`fechaInscripcion: date\`.

💡 *Si querés ver este ejemplo dibujado en el lienzo para previsualizarlo, pedime: "dibujame el ejemplo de clase de asociación en el lienzo".*`;

        return {
          blocked: true,
          replyContent: reply,
          isPedagogicalExample: true,
          wantsCanvasPreview: false,
        };
      } else {
        return {
          blocked: false,
          isPedagogicalExample: true,
          wantsCanvasPreview: true,
        };
      }
    }

    // Si es un ejemplo de relación N-aria
    if (/(?:n-aria|ternaria|nary|ternary)/i.test(normalized)) {
      if (!wantsCanvasPreview) {
        const reply = isEn
          ? `**N-ary (Ternary) Association Concept & Example**:

An **N-ary Association** links 3 or more classes simultaneously through a central diamond centroid. It is used when an atomic action requires the co-presence of all three entities and cannot be decomposed into independent binary pairs without losing meaning.

• **Classic Example**: \`Doctor\` (Médico), \`Patient\` (Paciente) and \`TreatmentRoom\` (Consultorio/Sala).
• An appointment requires a specific doctor attending a specific patient in a specific room at that time.
• In UML, it is drawn with a central diamond connecting all three classes with their respective multiplicities.

💡 *If you want me to draw this example on the canvas so you can inspect it, ask: "dibujame el ejemplo de asociacion n-aria en el lienzo".*`
          : `**Concepto y Ejemplo de Asociación N-aria (Ternaria)**:

Una **Asociación N-aria** vincula simultáneamente 3 o más clases a través de un rombo central. Se utiliza cuando una acción atómica del dominio requiere la co-presencia de las tres entidades y no puede descomponerse en pares binarios independientes sin perder el significado.

• **Ejemplo clásico**: \`Medico\`, \`Paciente\` y \`Consultorio\` (o \`Turno\`).
• Un turno médico representa que un médico específico atiende a un paciente específico en un consultorio asignado.
• En UML, se representa con un rombo centroide conectado a las tres clases con sus multiplicidades respectivas.

💡 *Si querés ver este ejemplo dibujado en el lienzo para previsualizarlo, pedime: "dibujame el ejemplo de asociación n-aria en el lienzo".*`;

        return {
          blocked: true,
          replyContent: reply,
          isPedagogicalExample: true,
          wantsCanvasPreview: false,
        };
      } else {
        return {
          blocked: false,
          isPedagogicalExample: true,
          wantsCanvasPreview: true,
        };
      }
    }
  }

  // 3. Filtro Estricto de Temas Ajenos (Out of Domain: recetas, poemas, política, chistes)
  const isOutOfDomainStrict =
    /(?:receta|torta|cocin[aá]|pastel|pizza|asado|comida|postre|ingredientes\s+para)/i.test(normalized) ||
    /(?:poema|poes[ií]a|canci[oó]n|rimas?|estrofa|cancion)/i.test(normalized) ||
    /(?:chiste|broma|cuento|historieta|adivinanza)/i.test(normalized) ||
    /(?:qui[eé]n\s+(?:es|fue)\s+(?:messi|maradona|cristiano|ronaldo|shakira|bad\s+bunny|el\s+presidente))/i.test(normalized) ||
    /(?:qui[eé]n\s+gan[oó]\s+(?:el\s+mundial|la\s+copa|el\s+partido|las\s+elecciones))/i.test(normalized) ||
    /(?:qu[eé]\s+opinas?\s+(?:de\s+la\s+vida|de\s+dios|de\s+pol[ií]tica|del\s+amor|del\s+aborto|de\s+religi[oó]n))/i.test(normalized) ||
    /(?:how\s+to\s+cook|recipe\s+for|bake\s+a\s+cake|write\s+a\s+poem|tell\s+me\s+a\s+joke|who\s+won\s+the\s+world\s+cup)/i.test(normalized);

  // Comprobar si el texto contiene alguna clase ya existente en el diagrama
  const hasExistingDiagramClass =
    Array.isArray(diagram?.classes) &&
    diagram.classes.some((c: any) => c.name && normalized.includes(c.name.toLowerCase()));

  if (isOutOfDomainStrict && !hasExistingDiagramClass) {
    const outOfDomainReply = isEn
      ? 'As a software architecture and UML design tutor, I am dedicated exclusively to software modeling, OOAD principles, and diagram operations. I cannot answer queries about cooking, poetry, general entertainment, or politics to avoid consuming inference resources. How can I help you with your software system design?'
      : 'Como tutor de arquitectura y diseño UML, mi propósito exclusivo es ayudarte a diseñar, auditar y modelar sistemas de software (clases, relaciones, principios OOAD y código). No tengo permitido responder consultas sobre cocina, poesía, entretenimiento general o política para preservar los recursos de cómputo del sistema. ¿Qué sistema o diagrama de software te gustaría que diseñemos?';
    return {
      blocked: true,
      replyContent: outOfDomainReply,
    };
  }

  // 4. Invariantes Semánticas OOAD para Clases de Asociación y Asociaciones N-Arias
  if (diagram && Array.isArray(diagram.classes) && Array.isArray(diagram.associations)) {
    const diagClasses: Array<{ id: string; name: string }> = diagram.classes;
    const diagAssocs: Array<any> = diagram.associations;

    // 4a. Conexión inválida con su propia clase de asociación (E1)
    // En UML, una clase de asociación modela el vínculo entre dos entidades participantes.
    // Conectarla directamente con uno de sus extremos participantes es un error semántico.
    const isConnectIntent =
      /(?:asoci|conect|relacion|link|crea.*?asociaci|agrega.*?asociaci|une|junta|connect|associate)/i.test(normalized) &&
      !/(?:desvincul|quit|elimin|remover|sac)/i.test(normalized);

    if (isConnectIntent) {
      const mentionedClasses = diagClasses.filter((c) => {
        const cNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const regex = new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i');
        return regex.test(normalized);
      });

      if (mentionedClasses.length >= 2) {
        const c1 = mentionedClasses[0]!;
        const c2 = mentionedClasses[1]!;

        // Verificar si c1 es clase de asociación de c2, o viceversa
        const assocWhereC1IsIntermediary = diagAssocs.find(
          (a) => a.associationClassId === c1.id && (a.sourceClassId === c2.id || a.targetClassId === c2.id)
        );
        const assocWhereC2IsIntermediary = diagAssocs.find(
          (a) => a.associationClassId === c2.id && (a.sourceClassId === c1.id || a.targetClassId === c1.id)
        );

        const violatingAssoc = assocWhereC1IsIntermediary || assocWhereC2IsIntermediary;
        if (violatingAssoc) {
          const assocClass = assocWhereC1IsIntermediary ? c1 : c2;
          const participantClass = assocWhereC1IsIntermediary ? c2 : c1;
          const otherParticipantId =
            violatingAssoc.sourceClassId === participantClass.id
              ? violatingAssoc.targetClassId
              : violatingAssoc.sourceClassId;
          const otherParticipant =
            diagClasses.find((c) => c.id === otherParticipantId)?.name || 'su clase asociada';

          const refusal = isEn
            ? `In UML 2.5, class '${assocClass.name}' is already the association class linking '${participantClass.name}' and '${otherParticipant}'. An association class models the attributes and lifecycle of the relationship itself, so it must not be directly connected with its participant endpoints.`
            : `En UML 2.5, la clase '${assocClass.name}' ya es la clase de asociación que vincula '${participantClass.name}' y '${otherParticipant}'. Una clase de asociación modela la relación en sí misma y no debe conectarse directamente con sus extremos participantes para evitar ciclos y enlaces parásitos.`;

          return {
            blocked: true,
            replyContent: refusal,
          };
        }
      }
    }

    // 4b. Validación de Asociación N-Aria (requiere >= 3 clases) (E5)
    const isNaryCreate =
      /(?:n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized) &&
      /(?:cre[aáeé]|agreg[aáeé]|a[ñn]ad[eé]|pon[eé]|conect[aáeé]|arm[aáeé]|hac[eé]|haz)/i.test(normalized);

    if (isNaryCreate) {
      const mentionedClasses = diagClasses.filter((c) => {
        const cNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const regex = new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i');
        return regex.test(normalized);
      });

      if (mentionedClasses.length < 3) {
        const refusal = isEn
          ? `An n-ary (or ternary) association connects 3 or more classes simultaneously through a central diamond. If you only want to connect 2 classes, you should use a standard binary association. Please specify at least 3 classes to create an n-ary association.`
          : `Una asociación n-aria (o ternaria) vincula simultáneamente 3 o más clases a través de un rombo central. Si querés conectar solo 2 clases, en UML corresponde utilizar una asociación binaria común. Para armar una asociación n-aria, por favor especificá al menos 3 clases participantes.`;

        return {
          blocked: true,
          replyContent: refusal,
        };
      }
    }

    // 4c. Validación de Clase de Asociación con clases inexistentes en el lienzo (E6)
    const isAssocClassIntent =
      /(?:clase\s+de\s+asociaci[oó]n|association\s+class)/i.test(normalized) &&
      /(?:agreg[aáeé]|a[ñn]ad[eé]|cre[aáeé]|pon[eé]?|sum[aá]|add|insert|asoci[aáeé]|asign[aáeé]|convert)/i.test(normalized);

    if (isAssocClassIntent) {
      const betweenMatch = /(?:entre|between)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?:["']?)\s+(?:y|and)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
      if (betweenMatch) {
        const rawC1 = betweenMatch[1]!.toLowerCase();
        const rawC2 = betweenMatch[2]!.toLowerCase();
        const foundC1 = diagClasses.some((c) => c.name.toLowerCase() === rawC1);
        const foundC2 = diagClasses.some((c) => c.name.toLowerCase() === rawC2);

        if (!foundC1 || !foundC2) {
          const missing = [!foundC1 ? betweenMatch[1] : null, !foundC2 ? betweenMatch[2] : null].filter(Boolean);
          const avail = diagClasses.map((c) => `"${c.name}"`).join(', ');
          const refusal = isEn
            ? `Cannot create association class: the class(es) ${missing.map((m) => `"${m}"`).join(', ')} do not exist in the diagram. Available classes: ${avail}.`
            : `No se puede vincular la clase de asociación porque ${missing.length > 1 ? 'las clases' : 'la clase'} ${missing.map((m) => `"${m}"`).join(', ')} no existe(n) en el diagrama. Clases disponibles: ${avail}.`;

          return {
            blocked: true,
            replyContent: refusal,
          };
        }
      }
    }
  }

  return { blocked: false };
}
