import { randomUUID } from 'crypto';
import type { Class, Association } from '@app/core';

// ── Escape de XML ──────────────────────────────────────────────────────────────

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Funciones auxiliares para construir atributos de propiedad UML ────────────

export function visAttr(v: string | undefined): string {
  if (!v || v === '+') return '';
  return ` visibility="${esc(v)}"`;
}

export function boolAttr(name: string, val: boolean | undefined): string {
  return val ? ` ${name}="true"` : '';
}

export function eaScope(visibility: string | undefined): string {
  switch (visibility) {
    case '-':
      return 'Private';
    case '#':
      return 'Protected';
    case '~':
      return 'Package';
    case '+':
    default:
      return 'Public';
  }
}

export function toDuid(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'EADUID';
}

export interface ResolvedTypeInfo {
  id: string;
  name: string;
  isClass: boolean;
}

/**
 * Normaliza y resuelve un tipo de datos UML de forma insensible a mayúsculas/minúsculas.
 * Si no se detecta ningún tipo de dato válido (vacío, undefined, null, 'none' o 'void' para atributos),
 * retorna null para que no se invente un tipo espurio ni se rompa la exportación.
 * Si coincide con una clase del diagrama (case-insensitively), retorna el ID y nombre de dicha clase.
 * Si es un tipo primitivo conocido, retorna el ID canónico de EA y su nombre.
 * Si es un tipo personalizado no primitivo, genera un ID EAJava válido preservando su nombre.
 */
export function resolveDataType(
  rawType: string | undefined,
  classes: Class[],
  isAttribute = false
): ResolvedTypeInfo | null {
  if (!rawType) return null;
  const trimmed = rawType.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'none' || lower === 'undefined' || lower === 'null') {
    return null;
  }
  if (isAttribute && lower === 'void') {
    return null;
  }

  // 1. Coincidencia insensible a mayúsculas con clases existentes en el diagrama
  const matchedClass = classes.find(
    c => c.name.toLowerCase() === lower || c.id === trimmed
  );
  if (matchedClass) {
    return {
      id: matchedClass.id,
      name: matchedClass.name,
      isClass: true,
    };
  }

  // 2. Diccionario de primitivos estándar (case-insensitive)
  switch (lower) {
    case 'string':
    case 'str':
      return trimmed === 'string'
        ? { id: 'EAJava_string', name: 'string', isClass: false }
        : { id: 'EAJava_String', name: 'String', isClass: false };
    case 'int':
      return { id: 'EAJava_int', name: 'int', isClass: false };
    case 'integer':
      return trimmed === 'integer'
        ? { id: 'EAJava_int', name: 'int', isClass: false }
        : { id: 'EAJava_Integer', name: 'Integer', isClass: false };
    case 'boolean':
    case 'bool':
      return trimmed === 'Boolean'
        ? { id: 'EAJava_Boolean', name: 'Boolean', isClass: false }
        : { id: 'EAJava_boolean', name: 'boolean', isClass: false };
    case 'double':
      return { id: 'EAJava_double', name: 'double', isClass: false };
    case 'float':
      return { id: 'EAJava_float', name: 'float', isClass: false };
    case 'long':
      return trimmed === 'Long'
        ? { id: 'EAJava_Long', name: 'Long', isClass: false }
        : { id: 'EAJava_long', name: 'long', isClass: false };
    case 'short':
      return { id: 'EAJava_short', name: 'short', isClass: false };
    case 'byte':
      return { id: 'EAJava_byte', name: 'byte', isClass: false };
    case 'char':
    case 'character':
      return { id: 'EAJava_char', name: 'char', isClass: false };
    case 'date':
      return { id: 'EAJava_Date', name: 'Date', isClass: false };
    case 'datetime':
      return { id: 'EAJava_DateTime', name: 'DateTime', isClass: false };
    case 'timestamp':
      return { id: 'EAJava_Timestamp', name: 'Timestamp', isClass: false };
    case 'uuid':
    case 'guid':
      return { id: 'EAJava_UUID', name: 'UUID', isClass: false };
    case 'bigdecimal':
    case 'decimal':
      return { id: 'EAJava_BigDecimal', name: 'BigDecimal', isClass: false };
    case 'number':
      return { id: 'EAJava_double', name: 'double', isClass: false };
    case 'void':
      return { id: 'EAJava_void', name: 'void', isClass: false };
  }

  // 3. Tipo personalizado arbitrario
  const cleanId = trimmed.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    id: `EAJava_${cleanId}`,
    name: trimmed,
    isClass: false,
  };
}

// ── Funciones auxiliares de multiplicidad ─────────────────────────────────────

/**
 * Construye elementos hijos lowerValue/upperValue a partir de una cadena de multiplicidad UML.
 */
export function multiplicityXml(mult: string | undefined): string {
  if (!mult) return '';
  if (mult === '*') {
    return `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="0"/>` +
           `<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${randomUUID()}" value="-1"/>`;
  }
  if (mult.includes('..')) {
    const [lower, upper] = mult.split('..');
    const lowerVal = lower ?? '0';
    const upperXml = upper === '*'
      ? `<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${randomUUID()}" value="-1"/>`
      : `<upperValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="${esc(upper ?? '1')}"/>`;
    return `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="${esc(lowerVal)}"/>${upperXml}`;
  }
  // Entero simple: ambos límites iguales
  return `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="${esc(mult)}"/>` +
         `<upperValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="${esc(mult)}"/>`;
}

// ── Mapeo de agregación ──────────────────────────────────────────────────────

export function aggregationAttr(a: Association): string {
  if (a.aggregation === 'none') return '';
  return ` aggregation="${esc(a.aggregation)}"`;
}
