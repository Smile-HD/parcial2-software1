/**
 * Diagram OOAD Quality Auditor
 *
 * Realiza una auditoría arquitectónica formal de Análisis y Diseño Orientado a Objetos (OOAD)
 * y calidad de metamodelo UML sobre el estado real del diagrama en memoria.
 *
 * Principio: 100% determinista sobre el grafo, latencia < 5 ms, 0% alucinaciones.
 * Detecta componentes desconectados (mezcla de dominios), nombres inválidos (espacios, XML, palabras reservadas),
 * ciclos de herencia, asociaciones duplicadas, atributos malformados, modelos anémicos y multiplicidades.
 */

const IDENTIFIER_REGEX = /^[A-Za-z_ñÑáéíóúÁÉÍÓÚ][A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]*$/;
const JAVA_RESERVED_WORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'record', 'sealed', 'permits', 'var', 'yield'
]);

export function auditDiagramOOAD(diagram?: any, language: 'es' | 'en' = 'es'): string {
  if (!diagram || !Array.isArray(diagram.classes) || diagram.classes.length === 0) {
    return language === 'en'
      ? 'The canvas is currently empty. There are no classes or relationships to audit.'
      : 'El lienzo actualmente está vacío. No hay clases ni relaciones para auditar.';
  }

  const isEn = language === 'en';
  const classes: any[] = diagram.classes;
  const associations: any[] = Array.isArray(diagram.associations) ? diagram.associations : [];
  const generalizations: any[] = Array.isArray(diagram.generalizations) ? diagram.generalizations : [];
  const realizations: any[] = Array.isArray(diagram.realizations) ? diagram.realizations : [];
  const dependencies: any[] = Array.isArray(diagram.dependencies) ? diagram.dependencies : [];

  const classMap = new Map<string, any>();
  for (const c of classes) {
    if (c && c.id) classMap.set(c.id, c);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Sintaxis de Identificadores y Nomenclatura (Clases)
  // ─────────────────────────────────────────────────────────────────────────────
  const namingIssues: string[] = [];
  let totalInvalidClassNames = 0;

  for (const c of classes) {
    const rawClassName = String(c.name || '').trim();
    if (!IDENTIFIER_REGEX.test(rawClassName)) {
      namingIssues.push(
        isEn
          ? `Class "${rawClassName}": Name is not a valid UML identifier (contains spaces, punctuation, or illegal characters).`
          : `Clase "${rawClassName}": El nombre no es un identificador UML válido (contiene espacios, signos o caracteres ilegales).`
      );
      totalInvalidClassNames++;
    } else if (JAVA_RESERVED_WORDS.has(rawClassName.toLowerCase())) {
      namingIssues.push(
        isEn
          ? `Class "${rawClassName}": Name collisions with a reserved programming language keyword.`
          : `Clase "${rawClassName}": El nombre colisiona con una palabra reservada del lenguaje.`
      );
      totalInvalidClassNames++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Jerarquías de Herencia y Detección de Ciclos / Auto-herencia
  // ─────────────────────────────────────────────────────────────────────────────
  const cycleIssues: string[] = [];
  const genAdj = new Map<string, string[]>();

  for (const g of generalizations) {
    const sub = g.subClassId ?? g.sourceClassId;
    const sup = g.superClassId ?? g.targetClassId;
    if (sub && sup) {
      if (sub === sup) {
        const clsName = classMap.get(sub)?.name || sub;
        cycleIssues.push(
          isEn
            ? `Self-Inheritance Loop: Class "${clsName}" inherits from itself.`
            : `Auto-herencia: La clase "${clsName}" hereda de sí misma.`
        );
      }
      if (!genAdj.has(sub)) genAdj.set(sub, []);
      genAdj.get(sub)!.push(sup);
    }
  }

  for (const startId of genAdj.keys()) {
    const visited = new Set<string>();
    const stack = [...(genAdj.get(startId) || [])];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (curr === startId) {
        const startName = classMap.get(startId)?.name || startId;
        cycleIssues.push(
          isEn
            ? `Inheritance Cycle: Detected cyclic inheritance involving class "${startName}".`
            : `Ciclo de Herencia: Se detectó un ciclo cerrado de herencia que involucra a la clase "${startName}".`
        );
        break;
      }
      if (visited.has(curr)) continue;
      visited.add(curr);
      const nexts = genAdj.get(curr) || [];
      for (const n of nexts) stack.push(n);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Cohesión de Grafo y Mezcla de Dominios (Connected Components)
  // ─────────────────────────────────────────────────────────────────────────────
  const adj = new Map<string, Set<string>>();
  for (const c of classes) {
    adj.set(c.id, new Set());
  }

  for (const a of associations) {
    if (adj.has(a.sourceClassId) && adj.has(a.targetClassId)) {
      adj.get(a.sourceClassId)!.add(a.targetClassId);
      adj.get(a.targetClassId)!.add(a.sourceClassId);
    }
  }
  for (const g of generalizations) {
    const sub = g.subClassId ?? g.sourceClassId;
    const sup = g.superClassId ?? g.targetClassId;
    if (adj.has(sub) && adj.has(sup)) {
      adj.get(sub)!.add(sup);
      adj.get(sup)!.add(sub);
    }
  }
  for (const r of realizations) {
    const client = r.clientClassId ?? r.sourceClassId;
    const supplier = r.supplierInterfaceId ?? r.targetClassId;
    if (adj.has(client) && adj.has(supplier)) {
      adj.get(client)!.add(supplier);
      adj.get(supplier)!.add(client);
    }
  }
  for (const d of dependencies) {
    const client = d.clientClassId ?? d.sourceClassId;
    const supplier = d.supplierClassId ?? d.targetClassId;
    if (adj.has(client) && adj.has(supplier)) {
      adj.get(client)!.add(supplier);
      adj.get(supplier)!.add(client);
    }
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const c of classes) {
    if (!visited.has(c.id)) {
      const comp: string[] = [];
      const queue = [c.id];
      visited.add(c.id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(curr);
        const neighbors = adj.get(curr) || new Set();
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      components.push(comp);
    }
  }

  const domainIssues: string[] = [];
  const orphanClasses: string[] = [];

  for (const comp of components) {
    if (comp.length === 1) {
      const cls = classMap.get(comp[0]);
      if (cls) orphanClasses.push(cls.name);
    }
  }

  if (components.length > 1) {
    const compSummaries = components.map((comp, idx) => {
      const names = comp.map((id) => `"${classMap.get(id)?.name || id}"`).join(', ');
      return `  - Subgrafo ${idx + 1}: [${names}]`;
    });
    if (isEn) {
      domainIssues.push(
        `Disjoint Subgraphs / Mixed Domains: Detected ${components.length} independent disconnected subgraphs on the same canvas:\n${compSummaries.join('\n')}`
      );
    } else {
      domainIssues.push(
        `Subgrafos Desconectados / Mezcla de Dominios: Se detectan ${components.length} subgrafos independientes sin conexión entre sí en el mismo lienzo:\n${compSummaries.join('\n')}`
      );
    }
  }

  if (orphanClasses.length > 0) {
    const list = orphanClasses.map((n) => `"${n}"`).join(', ');
    if (isEn) {
      domainIssues.push(`Orphan Classes (isolated with 0 relationships): ${list}.`);
    } else {
      domainIssues.push(`Clases Huérfanas (aisladas sin ninguna relación): ${list}.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Integridad de Atributos (Duplicados, Malformados, Tipos Embebidos)
  // ─────────────────────────────────────────────────────────────────────────────
  const attrIssues: string[] = [];
  let totalMalformedAttrs = 0;

  for (const c of classes) {
    const attrs: any[] = Array.isArray(c.attributes) ? c.attributes : [];
    const seenNames = new Map<string, number>();
    const malformedInClass: string[] = [];

    for (const a of attrs) {
      const rawName = String(a.name || '').trim();
      const lower = rawName.toLowerCase();
      seenNames.set(lower, (seenNames.get(lower) || 0) + 1);

      if (rawName.includes(':') || /:(string|int|float|date|boolean|bool)/i.test(rawName)) {
        malformedInClass.push(`"${rawName}" (tipo incrustado en el nombre)`);
        totalMalformedAttrs++;
      } else if (['date', 'string', 'int', 'float', 'boolean'].includes(lower)) {
        malformedInClass.push(`"${rawName}" (nombre huérfano con palabra reservada de tipo)`);
        totalMalformedAttrs++;
      } else if (!IDENTIFIER_REGEX.test(rawName)) {
        malformedInClass.push(`"${rawName}" (nombre no es identificador válido)`);
        totalMalformedAttrs++;
      } else if (JAVA_RESERVED_WORDS.has(lower)) {
        malformedInClass.push(`"${rawName}" (palabra reservada de Java)`);
        totalMalformedAttrs++;
      }
    }

    for (const [name, count] of seenNames.entries()) {
      if (count > 1) {
        malformedInClass.push(`"${name}" (duplicado ${count} veces)`);
        totalMalformedAttrs++;
      }
    }

    if (malformedInClass.length > 0) {
      attrIssues.push(
        isEn
          ? `Class "${c.name}": ${malformedInClass.join(', ')}`
          : `Clase "${c.name}": ${malformedInClass.join(', ')}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Completitud de Comportamiento y Modelo Anémico (0 métodos)
  // ─────────────────────────────────────────────────────────────────────────────
  const behaviorIssues: string[] = [];
  let totalMethods = 0;
  const classesWithoutMethods: string[] = [];

  for (const c of classes) {
    const methods: any[] = Array.isArray(c.methods) ? c.methods : [];
    totalMethods += methods.length;
    if (methods.length === 0) {
      classesWithoutMethods.push(c.name);
    }
  }

  if (totalMethods === 0) {
    if (isEn) {
      behaviorIssues.push(
        `Anemic Domain Model: 0 business methods defined across all ${classes.length} classes. Entities currently behave as passive data structures (DTOs).`
      );
    } else {
      behaviorIssues.push(
        `Modelo de Dominio Anémico: 0 métodos de negocio definidos en las ${classes.length} clases del diagrama. Las entidades actualmente actúan solo como estructuras pasivas de datos (DTOs).`
      );
    }
  } else if (classesWithoutMethods.length > 0) {
    const list = classesWithoutMethods.map((n) => `"${n}"`).join(', ');
    if (isEn) {
      behaviorIssues.push(`Classes without methods: ${list}.`);
    } else {
      behaviorIssues.push(`Clases sin métodos definidos: ${list}.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Calidad de Relaciones, Asociaciones Duplicadas y Multiplicidades
  // ─────────────────────────────────────────────────────────────────────────────
  const relIssues: string[] = [];
  const duplicateAssocIssues: string[] = [];
  const seenPairs = new Map<string, number>();

  for (const a of associations) {
    const src = classMap.get(a.sourceClassId)?.name || a.sourceClassId;
    const tgt = classMap.get(a.targetClassId)?.name || a.targetClassId;

    if (!a.sourceMultiplicity || !a.targetMultiplicity) {
      relIssues.push(
        isEn
          ? `Missing Multiplicity: Relationship between "${src}" and "${tgt}" has unassigned multiplicities.`
          : `Multiplicidad Ausente: La relación entre "${src}" y "${tgt}" no tiene multiplicidades explícitas asignadas.`
      );
    }

    const pairKey = [a.sourceClassId, a.targetClassId].sort().join(':::');
    const cnt = (seenPairs.get(pairKey) || 0) + 1;
    seenPairs.set(pairKey, cnt);
    if (cnt === 2) {
      duplicateAssocIssues.push(
        isEn
          ? `Duplicate Association: Multiple parallel associations detected between "${src}" and "${tgt}".`
          : `Asociación Duplicada: Se detectaron múltiples asociaciones paralelas entre "${src}" y "${tgt}".`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Responsabilidad y Complejidad (God Classes / Sobrecarga)
  // ─────────────────────────────────────────────────────────────────────────────
  const complexityIssues: string[] = [];
  for (const c of classes) {
    const attrCount = Array.isArray(c.attributes) ? c.attributes.length : 0;
    if (attrCount > 8) {
      complexityIssues.push(
        isEn
          ? `High Responsibility (Potential God Class): "${c.name}" has ${attrCount} attributes. Consider splitting or extracting a value object.`
          : `Alta Responsabilidad (Posible God Class): "${c.name}" tiene ${attrCount} atributos. Considerá dividir responsabilidades o extraer objetos de valor.`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cálculo de Puntuación de Salud Arquitectónica (0 - 100)
  // ─────────────────────────────────────────────────────────────────────────────
  let score = 100;
  if (cycleIssues.length > 0) score -= 40;
  if (totalInvalidClassNames > 0) score -= Math.min(30, totalInvalidClassNames * 10);
  if (duplicateAssocIssues.length > 0) score -= Math.min(20, duplicateAssocIssues.length * 10);
  if (totalMalformedAttrs > 0) score -= Math.min(25, totalMalformedAttrs * 4);
  if (components.length > 1) score -= 15;
  if (orphanClasses.length > 0) score -= Math.min(20, orphanClasses.length * 10);
  if (totalMethods === 0) score -= 15;
  if (relIssues.length > 0) score -= Math.min(15, relIssues.length * 5);
  if (complexityIssues.length > 0) score -= 10;
  score = Math.max(10, score);

  const healthStatus =
    score >= 85
      ? (isEn ? 'Healthy (Production-ready)' : 'Saludable (Listo para producción)')
      : score >= 60
      ? (isEn ? 'Needs Attention' : 'Requiere Atención')
      : (isEn ? 'Critical (Action Required)' : 'Crítico (Atención Inmediata)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Formatear Reporte Final en Markdown Ejecutivo
  // ─────────────────────────────────────────────────────────────────────────────
  const output: string[] = [];

  if (isEn) {
    output.push('### AUDIT REPORT — OOAD & UML METAMODEL QUALITY');
    output.push(`**Overall Health**: **${score}/100** — *${healthStatus}*`);
    output.push(`**Analyzed elements**: ${classes.length} classes, ${associations.length} associations, ${generalizations.length} generalizations.`);
    output.push('');

    if (namingIssues.length > 0) {
      output.push('#### 1. Identifiers & UML Syntax');
      for (const iss of namingIssues) output.push(`• ${iss}`);
      output.push('');
    }

    if (cycleIssues.length > 0) {
      output.push('#### 2. Inheritance Hierarchy & Cycles');
      for (const iss of cycleIssues) output.push(`• ${iss}`);
      output.push('');
    }

    output.push('#### 3. Structural Cohesion & Domains');
    if (domainIssues.length === 0) {
      output.push('• All classes are properly connected in a unified cohesive graph.');
    } else {
      for (const iss of domainIssues) output.push(`• ${iss}`);
    }
    output.push('');

    output.push('#### 4. Attribute Integrity & Data Quality');
    if (attrIssues.length === 0) {
      output.push('• All attributes have clean names and standard types without duplication.');
    } else {
      output.push(`• Detected ${totalMalformedAttrs} malformed or duplicate attributes:`);
      for (const iss of attrIssues) output.push(`  - ${iss}`);
    }
    output.push('');

    output.push('#### 5. Behavior & Encapsulation (OOAD)');
    for (const iss of behaviorIssues) output.push(`• ${iss}`);
    output.push('');

    output.push('#### 6. Relationships & Multiplicities');
    if (relIssues.length === 0 && duplicateAssocIssues.length === 0) {
      output.push('• All associations define explicit multiplicities on both ends without duplicates.');
    } else {
      for (const iss of duplicateAssocIssues) output.push(`• ${iss}`);
      for (const iss of relIssues) output.push(`• ${iss}`);
    }

    if (complexityIssues.length > 0) {
      output.push('');
      output.push('#### 7. Complexity & Single Responsibility');
      for (const iss of complexityIssues) output.push(`• ${iss}`);
    }

    output.push('');
    output.push('#### Recommended Architectural Actions');
    let actionIdx = 1;
    if (cycleIssues.length > 0) {
      output.push(`${actionIdx++}. **[Blocker]** Break inheritance cycles to preserve class hierarchy validity.`);
    }
    if (totalInvalidClassNames > 0) {
      output.push(`${actionIdx++}. **[High Priority]** Rename classes to valid identifiers without spaces or XML characters.`);
    }
    if (duplicateAssocIssues.length > 0) {
      output.push(`${actionIdx++}. **[High Priority]** Remove duplicate parallel associations between connected entities.`);
    }
    if (totalMalformedAttrs > 0) {
      output.push(`${actionIdx++}. **[High Priority]** Clean up type-leaked attributes to prevent compile errors during Spring Boot export.`);
    }
    if (components.length > 1) {
      output.push(`${actionIdx++}. **[High Priority]** Connect disjoint subgraphs with a business transaction class or separate into distinct diagrams.`);
    }
    if (totalMethods === 0) {
      output.push(`${actionIdx++}. **[Medium Priority]** Add domain methods (e.g. calculateTotal(), bookTicket()) to overcome anemic classes.`);
    }
    if (totalMalformedAttrs === 0 && components.length <= 1 && totalMethods > 0 && namingIssues.length === 0 && duplicateAssocIssues.length === 0 && cycleIssues.length === 0) {
      output.push(`1. The diagram demonstrates solid OOAD cohesion and structural integrity.`);
    }
  } else {
    output.push('### Auditoría Arquitectónica del Dominio (Calidad OOAD y UML)');
    output.push(`**Salud del Modelo**: **${score}/100** — *${healthStatus}*`);
    output.push(`**Elementos analizados**: ${classes.length} clases, ${associations.length} asociaciones, ${generalizations.length} herencias.`);
    output.push('');

    if (namingIssues.length > 0) {
      output.push('#### 1. Identificadores y Sintaxis UML');
      for (const iss of namingIssues) output.push(`• ${iss}`);
      output.push('');
    }

    if (cycleIssues.length > 0) {
      output.push('#### 2. Jerarquías y Ciclos de Herencia');
      for (const iss of cycleIssues) output.push(`• ${iss}`);
      output.push('');
    }

    output.push('#### 3. Cohesión Estructural y Dominios');
    if (domainIssues.length === 0) {
      output.push('• Todas las clases están conectadas coherentemente en un único grafo unificado.');
    } else {
      for (const iss of domainIssues) output.push(`• ${iss}`);
    }
    output.push('');

    output.push('#### 4. Integridad de Atributos y Calidad de Datos');
    if (attrIssues.length === 0) {
      output.push('• Todos los atributos presentan nombres limpios y tipos válidos sin duplicados.');
    } else {
      output.push(`• Se detectaron ${totalMalformedAttrs} atributos malformados o duplicados:`);
      for (const iss of attrIssues) output.push(`  - ${iss}`);
    }
    output.push('');

    output.push('#### 5. Comportamiento y Completitud OOAD');
    for (const iss of behaviorIssues) output.push(`• ${iss}`);
    output.push('');

    output.push('#### 6. Calidad de Relaciones y Multiplicidades');
    if (relIssues.length === 0 && duplicateAssocIssues.length === 0) {
      output.push('• Todas las asociaciones cuentan con multiplicidades explícitas en ambos extremos sin duplicados.');
    } else {
      for (const iss of duplicateAssocIssues) output.push(`• ${iss}`);
      for (const iss of relIssues) output.push(`• ${iss}`);
    }

    if (complexityIssues.length > 0) {
      output.push('');
      output.push('#### 7. Complejidad y Responsabilidad Única');
      for (const iss of complexityIssues) output.push(`• ${iss}`);
    }

    output.push('');
    output.push('#### Plan de Acción Arquitectónico Recomendado');
    let actionIdx = 1;
    if (cycleIssues.length > 0) {
      output.push(`${actionIdx++}. **[Bloqueante]** Eliminar ciclos de herencia para preservar la validez del metamodelo.`);
    }
    if (totalInvalidClassNames > 0) {
      output.push(`${actionIdx++}. **[Prioridad Alta]** Renombrar las clases a identificadores válidos sin espacios ni caracteres especiales.`);
    }
    if (duplicateAssocIssues.length > 0) {
      output.push(`${actionIdx++}. **[Prioridad Alta]** Eliminar asociaciones paralelas redundantes entre las mismas entidades.`);
    }
    if (totalMalformedAttrs > 0) {
      output.push(`${actionIdx++}. **[Prioridad Alta]** Sanitizar los atributos con tipo incrustado para evitar errores de compilación al exportar a Spring Boot.`);
    }
    if (components.length > 1) {
      output.push(`${actionIdx++}. **[Prioridad Alta]** Conectar los subgrafos desconectados con la entidad transaccional integradora o dividirlos en diagramas separados.`);
    }
    if (totalMethods === 0) {
      output.push(`${actionIdx++}. **[Diseño OOAD]** Superar el modelo anémico dotando a las entidades principales de métodos de negocio (ej. calcularCosto(), reservar()).`);
    }
    if (totalMalformedAttrs === 0 && components.length <= 1 && totalMethods > 0 && namingIssues.length === 0 && duplicateAssocIssues.length === 0 && cycleIssues.length === 0) {
      output.push(`1. El modelo exhibe solidez estructural y alta cohesión según principios OOAD.`);
    }
  }

  return output.join('\n');
}
