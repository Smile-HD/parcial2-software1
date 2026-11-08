import {
  type Diagram,
  type Class,
  type Association,
  type NaryAssociation,
  DiagramSchema,
} from '../ir.js';

/**
 * Clona profundamente un diagrama para asegurar inmutabilidad.
 */
export function cloneDiagram(diagram: Diagram): Diagram {
  return DiagramSchema.parse(JSON.parse(JSON.stringify(diagram)));
}

/**
 * Busca una clase por su ID en el diagrama.
 */
export function findClass(diagram: Diagram, classId: string): Class | undefined {
  return diagram.classes.find(c => c.id === classId);
}

/**
 * Busca una clase por su nombre en el diagrama.
 */
export function findClassByName(diagram: Diagram, name: string): Class | undefined {
  return diagram.classes.find(c => c.name === name);
}

/**
 * Busca una asociación por su ID en el diagrama.
 */
export function findAssociation(diagram: Diagram, associationId: string): Association | undefined {
  return diagram.associations.find(a => a.id === associationId);
}

/**
 * Verifica si ya existe una clase con ese nombre (excluyendo un ID de clase específico).
 */
export function isDuplicateClassName(diagram: Diagram, name: string, excludeClassId?: string): boolean {
  return diagram.classes.some(c => c.name === name && c.id !== excludeClassId);
}

/**
 * Verifica si ya existe un miembro con ese nombre en una clase (excluyendo un ID de miembro específico).
 */
export function isDuplicateMemberName(
  classObj: Class,
  name: string,
  excludeMemberId?: string
): boolean {
  return (
    classObj.attributes.some(a => a.name === name && a.id !== excludeMemberId) ||
    classObj.methods.some(m => m.name === name && m.id !== excludeMemberId)
  );
}

/**
 * Elimina todas las asociaciones conectadas a una clase (eliminación en cascada).
 */
export function cascadeDeleteAssociations(diagram: Diagram, classId: string): Diagram {
  return {
    ...diagram,
    associations: diagram.associations
      .filter(a => a.sourceClassId !== classId && a.targetClassId !== classId)
      .map(a => {
        if (a.associationClassId === classId) {
          const copy = { ...a };
          delete copy.associationClassId;
          return copy;
        }
        return a;
      }),
  };
}

/**
 * Elimina todas las aristas de generalización conectadas a una clase, ya sea en el rol
 * de subClase o superClase (eliminación en cascada, editor:R Generalization).
 */
export function cascadeDeleteGeneralizations(diagram: Diagram, classId: string): Diagram {
  return {
    ...diagram,
    generalizations: diagram.generalizations.filter(
      g => g.subClassId !== classId && g.superClassId !== classId
    ),
  };
}

/**
 * Elimina todas las aristas de realización conectadas a una clase, ya sea en el rol
 * de cliente o interfaz proveedora (eliminación en cascada, editor:R Interfaces — unidad 12.2).
 */
export function cascadeDeleteRealizations(diagram: Diagram, classId: string): Diagram {
  return {
    ...diagram,
    realizations: diagram.realizations.filter(
      r => r.clientClassId !== classId && r.supplierInterfaceId !== classId
    ),
  };
}

/**
 * Elimina todas las aristas de dependencia conectadas a una clase, ya sea en el rol
 * de cliente o proveedor (eliminación en cascada, editor:R Interfaces — unidad 12.2, 12b).
 */
export function cascadeDeleteDependencies(diagram: Diagram, classId: string): Diagram {
  return {
    ...diagram,
    dependencies: diagram.dependencies.filter(
      d => d.clientClassId !== classId && d.supplierClassId !== classId
    ),
  };
}

/**
 * Poda una clase eliminada de los extremos miembros de cada asociación n-aria
 * (eliminación en cascada, editor:R N-ary — unidad 13.1). Una asociación n-aria
 * que quede con menos de tres extremos ya no es n-aria y se elimina por completo.
 * Las asociaciones que no contienen la clase se preservan sin cambios por referencia.
 */
export function cascadeDeleteNaryAssociations(diagram: Diagram, classId: string): Diagram {
  const updated: NaryAssociation[] = [];
  for (const nary of diagram.naryAssociations ?? []) {
    const keptEnds = nary.memberEnds.filter(e => e.classId !== classId);
    if (keptEnds.length === nary.memberEnds.length) {
      updated.push(nary); // la clase no es miembro — dejar el objeto intacto
      continue;
    }
    if (keptEnds.length >= 3) {
      updated.push({ ...nary, memberEnds: keptEnds });
    }
    // < 3 extremos tras la poda: la asociación n-aria completa se elimina.
  }
  return { ...diagram, naryAssociations: updated };
}

/**
 * Verificación de ciclos para aristas de generalización (invariante de mayor riesgo, unidad 11.2).
 *
 * Las aristas apuntan subClase → superClase. Añadir `sub → super` cierra un ciclo si y solo si
 * `sub` es alcanzable desde `super` navegando aristas existentes sub→super
 * (es decir, super ya es descendiente de sub), o sub === super (auto-bucle).
 * El recorrido de ancestros cubre herencia múltiple (los DAGs de diamante siguen siendo válidos).
 */
export function wouldCreateGeneralizationCycle(
  diagram: Diagram,
  subClassId: string,
  superClassId: string,
): boolean {
  if (subClassId === superClassId) return true;
  const visited = new Set<string>();
  const stack: string[] = [superClassId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === subClassId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const gen of diagram.generalizations) {
      if (gen.subClassId === current) {
        stack.push(gen.superClassId);
      }
    }
  }
  return false;
}
