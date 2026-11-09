import type { Cardinality, RelationshipKind } from './types.js';

export { type Cardinality };

/**
 * Tipo de atributo UML → tipo de campo Java (búsqueda insensible a mayúsculas/minúsculas
 * mediante clave en minúsculas).
 */
export const TYPE_MAPPING: Readonly<Record<string, string>> = {
  string: 'String',
  int: 'Integer',
  integer: 'Integer',
  long: 'Long',
  float: 'Float',
  double: 'Double',
  boolean: 'Boolean',
  char: 'Character',
  character: 'Character',
  bigdecimal: 'BigDecimal',
  date: 'LocalDate',
  datetime: 'LocalDateTime',
  timestamp: 'LocalDateTime',
  time: 'LocalTime',
  void: 'void',
};

/** Valor de retorno por defecto para stubs de métodos Java. */
export function defaultReturnValue(javaType: string): string {
  switch (javaType) {
    case 'void':
      return '';
    case 'boolean':
    case 'Boolean':
      return 'return false;';
    case 'int':
    case 'Integer':
    case 'short':
    case 'Short':
    case 'byte':
    case 'Byte':
      return 'return 0;';
    case 'long':
    case 'Long':
      return 'return 0L;';
    case 'float':
    case 'Float':
      return 'return 0.0f;';
    case 'double':
    case 'Double':
      return 'return 0.0;';
    case 'BigDecimal':
      return 'return java.math.BigDecimal.ZERO;';
    case 'String':
      return 'return "";';
    default:
      return 'return null;';
  }
}

/** Mapea un tipo de atributo UML declarado a un tipo Java, marcando tipos no mapeados. */
export function mapAttributeType(declaredType: string): { javaType: string; mapped: boolean } {
  const javaType = TYPE_MAPPING[declaredType.toLowerCase()];
  if (javaType === undefined) {
    return { javaType: 'String', mapped: false };
  }
  return { javaType, mapped: true };
}

/**
 * Clasifica la multiplicidad de un extremo en una cardinalidad relevante para JPA.
 */
export function classifyMultiplicity(multiplicity: string | undefined): Cardinality {
  if (multiplicity === undefined) return 'unknown';
  if (multiplicity === '*') return 'many';

  let lower: number;
  let upper: number;
  const range = /^(\d+)\.\.(\d+|\*)$/.exec(multiplicity);
  const single = /^(\d+)$/.exec(multiplicity);
  if (range) {
    lower = Number(range[1]);
    upper = range[2] === '*' ? Number.POSITIVE_INFINITY : Number(range[2]);
  } else if (single) {
    lower = Number(single[1]);
    upper = Number(single[1]);
  } else {
    return 'unknown';
  }

  if (upper === 0) return 'zero';
  if (upper === 1) return lower === 1 ? 'one' : 'zeroOrOne';
  return 'many';
}

/**
 * Cardinalidades de extremos de asociación → tipo de relación JPA.
 */
export const MULTIPLICITY_MAPPING: Readonly<Record<string, RelationshipKind>> = {
  'one:many': 'OneToMany',
  'many:one': 'ManyToOne',
  'many:many': 'ManyToMany',
  'one:one': 'OneToOne',
};

/** Normaliza una cardinalidad al eje to-one / to-many utilizado por la tabla. */
export function toEnd(card: Cardinality): 'one' | 'many' | null {
  if (card === 'many') return 'many';
  if (card === 'one' || card === 'zeroOrOne') return 'one';
  return null;
}

export interface ResolvedPair {
  kind: RelationshipKind;
  sourceOwning: boolean;
  targetOwning: boolean;
  owningSide: 'source' | 'target';
}

/** Resuelve las multiplicidades de los extremos de una asociación en una relación JPA. */
export function resolvePair(
  sourceMult: string | undefined,
  targetMult: string | undefined,
): ResolvedPair | null {
  const sourceEnd = toEnd(classifyMultiplicity(sourceMult));
  const targetEnd = toEnd(classifyMultiplicity(targetMult));
  if (sourceEnd === null || targetEnd === null) return null;

  const kind = MULTIPLICITY_MAPPING[`${sourceEnd}:${targetEnd}`];
  if (kind === undefined) return null;

  switch (kind) {
    case 'OneToMany':
      return { kind, sourceOwning: false, targetOwning: true, owningSide: 'target' };
    case 'ManyToOne':
      return { kind, sourceOwning: true, targetOwning: false, owningSide: 'source' };
    case 'ManyToMany':
      return { kind, sourceOwning: false, targetOwning: false, owningSide: 'source' };
    case 'OneToOne':
      return { kind, sourceOwning: true, targetOwning: false, owningSide: 'source' };
  }
}

/** Visibilidad de miembro UML → modificador de campo Java. */
export function fieldModifierFor(visibility: '+' | '-' | '#' | '~'): 'private' | 'protected' | '' {
  if (visibility === '#') return 'protected';
  if (visibility === '~') return '';
  return 'private';
}

/** Extrae y sanea el nombre de un atributo UML cuando contiene sintaxis embebida de tipo. */
export function extractAttributeNameAndType(rawName: string, declaredType: string): { name: string; type: string } {
  let cleanName = (rawName || '').trim();
  let cleanType = (declaredType || '').trim();

  if (cleanName.includes(':')) {
    const colonParts = cleanName.split(':').map((p) => p.trim()).filter(Boolean);
    if (colonParts.length > 0) {
      cleanName = colonParts[0]!;
      const embeddedType = colonParts[colonParts.length - 1];
      if (embeddedType && (!cleanType || cleanType.toLowerCase() === 'string' || cleanType.toLowerCase() === '')) {
        cleanType = embeddedType;
      }
    }
  }

  cleanName = cleanName.replace(/^[-+#~]\s*/, '').trim();
  return { name: cleanName, type: cleanType };
}

/** El tipo de relación vista desde el extremo opuesto de la asociación. */
export function inverseKind(kind: RelationshipKind): RelationshipKind {
  if (kind === 'OneToMany') return 'ManyToOne';
  if (kind === 'ManyToOne') return 'OneToMany';
  return kind;
}

/** camelCase / PascalCase → snake_case. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}
