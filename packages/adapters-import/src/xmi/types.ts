/**
 * Tipos y funciones auxiliares base para el procesamiento XMI 2.1.
 */

export type XmiModel = {
  classes: Array<{
    id: string;
    name: string;
    kind: 'class' | 'interface';
    isAbstract: boolean;
    attributes: Array<{
      name: string;
      type: string;
      visibility: string;
      isStatic: boolean;
      isDerived: boolean;
      multiplicity?: string;
    }>;
    methods: Array<{
      name: string;
      returnType: string;
      visibility: string;
      isStatic: boolean;
      parameters?: Array<{ name: string; type: string }>;
    }>;
  }>;
  associations: Array<{
    id: string;
    source: string;
    target: string;
    aggregation: 'none' | 'shared' | 'composite';
    aggregationEnd: 'source' | 'target';
    name?: string;
    sourceRole?: string;
    targetRole?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    associationClassId?: string;
  }>;
  generalizations: Array<{
    id: string;
    subClassId: string;
    superClassId: string;
    name?: string;
  }>;
  realizations: Array<{
    id: string;
    clientId: string;
    supplierId: string;
    name?: string;
  }>;
  dependencies: Array<{
    id: string;
    clientId: string;
    supplierId: string;
    name?: string;
  }>;
  naryAssociations: Array<{
    id: string;
    memberEnds: Array<{ classId: string; multiplicity?: string; role?: string }>;
    name?: string;
  }>;
};

export const VERSION_PATTERN = /^2\.1/i;

/** Fuerza a que un hijo de fast-xml-parser (objeto único, arreglo o ausente) sea un arreglo. */
export function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normaliza la visibilidad UML: las exportaciones XMI 2.1 usan palabras semánticas
 * ("private", "public", "protected", "package"); el esquema del motor usa los
 * símbolos UML 2.5.1 ('-', '+', '#', '~').
 */
export function normalizeVisibility(visibility: string | undefined): '+' | '-' | '#' | '~' {
  switch (visibility) {
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
    case 'public':
      return '+';
    case '+':
    case '-':
    case '#':
    case '~':
      return visibility;
    default:
      return '+';
  }
}
