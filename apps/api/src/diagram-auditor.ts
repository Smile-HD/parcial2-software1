/**
 * Diagram OOAD Quality Auditor
 *
 * Realiza una auditoría arquitectónica formal de Análisis y Diseño Orientado a Objetos (OOAD)
 * y calidad de metamodelo UML sobre el estado real del diagrama en memoria.
 *
 * Principio: 100% determinista sobre el grafo, latencia < 5 ms, 0% alucinaciones.
 * Detecta componentes desconectados (mezcla de dominios), atributos malformados/duplicados,
 * modelos anémicos (0 métodos), clases huérfanas y consistencia de multiplicidades.
 */

export interface AuditReportResult {
  score: number; // 0 a 100
  summary: string;
  sections: {
    domainCohesion: string[];
    attributeIntegrity: string[];
    behaviorCompleteness: string[];
    relationshipQuality: string[];
    recommendations: string[];
  };
}

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
  // 1. Cohesión de Grafo y Mezcla de Dominios (Connected Components)
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
    if (adj.has(g.sourceClassId) && adj.has(g.targetClassId)) {
      adj.get(g.sourceClassId)!.add(g.targetClassId);
      adj.get(g.targetClassId)!.add(g.sourceClassId);
    }
  }
  for (const r of realizations) {
    if (adj.has(r.sourceClassId) && adj.has(r.targetClassId)) {
      adj.get(r.sourceClassId)!.add(r.targetClassId);
      adj.get(r.targetClassId)!.add(r.sourceClassId);
    }
  }
  for (const d of dependencies) {
    if (adj.has(d.sourceClassId) && adj.has(d.targetClassId)) {
      adj.get(d.sourceClassId)!.add(d.targetClassId);
      adj.get(d.targetClassId)!.add(d.sourceClassId);
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
  // 2. Integridad de Atributos (Duplicados, Malformados, Tipos Embebidos)
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

      // Detectar nombres con tipo incrustado como "nombre:string" o con múltiples dos puntos
      if (rawName.includes(':') || /:(string|int|float|date|boolean|bool)/i.test(rawName)) {
        malformedInClass.push(`"${rawName}" (tipo incrustado en el nombre)`);
        totalMalformedAttrs++;
      } else if (['date', 'string', 'int', 'float', 'boolean'].includes(lower)) {
        malformedInClass.push(`"${rawName}" (nombre huérfano con palabra reservada de tipo)`);
        totalMalformedAttrs++;
      }
    }

    // Detectar duplicados directos
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
  // 3. Completitud de Comportamiento y Modelo Anémico (0 métodos)
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
  // 4. Calidad de Relaciones y Multiplicidades
  // ─────────────────────────────────────────────────────────────────────────────
  const relIssues: string[] = [];
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
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Responsabilidad y Complejidad (God Classes / Sobrecarga)
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
  // Formatear Reporte Final
  // ─────────────────────────────────────────────────────────────────────────────
  const output: string[] = [];

  if (isEn) {
    output.push('AUDIT REPORT — OOAD & UML METAMODEL QUALITY');
    output.push('====================================================');
    output.push(
      `Analyzed: ${classes.length} classes, ${associations.length} associations, ${generalizations.length} generalizations.`
    );
    output.push('');

    output.push('1. STRUCTURAL COHESION & DOMAINS:');
    if (domainIssues.length === 0) {
      output.push('  All classes are properly connected in a unified cohesive graph.');
    } else {
      for (const iss of domainIssues) output.push(`  ${iss}`);
    }
    output.push('');

    output.push('2. ATTRIBUTE INTEGRITY & DATA QUALITY:');
    if (attrIssues.length === 0) {
      output.push('  All attributes have clean names and standard types without duplication.');
    } else {
      output.push(`  Detected ${totalMalformedAttrs} malformed or duplicate attributes:`);
      for (const iss of attrIssues) output.push(`  - ${iss}`);
    }
    output.push('');

    output.push('3. BEHAVIOR & DOMAIN COMPLETENESS:');
    for (const iss of behaviorIssues) output.push(`  ${iss}`);
    output.push('');

    output.push('4. RELATIONSHIPS & MULTIPLICITIES:');
    if (relIssues.length === 0) {
      output.push('  All associations define explicit multiplicities on both ends.');
    } else {
      for (const iss of relIssues) output.push(`  - ${iss}`);
    }

    if (complexityIssues.length > 0) {
      output.push('');
      output.push('5. COMPLEXITY & RESPONSIBILITY:');
      for (const iss of complexityIssues) output.push(`  - ${iss}`);
    }

    output.push('');
    output.push('RECOMMENDED ARCHITECTURAL ACTIONS:');
    if (totalMalformedAttrs > 0) {
      output.push('  Clean up type-leaked attributes to prevent compile errors during Spring Boot export.');
    }
    if (components.length > 1) {
      output.push('  Connect disjoint subgraphs with a business transaction class or separate into separate diagrams.');
    }
    if (totalMethods === 0) {
      output.push('  Add domain methods (e.g. calculateTotal(), bookTicket()) to overcome anemic classes.');
    }
    if (totalMalformedAttrs === 0 && components.length <= 1 && totalMethods > 0) {
      output.push('  The diagram demonstrates solid OOAD cohesion and structural integrity.');
    }
  } else {
    output.push('INFORME DE AUDITORÍA — CALIDAD OOAD Y METAMODELO UML');
    output.push('====================================================');
    output.push(
      `Análisis: ${classes.length} clases, ${associations.length} asociaciones, ${generalizations.length} herencias.`
    );
    output.push('');

    output.push('1. COHESIÓN ESTRUCTURAL Y DOMINIOS:');
    if (domainIssues.length === 0) {
      output.push('  Todas las clases están conectadas coherentemente en un único grafo unificado.');
    } else {
      for (const iss of domainIssues) output.push(`  ${iss}`);
    }
    output.push('');

    output.push('2. INTEGRIDAD DE ATRIBUTOS Y CALIDAD DE DATOS:');
    if (attrIssues.length === 0) {
      output.push('  Todos los atributos presentan nombres limpios y tipos válidos sin duplicados.');
    } else {
      output.push(`  Se detectaron ${totalMalformedAttrs} atributos malformados o duplicados:`);
      for (const iss of attrIssues) output.push(`  - ${iss}`);
    }
    output.push('');

    output.push('3. COMPORTAMIENTO Y COMPLETITUD OOAD:');
    for (const iss of behaviorIssues) output.push(`  ${iss}`);
    output.push('');

    output.push('4. CALIDAD DE RELACIONES Y MULTIPLICIDADES:');
    if (relIssues.length === 0) {
      output.push('  Todas las asociaciones cuentan con multiplicidades explícitas en ambos extremos.');
    } else {
      for (const iss of relIssues) output.push(`  - ${iss}`);
    }

    if (complexityIssues.length > 0) {
      output.push('');
      output.push('5. COMPLEJIDAD Y RESPONSABILIDAD:');
      for (const iss of complexityIssues) output.push(`  - ${iss}`);
    }

    output.push('');
    output.push('ACCIONES ARQUITECTÓNICAS RECOMENDADAS:');
    if (totalMalformedAttrs > 0) {
      output.push('  Sanitizar los atributos con tipo incrustado para evitar errores de compilación al exportar a Spring Boot.');
    }
    if (components.length > 1) {
      output.push('  Conectar los subgrafos desconectados con la entidad transaccional integradora o dividirlos en diagramas separados.');
    }
    if (totalMethods === 0) {
      output.push('  Superar el modelo anémico dotando a las entidades principales de métodos de negocio (ej. calcularCosto(), reservar()).');
    }
    if (totalMalformedAttrs === 0 && components.length <= 1 && totalMethods > 0) {
      output.push('  El modelo exhibe solidez estructural y alta cohesión según principios OOAD.');
    }
  }

  return output.join('\n');
}
