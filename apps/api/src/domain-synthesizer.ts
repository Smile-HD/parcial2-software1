import type { BatchDelta, LlmPort } from '@app/core';
import { stripAccents, findClosestClassName } from '@app/adapters-ai';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from './domain-catalog/router.js';

export interface SemanticAttribute {
  name: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
}

export interface SemanticMethod {
  name: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticClass {
  name: string;
  isInterface?: boolean;
  isAbstract?: boolean;
  attributes?: SemanticAttribute[];
  methods?: SemanticMethod[];
}

export interface SemanticAssociation {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  associationClass?: string | null;
  directed?: boolean;
  sourceRole?: string;
  targetRole?: string;
}

export interface SemanticGeneralization {
  subclass: string;
  superclass: string;
  name?: string;
}

export interface SemanticRealization {
  clientClass: string;
  supplierInterface: string;
  name?: string;
}

export interface SemanticDependency {
  client: string;
  supplier: string;
  name?: string;
}

export interface SemanticNaryAssociation {
  name?: string;
  members: Array<{
    class: string;
    multiplicity?: string;
    role?: string;
  }>;
}

export interface SemanticRenames {
  classes?: Array<{ from: string; to: string }>;
  attributes?: Array<{ class: string; from: string; to: string }>;
  methods?: Array<{ class: string; from: string; to: string }>;
}

export interface SemanticClassUpdate {
  name: string;
  classKind?: 'class' | 'interface';
  isAbstract?: boolean;
}

export interface SemanticAttributeUpdate {
  class: string;
  name: string;
  newName?: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
  multiplicity?: string;
}

export interface SemanticMethodUpdate {
  class: string;
  name: string;
  newName?: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticAssociationUpdate {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  sourceRole?: string;
  targetRole?: string;
  associationClass?: string | null;
}

export interface SemanticGeneralizationUpdate {
  subclass: string;
  superclass: string;
  name: string;
}

export interface SemanticRealizationUpdate {
  clientClass: string;
  supplierInterface: string;
  name: string;
}

export interface SemanticDependencyUpdate {
  client: string;
  supplier: string;
  name: string;
}

export interface SemanticNaryAssociationUpdate {
  name?: string;
  naryAssociationId?: string;
  memberEnds?: Array<{ class: string; multiplicity?: string; role?: string }>;
}

export interface SemanticReposition {
  class: string;
  x: number;
  y: number;
}

export interface SemanticUpdates {
  classes?: SemanticClassUpdate[];
  attributes?: SemanticAttributeUpdate[];
  methods?: SemanticMethodUpdate[];
  associations?: SemanticAssociationUpdate[];
  generalizations?: SemanticGeneralizationUpdate[];
  realizations?: SemanticRealizationUpdate[];
  dependencies?: SemanticDependencyUpdate[];
  naryAssociations?: SemanticNaryAssociationUpdate[];
  positions?: SemanticReposition[];
}

export interface SemanticDeletions {
  classes?: string[];
  attributes?: Array<{ class: string; attribute: string }>;
  methods?: Array<{ class: string; method: string }>;
  associations?: Array<{ source: string; target: string }>;
  generalizations?: Array<{ subclass: string; superclass: string }>;
  realizations?: Array<{ clientClass: string; supplierInterface: string }>;
  dependencies?: Array<{ client: string; supplier: string }>;
  naryAssociations?: string[];
}

export interface SemanticDomainModel {
  action?: 'create' | 'modify' | 'delete';
  classes?: SemanticClass[];
  associations?: SemanticAssociation[];
  generalizations?: SemanticGeneralization[];
  realizations?: SemanticRealization[];
  dependencies?: SemanticDependency[];
  naryAssociations?: SemanticNaryAssociation[];
  renames?: SemanticRenames;
  updates?: SemanticUpdates;
  deletions?: SemanticDeletions;
}

export function isDomainModelRequest(text: string): boolean {
  return /(?:crea|crear|dise[ñn]|model|arma|armar|implement|aplica|agrega|inserta|pone|pon\b|hace|haz|constru|reserva|base de datos|sistema|diagrama|quiero un|necesito un|hazme|haceme|hacer|renombr|modific|cambi|borr|elimin|quit|make|build|generate|design|model|add|apply|rename|update|delete|remove)/i.test(text);
}

export function cleanMultiplicity(val: unknown, fallback: string = '1'): string {
  if (typeof val !== 'string') return fallback;
  let s = val.trim().replace(/\s+/g, '');
  if (!s) return fallback;
  s = s.replace(/\b[nNmM]\b/g, '*');
  s = s.replace(/\.\.[nNmM]/g, '..*');
  s = s.replace(/[nNmM]\.\./g, '*..');
  if (/^n-?to-?1$/i.test(s) || /^n:1$/i.test(s)) return '0..*';
  if (/^1-?to-?n$/i.test(s) || /^1:n$/i.test(s)) return '1';
  const isValid = /^\*|^\d+$|^\d+\.\.\d+$|^\d+\.\.\*$/.test(s);
  return isValid ? s : fallback;
}

/**
 * Sanitiza nombres de clases eliminando prefijos comunes como "Clase ", comillas, asteriscos o corchetes,
 * formateando a PascalCase limpio.
 */
export function cleanClassName(raw?: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  // Quitar comillas, asteriscos (markdown bold), backticks y corchetes externos
  s = s.replace(/^[\*"'`\[\(]+/, '').replace(/[\*"'`\]\)]+$/, '');
  // Quitar prefijos literales generados por LLMs como "Clase ", "Class ", "Entidad ", "Entity "
  s = s.replace(/^(?:clase|class|entidad|entity|interface|interfaz)\s+/i, '');
  // Quitar comillas o asteriscos residuales
  s = s.replace(/^[\*"'`]+/, '').replace(/[\*"'`]+$/, '');
  // Eliminar espacios intermedios preservando mayúsculas iniciales (PascalCase)
  const parts = s.split(/[\s_-]+/).filter(Boolean);
  if (parts.length > 0) {
    s = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }
  return s;
}

/**
 * Genera una clave canónica normalizada para búsqueda y deduplicación de clases (singular/plural, minúsculas).
 */
export function toCanonicalKey(raw?: string): string {
  if (!raw) return '';
  const cleaned = cleanClassName(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (cleaned.endsWith('es') && cleaned.length > 4) return cleaned.slice(0, -2);
  if (cleaned.endsWith('s') && cleaned.length > 3) return cleaned.slice(0, -1);
  return cleaned;
}

/**
 * Sanitiza nombre y tipo de atributo, separando sufijos de tipo concatenados por LLMs
 * (ej: "matriculastring" -> "matricula" / "string", "activaboolean" -> "activa" / "boolean").
 */
export function sanitizeAttributeNameAndType(rawName: string, rawType?: string): { name: string; type: string } {
  let name = (rawName || '').trim();
  let type = (rawType || '').trim();

  // Si vino en formato "nombre:tipo"
  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[0]?.trim() || '';
    if (!type || type === 'string') {
      type = parts[1]?.trim() || type;
    }
  }

  name = name
    .replace(/^[-+*#~]\s*/, '')
    .replace(/\s+/g, '')
    .replace(/^[\[\(\{]+/, '')
    .replace(/[\]\)\}]+$/, '');

  const typeMap: Record<string, string> = {
    string: 'string',
    str: 'string',
    texto: 'string',
    int: 'int',
    integer: 'int',
    entero: 'int',
    number: 'int',
    numero: 'int',
    float: 'float',
    double: 'float',
    decimal: 'float',
    boolean: 'boolean',
    bool: 'boolean',
    date: 'date',
    datetime: 'date',
    fecha: 'date',
    void: 'void',
  };

  const knownSuffixes = [
    { suffix: 'boolean', type: 'boolean' },
    { suffix: 'bool', type: 'boolean' },
    { suffix: 'string', type: 'string' },
    { suffix: 'str', type: 'string' },
    { suffix: 'integer', type: 'int' },
    { suffix: 'int', type: 'int' },
    { suffix: 'float', type: 'float' },
    { suffix: 'double', type: 'float' },
    { suffix: 'decimal', type: 'float' },
    { suffix: 'datetime', type: 'date' },
    { suffix: 'date', type: 'date' },
    { suffix: 'fecha', type: 'date' },
  ];

  const skipWords = new Set(['point', 'joint', 'paint', 'print', 'state', 'date', 'rate', 'gate']);

  for (const ks of knownSuffixes) {
    const lower = name.toLowerCase();
    if (lower.endsWith(ks.suffix) && !skipWords.has(lower)) {
      const base = name.slice(0, -ks.suffix.length);
      if (base.length >= 2) {
        name = base;
        if (!type || type === 'string' || type === ks.type) {
          type = ks.type;
        }
        break;
      }
    }
  }

  const rawNorm = (type || 'string').toLowerCase().replace(/\[\]$/, '').replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
  const normType = typeMap[rawNorm] || (['int', 'float', 'string', 'boolean', 'date'].includes(rawNorm) ? rawNorm : 'string');

  return { name, type: normType };
}

/**
 * Parsea atributos especificados en prosa natural con soporte de dos puntos, comas y conjunciones
 * (ej: "matricula:string y activa:boolean" -> [{ name: 'matricula', type: 'string' }, { name: 'activa', type: 'boolean' }]).
 */
export function parseAttributesFromProse(rawAttrsText: string): Array<{ name: string; type: string }> {
  if (!rawAttrsText) return [];
  const parts = rawAttrsText
    .split(/(?:,\s*|\s+(?:y|and|e)\s+|;\s*)/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const results: Array<{ name: string; type: string }> = [];
  const typeCandidates = new Set([
    'string', 'str', 'texto',
    'int', 'integer', 'entero', 'numero', 'number',
    'float', 'double', 'decimal',
    'boolean', 'bool', 'booleano',
    'date', 'datetime', 'fecha',
    'void'
  ]);

  for (const part of parts) {
    let name = '';
    let type = 'string';
    if (part.includes(':')) {
      const sub = part.split(':');
      name = sub[0]?.trim() || '';
      type = sub[1]?.trim() || 'string';
    } else {
      const words = part.split(/\s+/).filter(Boolean);
      if (words.length === 2) {
        if (typeCandidates.has(words[1]!.toLowerCase())) {
          name = words[0]!;
          type = words[1]!;
        } else if (typeCandidates.has(words[0]!.toLowerCase())) {
          name = words[1]!;
          type = words[0]!;
        } else {
          name = words[0]!;
        }
      } else {
        name = part;
      }
    }
    if (name) {
      const sanitized = sanitizeAttributeNameAndType(name, type);
      if (sanitized.name) {
        results.push(sanitized);
      }
    }
  }
  return results;
}

/**
 * Genera atributos de dominio realistas para evitar clases vacías cuando el LLM omite attributes.
 */
export function generateDefaultAttributesForClass(className: string): Array<{ name: string; type: string }> {
  const lower = className.toLowerCase();
  if (/(?:usuario|user|cliente|client|persona|person|profesor|docente|empleado|employee|alumno|estudiante|student|socio|member|chofer|driver|pasajero|passenger)/i.test(lower)) {
    return [
      { name: 'id', type: 'int' },
      { name: 'nombre', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'estado', type: 'string' },
    ];
  }
  if (/(?:producto|product|articulo|item|prenda|mercad|material|insumo|medicamento)/i.test(lower)) {
    return [
      { name: 'codigo', type: 'string' },
      { name: 'nombre', type: 'string' },
      { name: 'precio', type: 'float' },
      { name: 'stock', type: 'int' },
    ];
  }
  if (/(?:pedido|order|factura|invoice|venta|sale|compra|purchase|comprobante|recibo|ticket|reserva|booking|alquiler|renta)/i.test(lower)) {
    return [
      { name: 'numero', type: 'string' },
      { name: 'fecha', type: 'date' },
      { name: 'total', type: 'float' },
      { name: 'estado', type: 'string' },
    ];
  }
  if (/(?:detalle|detail|linea|itempedido|orderitem)/i.test(lower)) {
    return [
      { name: 'cantidad', type: 'int' },
      { name: 'precioUnitario', type: 'float' },
      { name: 'subtotal', type: 'float' },
    ];
  }
  if (/(?:carrito|cart|cesta|basket)/i.test(lower)) {
    return [
      { name: 'id', type: 'int' },
      { name: 'fechaCreacion', type: 'date' },
      { name: 'total', type: 'float' },
    ];
  }
  if (/(?:pago|payment|cobro|transaccion|transaction)/i.test(lower)) {
    return [
      { name: 'transaccionId', type: 'string' },
      { name: 'monto', type: 'float' },
      { name: 'metodo', type: 'string' },
      { name: 'fecha', type: 'date' },
    ];
  }
  if (/(?:categoria|category|departamento|seccion|area)/i.test(lower)) {
    return [
      { name: 'id', type: 'int' },
      { name: 'nombre', type: 'string' },
      { name: 'descripcion', type: 'string' },
    ];
  }
  const cleanPrefix = lower.replace(/[^a-z0-9]/gi, '') || 'item';
  return [
    { name: `${cleanPrefix}Id`, type: 'int' },
    { name: 'nombre', type: 'string' },
    { name: 'estado', type: 'string' },
  ];
}

/**
 * Evalúa si una relación de composición es semánticamente válida según principios OOAD.
 * En UML, la composición exige dependencia existencial estricta (el ciclo de vida de la parte depende del todo).
 */
export function classExactOrPluralMatches(a: string, b: string): boolean {
  const w = a.toLowerCase().trim();
  const c = b.toLowerCase().trim();
  if (!w || !c) return false;
  if (w === c) return true;
  if (w.endsWith('s') && w.slice(0, -1) === c) return true;
  if (c.endsWith('s') && c.slice(0, -1) === w) return true;
  if (w.endsWith('es') && w.slice(0, -2) === c) return true;
  if (c.endsWith('es') && c.slice(0, -2) === w) return true;
  return false;
}

export function classWordMatches(word: string, className: string): boolean {
  const w = word.toLowerCase().trim();
  const c = className.toLowerCase().trim();
  if (!w || !c) return false;
  if (w === c) return true;
  if (w.endsWith('s') && w.slice(0, -1) === c) return true;
  if (c.endsWith('s') && c.slice(0, -1) === w) return true;
  if (w.endsWith('es') && w.slice(0, -2) === c) return true;
  if (c.endsWith('es') && c.slice(0, -2) === w) return true;
  const cleanW = w.replace(/es$|s$/, '');
  const cleanC = c.replace(/es$|s$/, '');
  if (cleanW.length >= 4 && cleanC.includes(cleanW)) return true;
  if (cleanC.length >= 4 && cleanW.includes(cleanC)) return true;
  return false;
}

/**
 * Extrae restricciones explícitas de multiplicidad especificadas en lenguaje natural en el mensaje del usuario.
 * Respeta directivas como "un cliente tiene muchos turnos", "cada turno pertenece a un solo cliente", "uno o muchos", "1 a muchos".
 */
export function extractExplicitMultiplicities(
  text: string,
  sourceName: string,
  targetName: string
): { sourceMultiplicity?: string; targetMultiplicity?: string } | null {
  if (!text || !sourceName || !targetName) return null;
  const lower = text.toLowerCase();

  let multForSource: string | undefined;
  let multForTarget: string | undefined;

  // Direct 1:1, N:M or 1:N patterns
  if (/\b(?:1\s*:\s*1|uno\s+a\s+uno|1\s+a\s+1|one\s+to\s+one)\b/i.test(lower)) {
    multForSource = '1';
    multForTarget = '1';
  } else if (/\b(?:muchos\s+a\s+muchos|n\s*:\s*m|m\s*:\s*n|\*\s*a\s*\*|\*\s*:\s*\*)\b/i.test(lower)) {
    multForSource = '0..*';
    multForTarget = '0..*';
  } else {
    // Direct numeric UML multiplicity ranges: e.g. "1 a 0..*", "1 a 1..*", "0..1 a *", "1 a n", "1 a 0..n"
    const directRangeMatch = lower.match(/(?:^|[^\w.])(0\.\.1|0\.\.\*|1\.\.\*|0\.\.n|1\.\.n|1|0|\*)\s*(?:a|to|:)\s*(0\.\.1|0\.\.\*|1\.\.\*|0\.\.n|1\.\.n|1|0|\*|n|m)(?=$|[^\w.])/i);
    if (directRangeMatch) {
      let rawSrc = directRangeMatch[1]!.replace(/n/gi, '*');
      let rawTgt = directRangeMatch[2]!.replace(/n/gi, '*');
      multForSource = rawSrc === '*' ? '0..*' : rawSrc;
      multForTarget = rawTgt === '*' ? '0..*' : rawTgt;
    }
  }

  // 1. Patrón: "[X] <verbo> (muchos|muchas|varios|varias|uno o muchos|uno o mas|1 o mas|1 o muchos|0..*|1..*) [Y]"
  const hasManyRegex = /(?:un|una|cada|el|la)?\s*([a-záéíóúñ]+)\s+(?:tiene|posee|contiene|incluye|guarda|opera|alberga|administra|gestiona|recibe|atiende|registra|aloja|[a-záéíóúñ]{3,15})\s+(uno\s+o\s+muchos|uno\s+o\s+m[aá]s|una\s+o\s+muchas|una\s+o\s+m[aá]s|1\s+o\s+muchos|1\s+o\s+m[aá]s|muchos|muchas|varios|varias|0\.\.\*|1\.\.\*)\s+([a-záéíóúñ]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = hasManyRegex.exec(lower)) !== null) {
    const subj = match[1]!;
    const quantifier = match[2]!;
    const obj = match[3]!;
    const targetIsOneOrMany = /uno\s+o|1\s+o|1\.\.\*/i.test(quantifier);
    const targetMult = targetIsOneOrMany ? '1..*' : '0..*';

    if (classWordMatches(subj, sourceName) && classWordMatches(obj, targetName)) {
      multForSource = multForSource ?? '1';
      multForTarget = targetMult;
    } else if (classWordMatches(subj, targetName) && classWordMatches(obj, sourceName)) {
      multForTarget = multForTarget ?? '1';
      multForSource = targetMult;
    }
  }

  // 2. Patrón: "[Y] <verbo pertenencia/origen> (un solo|un unico|exactamente un|1) [X]"
  const belongsToOneRegex = /(?:cada|un|una)?\s*([a-záéíóúñ]+)\s+(?:pertenece\s+a|corresponde\s+a|est[aá]\s+asociad[ao]\s+a|despega\s+(?:desde|de)|sale\s+de|opera\s+en|trabaja\s+en|se\s+asocia\s+a|se\s+vincula\s+a)\s+(?:un\s+[uú]nico|una\s+[uú]nica|un\s+solo|una\s+sola|exactamente\s+un[ao]?|solo\s+un[ao]?|un[ao]?|1)\s+([a-záéíóúñ]+)/gi;
  while ((match = belongsToOneRegex.exec(lower)) !== null) {
    const item = match[1]!;
    const owner = match[2]!;

    if (classWordMatches(owner, sourceName) && classWordMatches(item, targetName)) {
      multForSource = '1';
    } else if (classWordMatches(owner, targetName) && classWordMatches(item, sourceName)) {
      multForTarget = '1';
    }
  }

  // 3. Patrón: "[X] (tiene|posee) (un solo|un unico|exactamente un|1) [Y]"
  const hasOneRegex = /(?:cada|un|una)?\s*([a-záéíóúñ]+)\s+(?:tiene|posee)\s+(?:un\s+[uú]nico|una\s+[uú]nica|un\s+solo|una\s+sola|exactamente\s+un[ao]?|solo\s+un[ao]?|1)\s+([a-záéíóúñ]+)/gi;
  while ((match = hasOneRegex.exec(lower)) !== null) {
    const subj = match[1]!;
    const obj = match[2]!;

    if (classWordMatches(subj, sourceName) && classWordMatches(obj, targetName)) {
      multForTarget = '1';
    } else if (classWordMatches(subj, targetName) && classWordMatches(obj, sourceName)) {
      multForSource = '1';
    }
  }

  // 3. Frases directas de cardinalidad: "1 a muchos", "1:N", "uno a muchos"
  if (!multForSource && !multForTarget) {
    if (/\b(?:1\s*:\s*n|1\s+a\s+muchos|uno\s+a\s+muchos|1\s+a\s+n)\b/i.test(lower)) {
      multForSource = '1';
      multForTarget = '0..*';
    }
  }

  if (multForSource || multForTarget) {
    return {
      sourceMultiplicity: multForSource,
      targetMultiplicity: multForTarget,
    };
  }
  return null;
}

export function extractExplicitRequestedClasses(text?: string): string[] {
  if (!text) return [];
  const stopWords = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'en', 'con', 'a', 'to', 'for', 'in', 'of', 'and', 'y', 'asociacion', 'asociación']);
  const matches = Array.from(
    text.matchAll(/\b(?:clase|calse|clse|class|tabla)\s+(?:llamada\s+|llamado\s+|named\s+|de\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/gi)
  ).map((m) => cleanClassName(m[1])).filter((name) => !stopWords.has(name.toLowerCase()));
  return Array.from(new Set(matches.filter(Boolean)));
}

/**
 * Evalúa si una relación de composición es semánticamente válida según principios OOAD.
 * En UML, la composición exige dependencia existencial estricta (el ciclo de vida de la parte depende del todo).
 */
export function isHeuristicComposition(sourceName?: string, targetName?: string, hasAssocClass?: boolean): boolean {
  if (!targetName) return false;
  const s = (sourceName || '').toLowerCase().trim();
  const t = targetName.toLowerCase().trim();
  if (s === t) return false; // Una clase no puede componerse a sí misma

  if (hasAssocClass) return true;

  // Palabras clave que denotan inequívocamente entidades dependientes o partes subordinadas del todo
  const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte)/i;
  if (childPattern.test(t)) return true;

  // Si el destino es un prefijo o sufijo compuesto del origen (ej. Pedido -> PedidoItem)
  if (s && t.startsWith(s) && t.length > s.length) return true;

  return false;
}

/**
 * Convierte un modelo de dominio semántico abstracto (generado dinámicamente por el LLM)
 * en un BatchDelta de metamodelo UML canónico y validado con coordenadas espaciales.
 */
export function expandSemanticDomainToDelta(
  model: SemanticDomainModel,
  diagramId: string,
  currentDiagram?: any,
  originText?: string
): BatchDelta | null {
  const hasClasses = Array.isArray(model.classes) && model.classes.length > 0;
  const hasAssociations = Array.isArray(model.associations) && model.associations.length > 0;
  const hasGeneralizations = Array.isArray(model.generalizations) && model.generalizations.length > 0;
  const hasRealizations = Array.isArray(model.realizations) && model.realizations.length > 0;
  const hasDependencies = Array.isArray(model.dependencies) && model.dependencies.length > 0;
  const hasNary = Array.isArray(model.naryAssociations) && model.naryAssociations.length > 0;
  const hasRenames = !!model.renames && (
    (Array.isArray(model.renames.classes) && model.renames.classes.length > 0) ||
    (Array.isArray(model.renames.attributes) && model.renames.attributes.length > 0) ||
    (Array.isArray(model.renames.methods) && model.renames.methods.length > 0)
  );
  const hasUpdates = !!model.updates && (
    (Array.isArray(model.updates.classes) && model.updates.classes.length > 0) ||
    (Array.isArray(model.updates.attributes) && model.updates.attributes.length > 0) ||
    (Array.isArray(model.updates.methods) && model.updates.methods.length > 0) ||
    (Array.isArray(model.updates.associations) && model.updates.associations.length > 0) ||
    (Array.isArray(model.updates.generalizations) && model.updates.generalizations.length > 0) ||
    (Array.isArray(model.updates.realizations) && model.updates.realizations.length > 0) ||
    (Array.isArray(model.updates.dependencies) && model.updates.dependencies.length > 0) ||
    (Array.isArray(model.updates.naryAssociations) && model.updates.naryAssociations.length > 0) ||
    (Array.isArray(model.updates.positions) && model.updates.positions.length > 0)
  );
  const hasDeletions = !!model.deletions && (
    (Array.isArray(model.deletions.classes) && model.deletions.classes.length > 0) ||
    (Array.isArray(model.deletions.attributes) && model.deletions.attributes.length > 0) ||
    (Array.isArray(model.deletions.methods) && model.deletions.methods.length > 0) ||
    (Array.isArray(model.deletions.associations) && model.deletions.associations.length > 0) ||
    (Array.isArray(model.deletions.generalizations) && model.deletions.generalizations.length > 0) ||
    (Array.isArray(model.deletions.realizations) && model.deletions.realizations.length > 0) ||
    (Array.isArray(model.deletions.dependencies) && model.deletions.dependencies.length > 0) ||
    (Array.isArray(model.deletions.naryAssociations) && model.deletions.naryAssociations.length > 0)
  );

  if (!hasClasses && !hasAssociations && !hasGeneralizations && !hasRealizations && !hasDependencies && !hasNary && !hasRenames && !hasUpdates && !hasDeletions) {
    return null;
  }

  // 0. Si el usuario solicitó clases específicas de forma explícita, podar clases alucinadas y normalizar nombres contaminados
  if (originText && model.classes && model.classes.length > 0) {
    const explicitClasses = extractExplicitRequestedClasses(originText);
    if (explicitClasses.length > 0) {
      const lowerOrigin = originText.toLowerCase();

      // Si el modelo devolvió la misma cantidad de clases pero con nombres alterados por pocos disparos (ej. Pedido -> Factura)
      if (model.classes.length === explicitClasses.length) {
        for (let i = 0; i < model.classes.length; i++) {
          const c = model.classes[i]!;
          const match = explicitClasses.find((ec) => classExactOrPluralMatches(c.name, ec));
          if (!match) {
            const unassigned = explicitClasses.find((ec) => !model.classes!.some((mc) => classExactOrPluralMatches(mc.name, ec)));
            if (unassigned) {
              const oldName = c.name;
              c.name = unassigned;
              if (model.associations) {
                for (const a of model.associations) {
                  if (a.source === oldName) a.source = unassigned;
                  if (a.target === oldName) a.target = unassigned;
                }
              }
            }
          }
        }
      } else if (model.classes.length > explicitClasses.length) {
        // Filtrar clases fantasmas no solicitadas (ej. Cliente cuando sólo se pidió ReservaDeLibro)
        model.classes = model.classes.filter((c) => {
          const cName = cleanClassName(c.name).toLowerCase();
          if (explicitClasses.some((ec) => classWordMatches(cName, ec))) return true;
          if (lowerOrigin.includes(cName)) return true;
          if (currentDiagram?.classes?.some((dc: any) => dc.name.toLowerCase() === cName)) return true;
          return false;
        });
      }
    }
  }

  const timestamp = new Date().toISOString();
  const classIdMap = new Map<string, string>();
  const deltas: any[] = [];

  // Registrar clases existentes para resolver asociaciones mixtas y actualizar atributos existentes
  const existingClassesMap = new Map<string, any>();
  if (currentDiagram?.classes && Array.isArray(currentDiagram.classes)) {
    for (const ec of currentDiagram.classes) {
      if (ec.id && ec.name) {
        const cleaned = cleanClassName(ec.name);
        const lower = cleaned.toLowerCase();
        const canon = toCanonicalKey(cleaned);
        classIdMap.set(canon, ec.id);
        classIdMap.set(lower, ec.id);
        existingClassesMap.set(canon, ec);
        existingClassesMap.set(lower, ec);
      }
    }
  }

  const resolveClassId = (rawName?: string): string | undefined => {
    if (!rawName) return undefined;
    const cleaned = cleanClassName(rawName);
    const lower = cleaned.toLowerCase();
    const canon = toCanonicalKey(cleaned);
    if (classIdMap.has(canon)) return classIdMap.get(canon);
    if (classIdMap.has(lower)) return classIdMap.get(lower);
    if (lower.endsWith('es') && classIdMap.has(lower.slice(0, -2))) return classIdMap.get(lower.slice(0, -2));
    if (lower.endsWith('s') && classIdMap.has(lower.slice(0, -1))) return classIdMap.get(lower.slice(0, -1));
    if (classIdMap.has(lower + 's')) return classIdMap.get(lower + 's');
    if (classIdMap.has(lower + 'es')) return classIdMap.get(lower + 'es');
    return undefined;
  };

  // Clave canónica de pares para asegurar unicidad absoluta de aristas entre dos clases
  const getPairKey = (idA: string, idB: string): string => [idA, idB].sort().join('::');
  const seenConnectedPairs = new Set<string>();

  // Pre-cargar relaciones existentes para no crear aristas redundantes
  if (currentDiagram?.generalizations && Array.isArray(currentDiagram.generalizations)) {
    for (const g of currentDiagram.generalizations) {
      if (g.subClassId && g.superClassId) {
        const isBeingDeleted = model.deletions?.generalizations?.some((dg) => {
          const sId = resolveClassId(dg.subclass);
          const supId = resolveClassId(dg.superclass);
          return (sId === g.subClassId && supId === g.superClassId) || (sId === g.superClassId && supId === g.subClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(g.subClassId, g.superClassId));
        }
      }
    }
  }
  if (currentDiagram?.realizations && Array.isArray(currentDiagram.realizations)) {
    for (const r of currentDiagram.realizations) {
      if (r.clientClassId && r.supplierInterfaceId) {
        const isBeingDeleted = model.deletions?.realizations?.some((dr) => {
          const cId = resolveClassId(dr.clientClass);
          const supId = resolveClassId(dr.supplierInterface);
          return (cId === r.clientClassId && supId === r.supplierInterfaceId) || (cId === r.supplierInterfaceId && supId === r.clientClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(r.clientClassId, r.supplierInterfaceId));
        }
      }
    }
  }
  if (currentDiagram?.dependencies && Array.isArray(currentDiagram.dependencies)) {
    for (const d of currentDiagram.dependencies) {
      if (d.clientClassId && d.supplierClassId) {
        const isBeingDeleted = model.deletions?.dependencies?.some((dd) => {
          const cId = resolveClassId(dd.clientClass);
          const supId = resolveClassId(dd.supplierClass);
          return (cId === d.clientClassId && supId === d.supplierClassId) || (cId === d.supplierClassId && supId === d.clientClassId);
        });
        if (!isBeingDeleted) {
          seenConnectedPairs.add(getPairKey(d.clientClassId, d.supplierClassId));
        }
      }
    }
  }

  // 0a. Renombrados de Clases, Atributos y Métodos
  if (model.renames) {
    if (Array.isArray(model.renames.classes)) {
      for (const r of model.renames.classes) {
        const classId = resolveClassId(r.from);
        if (classId) {
          const cleanTo = cleanClassName(r.to);
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'rename',
            classId,
            newName: cleanTo,
          });
          // Actualizar mapas de símbolos en caliente
          const toLower = cleanTo.toLowerCase();
          const toCanon = toCanonicalKey(cleanTo);
          classIdMap.set(toCanon, classId);
          classIdMap.set(toLower, classId);
          for (const ec of existingClassesMap.values()) {
            if (ec.id === classId) {
              ec.name = cleanTo;
              existingClassesMap.set(toCanon, ec);
              existingClassesMap.set(toLower, ec);
            }
          }
        }
      }
    }

    if (Array.isArray(model.renames.attributes)) {
      for (const r of model.renames.attributes) {
        const classId = resolveClassId(r.class);
        if (classId) {
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          if (ec && Array.isArray(ec.attributes)) {
            const fromLower = r.from.trim().toLowerCase();
            const attr = ec.attributes.find((a: any) => a.name && a.name.trim().toLowerCase() === fromLower);
            if (attr) {
              const cleanTo = r.to.trim().replace(/^[-+*#~]\s*/, '').replace(/\s+/g, '');
              deltas.push({
                id: crypto.randomUUID(),
                diagramId,
                timestamp,
                kind: 'member',
                op: 'editAttribute',
                classId,
                memberId: attr.id,
                name: cleanTo,
                type: attr.type,
                visibility: attr.visibility,
                isStatic: attr.isStatic,
                isDerived: attr.isDerived,
              });
              attr.name = cleanTo;
            }
          }
        }
      }
    }

    if (Array.isArray(model.renames.methods)) {
      for (const r of model.renames.methods) {
        const classId = resolveClassId(r.class);
        if (classId) {
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          if (ec && Array.isArray(ec.methods)) {
            const fromLower = r.from.trim().toLowerCase();
            const meth = ec.methods.find((m: any) => m.name && m.name.trim().toLowerCase() === fromLower);
            if (meth) {
              const cleanTo = r.to.trim().replace(/\s+/g, '');
              deltas.push({
                id: crypto.randomUUID(),
                diagramId,
                timestamp,
                kind: 'member',
                op: 'editMethod',
                classId,
                memberId: meth.id,
                name: cleanTo,
                returnType: meth.returnType,
                parameters: meth.parameters,
                visibility: meth.visibility,
                isStatic: meth.isStatic,
              });
              meth.name = cleanTo;
            }
          }
        }
      }
    }
  }

  // 0b. Actualizaciones explícitas (updates de clases, miembros, relaciones y posiciones)
  if (model.updates) {
    if (Array.isArray(model.updates.classes)) {
      for (const u of model.updates.classes) {
        const classId = resolveClassId(u.name);
        if (classId) {
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          const targetKind = u.classKind ?? ec?.classKind ?? 'class';
          const targetAbstract = u.isAbstract !== undefined ? u.isAbstract : (ec?.isAbstract ?? false);
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'update',
            classId,
            classKind: targetKind,
            isAbstract: targetAbstract,
          });
          if (ec) {
            ec.classKind = targetKind;
            ec.isAbstract = targetAbstract;
          }
        }
      }
    }

    if (Array.isArray(model.updates.positions)) {
      for (const p of model.updates.positions) {
        const classId = resolveClassId(p.class);
        if (classId) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'reposition',
            classId,
            newPosition: { x: p.x, y: p.y },
          });
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          if (ec) {
            ec.position = { x: p.x, y: p.y };
          }
        }
      }
    }

    if (Array.isArray(model.updates.attributes)) {
      for (const u of model.updates.attributes) {
        const classId = resolveClassId(u.class);
        if (classId) {
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          if (ec && Array.isArray(ec.attributes)) {
            const attr = ec.attributes.find((a: any) => a.name && a.name.trim().toLowerCase() === u.name.trim().toLowerCase());
            if (attr) {
              const cleanType = u.type ? (['int', 'float', 'string', 'boolean', 'date'].includes(u.type.toLowerCase()) ? u.type.toLowerCase() : (u.type === 'number' ? 'float' : 'string')) : attr.type;
              deltas.push({
                id: crypto.randomUUID(),
                diagramId,
                timestamp,
                kind: 'member',
                op: 'editAttribute',
                classId,
                memberId: attr.id,
                name: u.newName ? u.newName.trim() : attr.name,
                type: cleanType,
                visibility: u.visibility ?? attr.visibility,
                isStatic: u.isStatic !== undefined ? u.isStatic : attr.isStatic,
                isDerived: u.isDerived !== undefined ? u.isDerived : attr.isDerived,
                multiplicity: u.multiplicity ?? attr.multiplicity,
              });
            }
          }
        }
      }
    }

    if (Array.isArray(model.updates.methods)) {
      for (const u of model.updates.methods) {
        const classId = resolveClassId(u.class);
        if (classId) {
          const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
          if (ec && Array.isArray(ec.methods)) {
            const meth = ec.methods.find((m: any) => m.name && m.name.trim().toLowerCase() === u.name.trim().toLowerCase());
            if (meth) {
              deltas.push({
                id: crypto.randomUUID(),
                diagramId,
                timestamp,
                kind: 'member',
                op: 'editMethod',
                classId,
                memberId: meth.id,
                name: u.newName ? u.newName.trim() : meth.name,
                returnType: u.returnType ?? meth.returnType,
                parameters: u.parameters ?? meth.parameters,
                visibility: u.visibility ?? meth.visibility,
                isStatic: u.isStatic !== undefined ? u.isStatic : meth.isStatic,
              });
            }
          }
        }
      }
    }

    if (Array.isArray(model.updates.associations)) {
      for (const u of model.updates.associations) {
        const sourceId = resolveClassId(u.source);
        const targetId = resolveClassId(u.target);
        if (sourceId && targetId) {
          const isRecursive = sourceId === targetId;
          const existingAssoc = currentDiagram?.associations?.find((a: any) => {
            if (isRecursive) return a.sourceClassId === sourceId && a.targetClassId === sourceId;
            return (
              (a.sourceClassId === sourceId && a.targetClassId === targetId) ||
              (a.sourceClassId === targetId && a.targetClassId === sourceId)
            );
          });
          if (existingAssoc) {
            let assocClassId = u.associationClass ? resolveClassId(u.associationClass) : undefined;
            if (u.associationClass && !assocClassId && model.classes) {
              const mc = model.classes.find((c) => c.name.toLowerCase() === u.associationClass!.toLowerCase());
              if (mc) {
                assocClassId = crypto.randomUUID();
                const clean = cleanClassName(mc.name);
                classIdMap.set(toCanonicalKey(clean), assocClassId);
                classIdMap.set(clean.toLowerCase(), assocClassId);
              }
            }
            const updateDelta: any = {
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'association',
              op: 'updateMultiplicity',
              associationId: existingAssoc.id,
              aggregation: u.aggregation ?? existingAssoc.aggregation ?? 'none',
              aggregationEnd: u.aggregationEnd ?? existingAssoc.aggregationEnd ?? 'source',
            };
            if (u.sourceMultiplicity) updateDelta.newSourceMultiplicity = cleanMultiplicity(u.sourceMultiplicity);
            if (u.targetMultiplicity) updateDelta.newTargetMultiplicity = cleanMultiplicity(u.targetMultiplicity);
            if (u.name !== undefined) updateDelta.name = u.name;
            if (u.sourceRole !== undefined) updateDelta.sourceRole = u.sourceRole;
            if (u.targetRole !== undefined) updateDelta.targetRole = u.targetRole;
            if (assocClassId) {
              updateDelta.newAssociationClassId = assocClassId;
              updateDelta.associationClassId = assocClassId;
            } else if (u.associationClass === null) {
              updateDelta.newAssociationClassId = null;
            }
            deltas.push(updateDelta);
            const pair = isRecursive ? `${sourceId}::${sourceId}` : getPairKey(sourceId, targetId);
            seenConnectedPairs.add(pair);
          }
        }
      }
    }

    if (Array.isArray(model.updates.generalizations) && currentDiagram?.generalizations) {
      for (const u of model.updates.generalizations) {
        const subId = resolveClassId(u.subclass);
        const superId = resolveClassId(u.superclass);
        if (subId && superId) {
          const gen = currentDiagram.generalizations.find((g: any) => g.subClassId === subId && g.superClassId === superId);
          if (gen && u.name !== undefined) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'generalization',
              op: 'update',
              generalizationId: gen.id,
              name: u.name,
            });
          }
        }
      }
    }

    if (Array.isArray(model.updates.realizations) && currentDiagram?.realizations) {
      for (const u of model.updates.realizations) {
        const client = resolveClassId(u.clientClass);
        const supplier = resolveClassId(u.supplierInterface);
        if (client && supplier) {
          const r = currentDiagram.realizations.find((rel: any) => rel.clientClassId === client && rel.supplierInterfaceId === supplier);
          if (r && u.name !== undefined) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'realization',
              op: 'update',
              realizationId: r.id,
              name: u.name,
            });
          }
        }
      }
    }

    if (Array.isArray(model.updates.dependencies) && currentDiagram?.dependencies) {
      for (const u of model.updates.dependencies) {
        const client = resolveClassId(u.client);
        const supplier = resolveClassId(u.supplier);
        if (client && supplier) {
          const d = currentDiagram.dependencies.find((dep: any) => dep.clientClassId === client && dep.supplierClassId === supplier);
          if (d && u.name !== undefined) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'dependency',
              op: 'update',
              dependencyId: d.id,
              name: u.name,
            });
          }
        }
      }
    }

    if (Array.isArray(model.updates.naryAssociations) && currentDiagram?.naryAssociations) {
      for (const u of model.updates.naryAssociations) {
        const nary = currentDiagram.naryAssociations.find((n: any) => (u.naryAssociationId && n.id === u.naryAssociationId) || (u.name && n.name === u.name));
        if (nary) {
          const updateDelta: any = {
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'naryAssociation',
            op: 'update',
            naryAssociationId: nary.id,
          };
          if (u.name !== undefined) updateDelta.name = u.name;
          if (Array.isArray(u.memberEnds)) {
            const mappedEnds: any[] = [];
            for (const me of u.memberEnds) {
              const cid = resolveClassId(me.class);
              if (cid) {
                mappedEnds.push({
                  classId: cid,
                  multiplicity: cleanMultiplicity(me.multiplicity, '1'),
                  role: me.role,
                });
              }
            }
            if (mappedEnds.length >= 3) {
              updateDelta.memberEnds = mappedEnds;
            }
          }
          deltas.push(updateDelta);
        }
      }
    }
  }

  // 1. Crear clases nuevas o modificar existentes
  const cols = 2;
  const existingCount = currentDiagram?.classes?.length ?? 0;
  if (hasClasses) {
    model.classes!.forEach((cls, idx) => {
      const cleanName = cleanClassName(cls.name);
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();
      const canon = toCanonicalKey(cleanName);
      const existingClass = existingClassesMap.get(canon) ?? existingClassesMap.get(lower);

      let classId: string;
      if (existingClass) {
        classId = existingClass.id;
        classIdMap.set(canon, classId);
        classIdMap.set(lower, classId);
        // Si pide marcar abstracta o cambiar a interfaz
        if (cls.isAbstract !== undefined || cls.isInterface !== undefined) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'update',
            classId,
            isAbstract: cls.isAbstract ?? existingClass.isAbstract ?? false,
            classKind: cls.isInterface ? 'interface' : (existingClass.classKind ?? 'class'),
          });
        }
      } else {
        classId = classIdMap.get(canon) ?? classIdMap.get(lower) ?? crypto.randomUUID();
        classIdMap.set(canon, classId);
        classIdMap.set(lower, classId);

        let x: number;
        let y: number;
        if (currentDiagram?.classes && currentDiagram.classes.length > 0) {
          let relatedExistingClass: any = null;
          if (Array.isArray(model.associations)) {
            const relatedAssoc = model.associations.find((a: any) => {
              const src = toCanonicalKey(typeof a.source === 'object' ? a.source?.name : a.source);
              const tgt = toCanonicalKey(typeof a.target === 'object' ? a.target?.name : a.target);
              return src === canon || tgt === canon;
            });
            if (relatedAssoc) {
              const src = toCanonicalKey(typeof relatedAssoc.source === 'object' ? relatedAssoc.source?.name : relatedAssoc.source);
              const otherCanon = src === canon
                ? toCanonicalKey(typeof relatedAssoc.target === 'object' ? relatedAssoc.target?.name : relatedAssoc.target)
                : src;
              relatedExistingClass = existingClassesMap.get(otherCanon);
            }
          }

          if (relatedExistingClass?.position) {
            x = (relatedExistingClass.position.x ?? 200) + 320;
            y = (relatedExistingClass.position.y ?? 150) + idx * 80;
          } else {
            const maxX = Math.max(...currentDiagram.classes.map((c: any) => c.position?.x ?? 100));
            const minY = Math.min(...currentDiagram.classes.map((c: any) => c.position?.y ?? 100));
            x = maxX + 320;
            y = minY + idx * 240;
          }
        } else {
          const posIdx = idx;
          x = 120 + (posIdx % cols) * 360;
          y = 120 + Math.floor(posIdx / cols) * 260;
        }

        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'class',
          op: 'create',
          classId,
          name: cleanName,
          classKind: cls.isInterface ? 'interface' : 'class',
          isAbstract: !!cls.isAbstract,
          position: { x, y },
        });
      }

      // Atributos de la clase (soporta formato compacto "nombre:tipo", array de objetos, strings con comas y alias en español)
      const rawAttrs = cls.attributes ?? (cls as any).atributos ?? (cls as any).properties ?? (cls as any).fields ?? (cls as any).campos;
      const attrList: any[] = [];
      if (Array.isArray(rawAttrs)) {
        for (const item of rawAttrs) {
          if (typeof item === 'string') {
            const cleaned = item.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
            const parts = cleaned.split(/,\s*(?=[a-zA-Z_])/);
            for (const p of parts) {
              const subParts = p.split(':');
              const sanitized = sanitizeAttributeNameAndType(subParts[0] || '', subParts[1] || 'string');
              if (sanitized.name) attrList.push(sanitized);
            }
          } else if (item && typeof item === 'object') {
            attrList.push(item);
          }
        }
      } else if (rawAttrs && typeof rawAttrs === 'object') {
        for (const [k, v] of Object.entries(rawAttrs)) {
          attrList.push({ name: k, type: typeof v === 'string' ? v : 'string' });
        }
      }

      // Si la clase no tiene atributos suficientes o vino vacía del LLM, asegurar atributos mínimos realistas
      if (attrList.length === 0 && !existingClass) {
        attrList.push(...generateDefaultAttributesForClass(cleanName));
      }

      attrList.forEach((attr: any) => {
        let name = '';
        let type = 'string';
        let visibility: '+' | '-' | '#' | '~' = '+';
        let isStatic = false;
        let isDerived = false;

        if (typeof attr === 'string') {
          const parts = attr.split(':');
          name = parts[0]?.trim() ?? '';
          type = parts[1]?.trim() ?? 'string';
        } else if (attr && typeof attr === 'object') {
          name = attr.name ?? '';
          type = attr.type ?? 'string';
          if (attr.visibility) visibility = attr.visibility;
          if (attr.isStatic !== undefined) isStatic = !!attr.isStatic;
          if (attr.isDerived !== undefined) isDerived = !!attr.isDerived;
        }

        // Sanitizar si el modelo devolvió "nombre:string" o sufijos pegados adheridos dentro del campo name
        const sanitized = sanitizeAttributeNameAndType(name, type);
        name = sanitized.name;
        type = sanitized.type;
        if (!name) return;
        // Ignorar placeholders literales del esquema como "type", "string", "int", "attribute", "date"
        if (/^(type|tipo|string|int|float|boolean|attribute|attr|date)$/i.test(name)) return;
        if (name.toLowerCase() === 'name' && type.toLowerCase() === 'string' && attrList.length > 3) return;

        const rawType = type.toLowerCase().trim().replace(/\[\]$/, '').replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
        const cleanType = ['int', 'float', 'string', 'boolean', 'date'].includes(rawType)
          ? rawType
          : rawType === 'number' || rawType === 'double' || rawType === 'decimal' ? 'float' : 'string';

        // Si la clase ya existía en el lienzo, evitar duplicar atributos y emitir editAttribute si cambió el tipo
        if (existingClass && Array.isArray(existingClass.attributes)) {
          const existingAttr = existingClass.attributes.find(
            (ea: any) => ea.name && ea.name.toLowerCase().trim() === name.toLowerCase()
          );
          if (existingAttr) {
            if (cleanType && cleanType !== existingAttr.type) {
              deltas.push({
                id: crypto.randomUUID(),
                diagramId,
                timestamp,
                kind: 'member',
                op: 'editAttribute',
                classId,
                memberId: existingAttr.id,
                name: existingAttr.name,
                type: cleanType,
                visibility: existingAttr.visibility ?? visibility,
                isStatic: existingAttr.isStatic ?? isStatic,
                isDerived: existingAttr.isDerived ?? isDerived,
              });
            }
            return;
          }
        }

        // Evitar duplicados dentro del mismo lote para esta clase
        const alreadyInBatch = deltas.some(
          (d: any) => d.kind === 'member' && d.classId === classId && d.name && d.name.toLowerCase() === name.toLowerCase()
        );
        if (alreadyInBatch) return;

        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'member',
          op: 'addAttribute',
          classId,
          memberId: crypto.randomUUID(),
          name,
          type: cleanType,
          visibility,
          isStatic,
          isDerived,
        });
      });

      // Métodos de la clase
      if (Array.isArray(cls.methods)) {
        cls.methods.forEach((m: any) => {
          let mName = '';
          let returnType = 'void';
          let visibility: '+' | '-' | '#' | '~' = '+';
          let isStatic = false;
          let parameters: Array<{ name: string; type: string }> = [];

          if (typeof m === 'string') {
            mName = m.replace(/\(\)$/, '').trim();
          } else if (m && typeof m === 'object') {
            mName = m.name ?? '';
            returnType = m.returnType ?? 'void';
            if (m.visibility) visibility = m.visibility;
            if (m.isStatic !== undefined) isStatic = !!m.isStatic;
            if (Array.isArray(m.parameters)) parameters = m.parameters;
          }

          if (mName.includes(':')) {
            const parts = mName.split(':');
            mName = parts[0]?.trim() ?? '';
            const embeddedRet = parts[1]?.trim();
            if (embeddedRet && (!returnType || returnType === 'void')) {
              returnType = embeddedRet;
            }
          }
          mName = mName.trim().replace(/\s+/g, '');
          if (!mName) return;

          // Si ya existía el método en la clase, evitar duplicar o emitir editMethod si cambió returnType
          if (existingClass && Array.isArray(existingClass.methods)) {
            const existingMethod = existingClass.methods.find(
              (em: any) => em.name && em.name.toLowerCase().trim() === mName.toLowerCase()
            );
            if (existingMethod) {
              if (returnType && returnType !== existingMethod.returnType) {
                deltas.push({
                  id: crypto.randomUUID(),
                  diagramId,
                  timestamp,
                  kind: 'member',
                  op: 'editMethod',
                  classId,
                  memberId: existingMethod.id,
                  name: existingMethod.name,
                  returnType,
                  parameters: parameters.length > 0 ? parameters : (existingMethod.parameters ?? []),
                  visibility: existingMethod.visibility ?? visibility,
                  isStatic: existingMethod.isStatic ?? isStatic,
                });
              }
              return;
            }
          }

          const alreadyMethodInBatch = deltas.some(
            (d: any) => d.kind === 'member' && d.classId === classId && d.name && d.name.toLowerCase() === mName.toLowerCase()
          );
          if (alreadyMethodInBatch) return;

          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'addMethod',
            classId,
            memberId: crypto.randomUUID(),
            name: mName,
            returnType,
            parameters,
            visibility,
            isStatic,
          });
        });
      }
    });
  }


  // 2. Procesar primero las GENERALIZACIONES (herencia OOAD: "is-a")
  // La herencia es la relación estructural más fuerte en OOAD: tiene precedencia absoluta sobre asociaciones
  const pendingGeneralizations: Array<{ subclass: string; superclass: string; name?: string }> = [];

  if (Array.isArray(model.generalizations)) {
    for (const g of model.generalizations) {
      if (g.subclass && g.superclass) {
        pendingGeneralizations.push({
          subclass: g.subclass,
          superclass: g.superclass,
          name: g.name,
        });
      }
    }
  }

  // Si en model.associations el LLM etiquetó alguna relación como herencia/generalización
  if (Array.isArray(model.associations)) {
    for (const assoc of model.associations) {
      const isGen =
        (assoc.name && /^(generaliz|hered|herencia|is_a|subclass)/i.test(assoc.name)) ||
        ((assoc as any).type && /^(generaliz|hered|herencia|is_a|subclass)/i.test((assoc as any).type));
      if (isGen && assoc.source && assoc.target) {
        pendingGeneralizations.push({
          subclass: assoc.source,
          superclass: assoc.target,
          name: assoc.name,
        });
      }
    }
  }

  for (const gen of pendingGeneralizations) {
    const subId = resolveClassId(gen.subclass);
    const superId = resolveClassId(gen.superclass);
    if (!subId || !superId || subId === superId) continue;
    const pair = getPairKey(subId, superId);
    if (seenConnectedPairs.has(pair)) continue;

    deltas.push({
      id: crypto.randomUUID(),
      diagramId,
      timestamp,
      kind: 'generalization',
      op: 'create',
      generalizationId: crypto.randomUUID(),
      subClassId: subId,
      superClassId: superId,
      name: gen.name,
    });
    seenConnectedPairs.add(pair);
  }

  // 3. Realizaciones explícitas (implementación de interfaz)
  if (Array.isArray(model.realizations)) {
    model.realizations.forEach((r) => {
      const client = resolveClassId(r.clientClass);
      const supplier = resolveClassId(r.supplierInterface);
      if (!client || !supplier || client === supplier) return;
      const pair = getPairKey(client, supplier);
      if (seenConnectedPairs.has(pair)) return;

      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'realization',
        op: 'create',
        realizationId: crypto.randomUUID(),
        clientClassId: client,
        supplierInterfaceId: supplier,
        name: r.name,
      });
      seenConnectedPairs.add(pair);
    });
  }

  // 4. Dependencias explícitas
  if (Array.isArray(model.dependencies)) {
    model.dependencies.forEach((d) => {
      const client = resolveClassId(d.client);
      const supplier = resolveClassId(d.supplier);
      if (!client || !supplier || client === supplier) return;
      const pair = getPairKey(client, supplier);
      if (seenConnectedPairs.has(pair)) return;

      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'dependency',
        op: 'create',
        dependencyId: crypto.randomUUID(),
        clientClassId: client,
        supplierClassId: supplier,
        name: d.name,
      });
      seenConnectedPairs.add(pair);
    });
  }

  // 5. Asociaciones, composiciones y agregaciones
  if (Array.isArray(model.associations)) {
    model.associations.forEach((assoc) => {
      // Si era una generalización o realización ya procesada
      const isGen =
        (assoc.name && /^(generaliz|hered|herencia|is_a|subclass)/i.test(assoc.name)) ||
        ((assoc as any).type && /^(generaliz|hered|herencia|is_a|subclass)/i.test((assoc as any).type));
      if (isGen) return;

      const isRealiz = assoc.name && /^(implement|realiz)/i.test(assoc.name);
      if (isRealiz) return;

      const isDep = assoc.name && /^(depend|usa|uses)/i.test(assoc.name);
      if (isDep) return;

      const sourceId = resolveClassId(assoc.source);
      const targetId = resolveClassId(assoc.target);

      if (!sourceId || !targetId) return;

      const isRecursive = sourceId === targetId;
      const pair = isRecursive ? `${sourceId}::${sourceId}` : getPairKey(sourceId, targetId);
      // CERO DUPLICADOS: Si este par ya tiene generalización, realización o asociación previa en ESTE LOTE, DESCARTAR
      if (seenConnectedPairs.has(pair)) return;

      let assocClassId = assoc.associationClass
        ? resolveClassId(assoc.associationClass)
        : undefined;

      // Si la clase de asociación intermedia no fue creada aún, crearla explícitamente en el lote
      if (assoc.associationClass && !assocClassId) {
        const acName = cleanClassName(assoc.associationClass);
        const acLower = acName.toLowerCase();
        const acCanon = toCanonicalKey(acName);
        assocClassId = crypto.randomUUID();
        classIdMap.set(acCanon, assocClassId);
        classIdMap.set(acLower, assocClassId);
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'class',
          op: 'create',
          classId: assocClassId,
          name: acName,
          classKind: 'class',
          isAbstract: false,
          position: { x: 360, y: 380 },
        });
        const defaultAttrs = generateDefaultAttributesForClass(acName);
        for (const da of defaultAttrs) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'addAttribute',
            classId: assocClassId,
            memberId: crypto.randomUUID(),
            name: da.name,
            type: da.type,
            visibility: '+',
            isStatic: false,
            isDerived: false,
          });
        }
      }

      // 1. Obtener nombres reales de las entidades para validar semántica OOAD
      const sourceName = currentDiagram?.classes?.find((c: any) => c.id === sourceId)?.name || assoc.source;
      const targetName = currentDiagram?.classes?.find((c: any) => c.id === targetId)?.name || assoc.target;

      // 2. Guardrail de Composición: nunca permitir composición en reflexivas ni entre entidades independientes
      const isRequestedComposite = assoc.aggregation === 'composite' || (assoc as any).type === 'composition';
      const isRequestedShared = assoc.aggregation === 'shared' || (assoc as any).type === 'aggregation';

      const isExplicitInText = !!originText && /(?:composici[oó]n|composite)\b/i.test(originText);
      const canBeComposite = isRequestedComposite && !isRecursive && (isExplicitInText || isHeuristicComposition(sourceName, targetName, !!assocClassId || !!assoc.associationClass));
      const targetAggregation = canBeComposite ? 'composite' : (isRequestedShared ? 'shared' : 'none');
      const targetEnd = (canBeComposite || isRequestedShared) ? (assoc.aggregationEnd ?? 'source') : 'source';

      // 3. Verificar si ya existe una asociación entre este par en el lienzo actual
      const existingAssoc = currentDiagram?.associations?.find((a: any) => {
        if (isRecursive) {
          return a.sourceClassId === sourceId && a.targetClassId === sourceId;
        }
        return (
          (a.sourceClassId === sourceId && a.targetClassId === targetId) ||
          (a.sourceClassId === targetId && a.targetClassId === sourceId)
        );
      });

      if (existingAssoc) {
        // Verificar si la relación propuesta realmente introduce cambios respecto a la del lienzo
        let newSourceMult = assoc.sourceMultiplicity ? cleanMultiplicity(assoc.sourceMultiplicity, isRecursive ? '0..1' : '1') : undefined;
        let newTargetMult = assoc.targetMultiplicity ? cleanMultiplicity(assoc.targetMultiplicity, isRecursive ? '0..*' : '0..*') : undefined;

        if (originText) {
          const explicit = extractExplicitMultiplicities(originText, sourceName, targetName);
          if (explicit) {
            if (explicit.sourceMultiplicity) newSourceMult = explicit.sourceMultiplicity;
            if (explicit.targetMultiplicity) newTargetMult = explicit.targetMultiplicity;
          }
        }

        if (targetAggregation === 'composite' && newSourceMult) {
          if (newSourceMult === '*' || newSourceMult === '0..*' || newSourceMult === '1..*') {
            newSourceMult = '1';
          }
        }

        const aggregationChanged = targetAggregation !== (existingAssoc.aggregation ?? 'none');
        const multChanged = (newSourceMult !== undefined && newSourceMult !== existingAssoc.sourceMultiplicity) ||
                            (newTargetMult !== undefined && newTargetMult !== existingAssoc.targetMultiplicity);
        const metaChanged = (assoc.name !== undefined && assoc.name !== existingAssoc.name) ||
                            (assoc.sourceRole !== undefined && assoc.sourceRole !== existingAssoc.sourceRole) ||
                            (assoc.targetRole !== undefined && assoc.targetRole !== existingAssoc.targetRole) ||
                            (assocClassId !== undefined && assocClassId !== existingAssoc.associationClassId);

        if (aggregationChanged || multChanged || metaChanged) {
          const updateDelta: any = {
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'association',
            op: 'updateMultiplicity',
            associationId: existingAssoc.id,
            aggregation: targetAggregation,
            aggregationEnd: targetEnd,
          };

          if (newSourceMult) updateDelta.newSourceMultiplicity = newSourceMult;
          if (newTargetMult) updateDelta.newTargetMultiplicity = newTargetMult;
          if (assoc.name !== undefined) updateDelta.name = assoc.name;
          if (assoc.sourceRole !== undefined) updateDelta.sourceRole = assoc.sourceRole;
          if (assoc.targetRole !== undefined) updateDelta.targetRole = assoc.targetRole;
          if (assocClassId) {
            updateDelta.newAssociationClassId = assocClassId;
          } else if (assoc.associationClass === null) {
            updateDelta.newAssociationClassId = null;
          }

          deltas.push(updateDelta);
        }

        seenConnectedPairs.add(pair);
        return;
      }

      // Si no existía previamente, crear la asociación
      let finalSrcMult = cleanMultiplicity(assoc.sourceMultiplicity, isRecursive ? '0..1' : '1');
      let finalTgtMult = cleanMultiplicity(assoc.targetMultiplicity, isRecursive ? '0..*' : '0..*');

      if (originText) {
        const explicit = extractExplicitMultiplicities(originText, sourceName, targetName);
        if (explicit) {
          if (explicit.sourceMultiplicity) finalSrcMult = explicit.sourceMultiplicity;
          if (explicit.targetMultiplicity) finalTgtMult = explicit.targetMultiplicity;
        }
      }

      // Invariante UML 2.5.1: si la relación es Composición, el extremo contenedor/todo (source) NUNCA puede ser *
      if (targetAggregation === 'composite') {
        if (finalSrcMult === '*' || finalSrcMult === '0..*' || finalSrcMult === '1..*') {
          finalSrcMult = '1';
        }
      }

      const assocDelta: any = {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: sourceId,
        targetClassId: targetId,
        sourceMultiplicity: finalSrcMult,
        targetMultiplicity: finalTgtMult,
        directed: assoc.directed ?? false,
        aggregation: targetAggregation,
        aggregationEnd: targetEnd,
      };

      if (assoc.name) assocDelta.name = assoc.name;
      if (assoc.sourceRole) assocDelta.sourceRole = assoc.sourceRole;
      if (assoc.targetRole) assocDelta.targetRole = assoc.targetRole;
      if (assocClassId) assocDelta.associationClassId = assocClassId;

      deltas.push(assocDelta);
      seenConnectedPairs.add(pair);
    });
  }

  // 6. Conectividad del grafo: ninguna clase creada debe quedar aislada ("volando sin relación")
  if (hasClasses && model.classes!.length > 1) {
    const createdClassIds = Array.from(new Set(
      deltas.filter((d: any) => d.kind === 'class' && d.op === 'create').map((d: any) => d.classId)
    ));

    const anchorClassId = createdClassIds[0] || (currentDiagram?.classes?.[0]?.id as string | undefined);

    if (anchorClassId) {
      for (const cid of createdClassIds) {
        if (cid === anchorClassId) continue;
        let hasAnyConnection = false;
        for (const pair of seenConnectedPairs) {
          if (pair.includes(cid)) {
            hasAnyConnection = true;
            break;
          }
        }

        if (!hasAnyConnection) {
          const pair = getPairKey(anchorClassId, cid);
          if (!seenConnectedPairs.has(pair)) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'association',
              op: 'create',
              associationId: crypto.randomUUID(),
              sourceClassId: anchorClassId,
              targetClassId: cid,
              sourceMultiplicity: '1',
              targetMultiplicity: '0..*',
              directed: false,
              aggregation: 'none',
              aggregationEnd: 'source',
            });
            seenConnectedPairs.add(pair);
          }
        }
      }
    }
  }

  // 7. Asociaciones N-arias (3 o más extremos con rombo central)
  if (Array.isArray(model.naryAssociations)) {
    model.naryAssociations.forEach((n) => {
      if (!Array.isArray(n.members) || n.members.length < 3) return;
      const memberEnds: any[] = [];
      for (const m of n.members) {
        const cid = resolveClassId(m.class);
        if (cid && !memberEnds.some((e) => e.classId === cid)) {
          memberEnds.push({
            classId: cid,
            multiplicity: m.multiplicity || '1',
            role: m.role,
          });
        }
      }
      if (memberEnds.length >= 3) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'naryAssociation',
          op: 'create',
          naryAssociationId: crypto.randomUUID(),
          memberEnds,
          name: n.name,
        });
      }
    });
  }

  // 8. Eliminaciones puntuales (relaciones, miembros, clases)
  if (model.deletions) {
    // Borrado de asociaciones
    if (Array.isArray(model.deletions.associations) && currentDiagram?.associations) {
      model.deletions.associations.forEach((item) => {
        const srcId = resolveClassId(item.source);
        const tgtId = resolveClassId(item.target);
        if (srcId && tgtId) {
          const assoc = currentDiagram.associations.find(
            (a: any) =>
              (a.sourceClassId === srcId && a.targetClassId === tgtId) ||
              (a.sourceClassId === tgtId && a.targetClassId === srcId)
          );
          if (assoc) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'association',
              op: 'delete',
              associationId: assoc.id,
            });
          }
        }
      });
    }

    // Borrado de generalizaciones
    if (Array.isArray(model.deletions.generalizations) && currentDiagram?.generalizations) {
      model.deletions.generalizations.forEach((item) => {
        const subId = resolveClassId(item.subclass);
        const superId = resolveClassId(item.superclass);
        if (subId && superId) {
          const gen = currentDiagram.generalizations.find(
            (g: any) =>
              (g.subClassId === subId && g.superClassId === superId) ||
              (g.subClassId === superId && g.superClassId === subId)
          );
          if (gen) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'generalization',
              op: 'delete',
              generalizationId: gen.id,
            });
          }
        }
      });
    }

    // Borrado de realizaciones
    if (Array.isArray(model.deletions.realizations) && currentDiagram?.realizations) {
      model.deletions.realizations.forEach((item) => {
        const client = resolveClassId(item.clientClass);
        const supplier = resolveClassId(item.supplierInterface);
        if (client && supplier) {
          const r = currentDiagram.realizations.find(
            (rel: any) =>
              (rel.clientClassId === client && rel.supplierInterfaceId === supplier) ||
              (rel.clientClassId === supplier && rel.supplierInterfaceId === client)
          );
          if (r) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'realization',
              op: 'delete',
              realizationId: r.id,
            });
          }
        }
      });
    }

    // Borrado de dependencias
    if (Array.isArray(model.deletions.dependencies) && currentDiagram?.dependencies) {
      model.deletions.dependencies.forEach((item) => {
        const client = resolveClassId(item.client);
        const supplier = resolveClassId(item.supplier);
        if (client && supplier) {
          const d = currentDiagram.dependencies.find(
            (dep: any) =>
              (dep.clientClassId === client && dep.supplierClassId === supplier) ||
              (dep.clientClassId === supplier && dep.supplierClassId === client)
          );
          if (d) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'dependency',
              op: 'delete',
              dependencyId: d.id,
            });
          }
        }
      });
    }

    // Borrado de asociaciones N-arias
    if (Array.isArray(model.deletions.naryAssociations) && currentDiagram?.naryAssociations) {
      model.deletions.naryAssociations.forEach((item) => {
        const nary = currentDiagram.naryAssociations.find((n: any) => n.id === item || (n.name && n.name.toLowerCase().trim() === item.toLowerCase().trim()));
        if (nary) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'naryAssociation',
            op: 'delete',
            naryAssociationId: nary.id,
          });
        }
      });
    }

    // Borrado de atributos
    if (Array.isArray(model.deletions.attributes)) {
      model.deletions.attributes.forEach((item) => {
        const cid = resolveClassId(item.class);
        const ec = cid ? Array.from(existingClassesMap.values()).find((c) => c.id === cid) : undefined;
        if (cid && ec && Array.isArray(ec.attributes)) {
          const attr = ec.attributes.find((a: any) => a.name && a.name.toLowerCase().trim() === item.attribute.toLowerCase().trim());
          if (attr) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'member',
              op: 'deleteAttribute',
              classId: cid,
              memberId: attr.id,
            });
          }
        }
      });
    }

    // Borrado de métodos
    if (Array.isArray(model.deletions.methods)) {
      model.deletions.methods.forEach((item) => {
        const cid = resolveClassId(item.class);
        const ec = cid ? Array.from(existingClassesMap.values()).find((c) => c.id === cid) : undefined;
        if (cid && ec && Array.isArray(ec.methods)) {
          const m = ec.methods.find((em: any) => em.name && em.name.toLowerCase().trim() === item.method.toLowerCase().trim());
          if (m) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'member',
              op: 'deleteMethod',
              classId: cid,
              memberId: m.id,
            });
          }
        }
      });
    }

    // Borrado de clases (al final para respetar orden de miembros)
    if (Array.isArray(model.deletions.classes)) {
      model.deletions.classes.forEach((cname) => {
        const cid = resolveClassId(cname);
        if (cid) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'delete',
            classId: cid,
          });
        }
      });
    }
  }

  return {
    id: crypto.randomUUID(),
    diagramId,
    timestamp,
    kind: 'batch',
    deltas,
  };
}

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
/**
 * Intenta reparar y balancear corchetes/llaves de un fragmento JSON truncado prematuramente
 * por límite de tokens o timeout para rescatar todas las clases completas generadas.
 */
export function tryRepairTruncatedJson(raw: string): any {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return null;
  const jsonSub = raw.slice(startIdx);

  try {
    return JSON.parse(jsonSub);
  } catch {}

  for (let i = jsonSub.length; i > 10; i--) {
    const sub = jsonSub.slice(0, i);
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;
    for (let j = 0; j < sub.length; j++) {
      const char = sub[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braces++;
        else if (char === '}') braces--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
      }
    }
    if (inString) continue;
    if (braces >= 0 && brackets >= 0) {
      let candidate = sub;
      for (let b = 0; b < brackets; b++) candidate += ']';
      for (let b = 0; b < braces; b++) candidate += '}';
      try {
        return JSON.parse(candidate);
      } catch {}
    }
  }
  return null;
}

/**
 * Mapea un esquema canónico del catálogo a un SemanticDomainModel acotado a un máximo de 5 clases.
 */
export function canonicalToSemantic(canonical: any): SemanticDomainModel {
  const topClasses = (canonical.classes || []).slice(0, 5);
  const classNames = new Set(topClasses.map((c: any) => c.name));

  const classes: SemanticClass[] = topClasses.map((c: any) => ({
    name: c.name,
    isInterface: c.isInterface,
    isAbstract: c.isAbstract,
    attributes: (c.attributes || []).map((a: any) => ({ name: a.name, type: a.type })),
    methods: c.methods?.map((m: any) => ({ name: m.name, returnType: m.returnType })),
  }));

  const associations: SemanticAssociation[] = [];
  const generalizations: SemanticGeneralization[] = [];

  for (const r of canonical.relationships || []) {
    if (!classNames.has(r.source) || !classNames.has(r.target)) continue;
    if (r.type === 'generalization') {
      generalizations.push({ subclass: r.source, superclass: r.target });
    } else {
      associations.push({
        source: r.source,
        target: r.target,
        name: r.label,
        aggregation: r.type === 'composition' ? 'composite' : r.type === 'aggregation' ? 'shared' : 'none',
        sourceMultiplicity: r.sourceMultiplicity || '1',
        targetMultiplicity: r.targetMultiplicity || '0..*',
        associationClass: r.associationClass,
      });
    }
  }

  return {
    action: 'modify',
    classes,
    associations,
    generalizations,
  };
}

/**
 * Parsea el JSON devuelto por el modelo, tolerando markdown y truncamientos parciales.
 */
export function robustParseDomainJson(raw: string): SemanticDomainModel | null {
  const isDummyName = (str?: string) => !str || /^(NombreClase|ClassName|ClaseA|ClaseB|Origen|Destino|Hijo|Padre)$/i.test(str.trim());

  // 1. Intento de parseo JSON estándar o reparación de JSON truncado
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: any = null;
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = tryRepairTruncatedJson(raw);
    }
  } else {
    parsed = tryRepairTruncatedJson(raw);
  }

  if (parsed) {
    try {
      const parseAttrs = (rawAttrs: any): any[] => {
        if (!rawAttrs) return [];
        if (Array.isArray(rawAttrs)) {
          const list: any[] = [];
          for (const item of rawAttrs) {
            if (typeof item === 'string') {
              const cleaned = item.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
              const parts = cleaned.split(/,\s*(?=[a-zA-Z_])/);
              for (const p of parts) {
                const subParts = p.split(':');
                const sanitized = sanitizeAttributeNameAndType(subParts[0] || '', subParts[1] || 'string');
                if (sanitized.name) list.push(sanitized);
              }
            } else if (item && typeof item === 'object') {
              const sanitized = sanitizeAttributeNameAndType(item.name || '', item.type || 'string');
              if (sanitized.name) list.push({ ...item, name: sanitized.name, type: sanitized.type });
            }
          }
          return list;
        } else if (typeof rawAttrs === 'object') {
          return Object.entries(rawAttrs).map(([k, v]) => {
            const sanitized = sanitizeAttributeNameAndType(k, typeof v === 'string' ? v : 'string');
            return { name: sanitized.name, type: sanitized.type };
          });
        } else if (typeof rawAttrs === 'string') {
          const cleaned = rawAttrs.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
          return cleaned.split(/,\s*(?=[a-zA-Z_])/).map((s) => {
            const parts = s.split(':');
            return sanitizeAttributeNameAndType(parts[0] || '', parts[1] || 'string');
          }).filter((a) => a.name);
        }
        return [];
      };

      const classesData = Array.isArray(parsed.classes)
        ? parsed.classes
        : Array.isArray(parsed.clases)
          ? parsed.clases
          : parsed.classes ?? parsed.clases;

      let rawClasses: any[] = [];
      if (Array.isArray(classesData)) {
        rawClasses = classesData.map((cls: any) => ({
          ...cls,
          attributes: parseAttrs(cls.attributes ?? cls.atributos ?? cls.properties ?? cls.fields ?? cls.campos),
          methods: cls.methods ?? cls.metodos ?? cls.operaciones,
        }));
      } else if (classesData && typeof classesData === 'object') {
        rawClasses = Object.entries(classesData).map(([className, classData]: [string, any]) => ({
          name: classData?.name || className,
          isInterface: classData?.isInterface ?? false,
          isAbstract: classData?.isAbstract ?? false,
          attributes: parseAttrs(classData?.attributes ?? classData?.atributos ?? classData?.properties ?? classData?.fields ?? classData?.campos),
          methods: classData?.methods ?? classData?.metodos,
        }));
      }

      const rawAssocs = Array.isArray(parsed.associations)
        ? parsed.associations
        : Array.isArray(parsed.asociaciones)
          ? parsed.asociaciones
          : Array.isArray(parsed.relaciones)
            ? parsed.relaciones
            : Array.isArray(parsed.relationships)
              ? parsed.relationships
              : [];
      const rawGens = Array.isArray(parsed.generalizations)
        ? parsed.generalizations
        : Array.isArray(parsed.generalizaciones)
          ? parsed.generalizaciones
          : Array.isArray(parsed.herencias)
            ? parsed.herencias
            : [];
      const rawRealizations = Array.isArray(parsed.realizations)
        ? parsed.realizations
        : Array.isArray(parsed.realizaciones)
          ? parsed.realizaciones
          : [];
      const rawDependencies = Array.isArray(parsed.dependencies)
        ? parsed.dependencies
        : Array.isArray(parsed.dependencias)
          ? parsed.dependencias
          : [];
      const rawNary = Array.isArray(parsed.naryAssociations)
        ? parsed.naryAssociations
        : Array.isArray(parsed.asociacionesNarias)
          ? parsed.asociacionesNarias
          : [];

      const classes = rawClasses.filter((c: any) => c.name && !isDummyName(c.name));
      const associations = rawAssocs
        .map((a: any) => {
          const rawAgg = String(a.aggregation || a.agregacion || a.tipo || a.type || '').toLowerCase();
          let aggregation: 'composite' | 'shared' | 'none' = 'none';
          if (rawAgg.includes('comp') || a.esComposicion || a.isComposite) {
            aggregation = 'composite';
          } else if (rawAgg.includes('agreg') || rawAgg.includes('shared') || a.esAgregacion || a.isShared) {
            aggregation = 'shared';
          }

          const rawAssocClass =
            a.associationClass ||
            a.claseAsociacion ||
            a.tablaIntermedia ||
            a.intermediateTable ||
            a.asociacionIntermedia;

          return {
            source: typeof a.source === 'object' ? a.source?.name : (a.source ?? a.origen),
            target: typeof a.target === 'object' ? a.target?.name : (a.target ?? a.destino),
            name: a.name || a.nombre,
            type: a.type,
            aggregation,
            aggregationEnd: a.aggregationEnd || a.extremoTodo || 'source',
            associationClass: typeof rawAssocClass === 'object' ? rawAssocClass?.name : rawAssocClass,
            directed: a.directed ?? false,
            sourceMultiplicity: a.sourceMultiplicity || a.multiplicidadOrigen,
            targetMultiplicity: a.targetMultiplicity || a.multiplicidadDestino,
            sourceRole: a.sourceRole || a.rolOrigen,
            targetRole: a.targetRole || a.rolDestino,
          };
        })
        .filter((a: any) => a.source && a.target && !isDummyName(a.source) && !isDummyName(a.target));

      const generalizations = rawGens
        .map((g: any) => ({
          subclass: typeof g.subclass === 'object' ? g.subclass?.name : (g.subclass ?? g.subclase ?? g.hijo ?? g.hija ?? g.child),
          superclass: typeof g.superclass === 'object' ? g.superclass?.name : (g.superclass ?? g.superclase ?? g.padre ?? g.madre ?? g.parent),
          name: g.name ?? g.nombre,
        }))
        .filter((g: any) => g.subclass && g.superclass && !isDummyName(g.subclass) && !isDummyName(g.superclass));

      const realizations = rawRealizations
        .map((r: any) => ({
          clientClass: typeof r.clientClass === 'object' ? r.clientClass?.name : (r.clientClass ?? r.client),
          supplierInterface: typeof r.supplierInterface === 'object' ? r.supplierInterface?.name : (r.supplierInterface ?? r.supplier),
          name: r.name,
        }))
        .filter((r: any) => r.clientClass && r.supplierInterface && !isDummyName(r.clientClass) && !isDummyName(r.supplierInterface));

      const dependencies = rawDependencies
        .map((d: any) => ({
          client: typeof d.client === 'object' ? d.client?.name : d.client,
          supplier: typeof d.supplier === 'object' ? d.supplier?.name : d.supplier,
          name: d.name,
        }))
        .filter((d: any) => d.client && d.supplier && !isDummyName(d.client) && !isDummyName(d.supplier));

      const naryAssociations = rawNary
        .map((n: any) => ({
          name: n.name,
          members: Array.isArray(n.members)
            ? n.members.map((m: any) => ({
                class: typeof m === 'string' ? m : (m.class ?? m.name),
                multiplicity: m.multiplicity,
                role: m.role,
              })).filter((m: any) => m.class && !isDummyName(m.class))
            : [],
        }))
        .filter((n: any) => n.members.length >= 3);

      const renames = parsed.renames ?? parsed.renombrar;
      const updates = parsed.updates ?? parsed.modificaciones;
      const deletions = parsed.deletions ?? parsed.eliminaciones ?? parsed.borrados;

      if (
        classes.length > 0 ||
        associations.length > 0 ||
        generalizations.length > 0 ||
        realizations.length > 0 ||
        dependencies.length > 0 ||
        naryAssociations.length > 0 ||
        renames ||
        updates ||
        deletions
      ) {
        return {
          action: parsed.action,
          classes,
          associations,
          generalizations,
          realizations,
          dependencies,
          naryAssociations,
          renames,
          updates,
          deletions,
        };
      }
    } catch {
      // Si el JSON quedó truncado al final, se recuperan las clases completas
    }
  }

  // 2. Extracción resiliente por expresiones regulares si el JSON fue truncado por límite de tokens
  const classes: Array<{ name: string; attributes: string[] }> = [];
  const classRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"attributes"\s*:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(raw)) !== null) {
    const name = m[1]!;
    if (isDummyName(name)) continue;
    const attrsRaw = m[2]!;
    const attrItems: string[] = [];
    const attrRegex = /"([^"]+)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRegex.exec(attrsRaw)) !== null) {
      attrItems.push(am[1]!);
    }
    classes.push({ name, attributes: attrItems });
  }

  const associations: Array<{ source: string; target: string }> = [];
  const assocRegex = /\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"/g;
  while ((m = assocRegex.exec(raw)) !== null) {
    if (isDummyName(m[1]!) || isDummyName(m[2]!)) continue;
    associations.push({ source: m[1]!, target: m[2]! });
  }

  if (classes.length > 0 || associations.length > 0) {
    if (classes.length >= 2 && associations.length === 0) {
      for (let i = 0; i < classes.length - 1; i++) {
        associations.push({ source: classes[i]!.name, target: classes[i + 1]!.name });
      }
    }
    const mappedClasses: SemanticClass[] = classes.slice(0, 6).map(c => ({
      name: c.name,
      attributes: c.attributes.map(a => ({ name: a, type: 'string' })),
    }));
    return { classes: mappedClasses, associations };
  }

  return null;
}

/**
 * Extrae mutaciones explícitas de relaciones y clases solicitadas por el usuario o formuladas en el chat.
 * Soporta cambios de agregación (composición, agregación, asociación), modificaciones de clase (abstracta, interfaz)
 * y renombrados directos, vinculándolos con las clases y relaciones reales presentes en el lienzo.
 */
export function extractExplicitModelMutations(text: string, currentDiagram?: any): SemanticDomainModel | null {
  if (!text || !currentDiagram) return null;
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const classes: Array<{ id: string; name: string }> = currentDiagram.classes || [];
  const associations: Array<any> = currentDiagram.associations || [];

  // 0. Creación determinista de una nueva clase con atributos explícitos y/o asociación
  // Ej: "crea la clase Especialidad con matricula:string y activa:boolean"
  // Ej: "crear la clase Autor con nombre:string, nacionalidad:string y asociala con Publicacion 1 a N"
  // Ej: "crea la clase Editorial con nombre:string y fundacion:date"
  const isSpecialClassIntent =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class|n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized);

  const createClassIntent = !isSpecialClassIntent
    ? /^\s*(?:cre[aáeé]|crear|create|a[ñn]ad[eé]|agreg[aáeé]|insert[aáeé])\s+(?:la|una|nueva)?\s*(?:clase|calse|clse|class|tabla|entidad)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?(.*)$/i.exec(text)
    : null;

  if (createClassIntent) {
    const rawClassName = createClassIntent[1]!.trim();
    const className = cleanClassName(rawClassName);
    const remainder = createClassIntent[2]?.trim() || '';

    let attrsText = remainder;
    let targetAssocClass: string | undefined;
    let assocRemainder = '';

    const assocMatch = /(?:y\s+)?(?:asoci[aáeé]l[ao]|conect[aáeé]l[ao]|vincul[aáeé]l[ao]|relacion[aáeé]l[ao]|link(?:ed)?\s+(?:it\s+)?with|associate(?:\s+it)?\s+with)\s+(?:con\s+)?(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(.*)$/i.exec(remainder);
    if (assocMatch) {
      targetAssocClass = cleanClassName(assocMatch[1]);
      assocRemainder = assocMatch[2]?.trim() || '';
      attrsText = remainder.slice(0, assocMatch.index).trim();
    }

    attrsText = attrsText.replace(/^(?:con|with|teniendo|having)\s+/i, '').trim();
    const attributes = parseAttributesFromProse(attrsText);

    const createdClasses = [
      {
        name: className,
        attributes: attributes.length > 0 ? attributes : undefined,
        methods: [],
      },
    ];

    const associationsToCreate: any[] = [];
    if (targetAssocClass) {
      const mults = extractExplicitMultiplicities(assocRemainder || remainder, className, targetAssocClass) || {
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
      };
      associationsToCreate.push({
        source: className,
        target: targetAssocClass,
        sourceMultiplicity: mults.sourceMultiplicity || '1',
        targetMultiplicity: mults.targetMultiplicity || '0..*',
        aggregation: 'none',
      });
    }

    return {
      action: 'modify',
      classes: createdClasses,
      associations: associationsToCreate.length > 0 ? associationsToCreate : undefined,
    };
  }

  // 0b. Agregar atributo a una clase existente deterministamente
  // Ej: "agregá telefono:string a la clase Especialidad"
  // Ej: "agregale el atributo telefono:string a Especialidad"
  const addAttrMatch = /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|insert[aáeéí]|sum[aáeéí]|add)(?:le)?\s+(?:(?:el|la|un|una)\s+)?(?:(?:atributo|campo|columna|attribute|field)\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?::|\bde\s+tipo\b|\bof\s+type\b)\s*([A-Za-z_][\w.]*)\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
  if (addAttrMatch) {
    const rawAttrName = addAttrMatch[1]!.trim();
    const rawAttrType = addAttrMatch[2]!.trim().toLowerCase();
    const targetClassName = addAttrMatch[3]!.trim();
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      return {
        action: 'modify',
        classes: [
          {
            name: targetCls.name,
            attributes: [{ name: rawAttrName, type: rawAttrType }],
          },
        ],
      };
    }
  }

  // 0c. Cambiar tipo de atributo deterministamente
  // Ej: "cambiá el tipo de anio en Tirada a string"
  const changeAttrTypeMatch = /(?:cambi[aáeé]|modific[aáeé]|set|update)\s+(?:el\s+)?tipo\s+de(?:l\s+atributo)?\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|para)\s+(?:(?:la|el)\s+)?(?:clase\s+|tabla\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_][\w.]*)/i.exec(text);
  if (changeAttrTypeMatch) {
    const attrName = changeAttrTypeMatch[1]!.trim();
    const targetClassName = changeAttrTypeMatch[2]!.trim();
    const newType = changeAttrTypeMatch[3]!.trim().toLowerCase();
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      return {
        action: 'modify',
        updates: {
          attributes: [{ class: targetCls.name, name: attrName, type: newType }],
        },
      };
    }
  }

  // 0d. Renombrar atributo o pasar a minúsculas
  // Ej: "poné en minúsculas el atributo nombre en Autor"
  // Ej: "rename attribute fullName to nombreCompleto in Customer"
  const renameAttrInClass = /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+de|pon[eé]\s+en\s+min[uú]sculas|rename)\s+(?:el\s+|the\s+)?(?:atributo|campo|attribute|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(text);
  const renameAttrToIn = !renameAttrInClass && /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+de|rename)\s+(?:el\s+|the\s+)?(?:atributo|campo|attribute|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);

  const matchedRename = renameAttrInClass
    ? { attrName: renameAttrInClass[1]!.trim(), className: renameAttrInClass[2]!.trim(), toName: renameAttrInClass[3]?.trim() }
    : renameAttrToIn
      ? { attrName: renameAttrToIn[1]!.trim(), className: renameAttrToIn[3]!.trim(), toName: renameAttrToIn[2]!.trim() }
      : null;

  if (matchedRename) {
    const attrName = matchedRename.attrName;
    const targetClassName = matchedRename.className;
    const targetCls = classes.find((c) => c.name.toLowerCase() === targetClassName.toLowerCase());
    if (targetCls) {
      const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetCls.id);
      const existingAttr = fullCls?.attributes?.find((a: any) => a.name.toLowerCase() === attrName.toLowerCase());
      if (existingAttr) {
        const toName = /min[uú]sculas/i.test(text) ? existingAttr.name.toLowerCase() : (matchedRename.toName || existingAttr.name);
        return {
          action: 'modify',
          renames: {
            attributes: [{ class: targetCls.name, from: existingAttr.name, to: toName }],
          },
        };
      }
    }
  }

  // 0e. Agregar método deterministamente
  // Ej: "agregá el método cancelar(motivo:string):boolean a Especialidad"
  // Ej: "sumale a Especialidad el método atender():void"
  const addMethodDirectMatch = /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|sum[aáeéí]|insert[aáeéí]|add)(?:le)?\s+(?:el\s+|the\s+)?(?:m[ée]todo|operaci[oó]n|method|operation)\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\bque retorna\b|\bdevuelve\b|\breturns\b)?\s*([A-Za-z_][\w.]*)?\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
  const addMethodInvertedMatch = !addMethodDirectMatch && /(?:agreg[aáeéí]|a[ñn]ad[eéíi]|pon[eé]|sum[aáeéí]|insert[aáeéí]|add)(?:le)?\s+(?:a|en|para|to|in)\s+(?:(?:la|el|the)\s+)?(?:clase\s+|tabla\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:el\s+|the\s+)?(?:m[ée]todo|operaci[oó]n|method|operation)\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\bque retorna\b|\bdevuelve\b|\breturns\b)?\s*([A-Za-z_][\w.]*)?/i.exec(text);

  const matchedMethodInfo = addMethodDirectMatch
    ? { targetClass: addMethodDirectMatch[4]!.trim(), name: addMethodDirectMatch[1]!.trim(), rawParams: addMethodDirectMatch[2], retType: addMethodDirectMatch[3] }
    : addMethodInvertedMatch
      ? { targetClass: addMethodInvertedMatch[1]!.trim(), name: addMethodInvertedMatch[2]!.trim(), rawParams: addMethodInvertedMatch[3], retType: addMethodInvertedMatch[4] }
      : null;

  if (matchedMethodInfo) {
    const targetCls = classes.find((c) => c.name.toLowerCase() === matchedMethodInfo.targetClass.toLowerCase());
    if (targetCls) {
      const params: Array<{ name: string; type: string }> = [];
      if (matchedMethodInfo.rawParams && matchedMethodInfo.rawParams.trim().length > 0) {
        const parts = matchedMethodInfo.rawParams.split(',');
        for (const p of parts) {
          const m = /^\s*([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_][\w.]*))?\s*$/.exec(p);
          if (m) params.push({ name: m[1]!, type: m[2] || 'string' });
        }
      }
      return {
        action: 'modify',
        classes: [
          {
            name: targetCls.name,
            methods: [
              {
                name: matchedMethodInfo.name,
                returnType: matchedMethodInfo.retType || 'void',
                parameters: params,
              },
            ],
          },
        ],
      };
    }
  }

  if (classes.length === 0) return null;

  // 1. Borrado agnóstico determinista (clases, relaciones, atributos)
  const isDeleteIntent = /\b(?:delete|remove|elimina|elimin[aá]?(?:me|te|le|nos|les)?|borr[aá]?(?:me|te|le|nos|les)?|sac[aá]?(?:me|te|le|nos|les)?|quit[aá]?(?:me|te|le|nos|les)?|desvincul[aáeé]?(?:me|te|le|nos|les)?|desasoci[aáeé]?(?:me|te|le|nos|les)?|unlink|detach)\b/i.test(normalized);
  if (isDeleteIntent) {
    const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
    const mentionedClasses = classes.filter((c) => {
      const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
      if (regex.test(normalized)) return true;
      if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
      return false;
    });

    // 1a. Borrado de atributo (si menciona atributo/campo o un atributo de clase)
    const isAttrTarget = /(?:atributo|campo|field|attribute|propiedad|property)/i.test(normalized);
    if (isAttrTarget) {
      // 1. Extraer nombre explícito del atributo si se especificó: ej. "elimina el atributo nacionalidad [en/de Autor]"
      const attrMatch = /(?:atributo|campo|field|attribute|propiedad|property)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      const requestedAttrName = attrMatch ? attrMatch[1]!.trim().toLowerCase() : undefined;

      // 2. Extraer clase objetivo si se especificó: ej. "en/de/para [la clase] Autor"
      let targetCls = mentionedClasses.length === 1 ? mentionedClasses[0] : undefined;
      const classInTextMatch = /(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (classInTextMatch) {
        const cCand = classes.find((c) => c.name.toLowerCase() === classInTextMatch[1]!.toLowerCase());
        if (cCand) targetCls = cCand;
      }

      const cleanAttr = (n: string) => n.toLowerCase().replace(/string|int|float|boolean|date$/i, '');

      if (requestedAttrName) {
        if (targetCls) {
          const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetCls!.id);
          const matchedAttr = fullCls?.attributes?.find((a: any) => {
            const an = a.name.toLowerCase();
            return an === requestedAttrName || cleanAttr(an) === requestedAttrName || an.startsWith(requestedAttrName);
          });
          if (matchedAttr) {
            return {
              action: 'modify',
              deletions: {
                attributes: [{ class: targetCls.name, attribute: matchedAttr.name }],
              },
            };
          }
          // Si el atributo explícito solicitado no existe en la clase especificada,
          // EVITAR fallthrough catastrófico que borre la clase. Devolver deleciones vacías controladas.
          return {
            action: 'modify',
            deletions: {
              attributes: [],
            },
          };
        }
        for (const cls of classes) {
          const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
          const matchedAttr = fullCls?.attributes?.find((a: any) => {
            const an = a.name.toLowerCase();
            return an === requestedAttrName || cleanAttr(an) === requestedAttrName || an.startsWith(requestedAttrName);
          });
          if (matchedAttr) {
            return {
              action: 'modify',
              deletions: {
                attributes: [{ class: cls.name, attribute: matchedAttr.name }],
              },
            };
          }
        }
        // Si no se encontró en ninguna clase, no borrar clases por error
        return {
          action: 'modify',
          deletions: {
            attributes: [],
          },
        };
      }

      // Fallback: si no hubo match explícito de "atributo <nombre>", buscar si algún atributo coincide
      const searchClasses = targetCls ? [targetCls] : classes;
      for (const cls of searchClasses) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        if (fullCls && Array.isArray(fullCls.attributes)) {
          for (const attr of fullCls.attributes) {
            const aNorm = attr.name.toLowerCase();
            const attrRegex = new RegExp(`(?:\\b|["'])${aNorm}(?:\\b|["'])`, 'i');
            if (attrRegex.test(normalized)) {
              return {
                action: 'modify',
                deletions: {
                  attributes: [{ class: cls.name, attribute: attr.name }],
                },
              };
            }
          }
        }
      }
    }

    // 1a2. Borrado de método (si menciona método/operación)
    const isMethodTarget = /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)/i.test(normalized);
    if (isMethodTarget) {
      const methodMatch = /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      const requestedMethodName = methodMatch ? methodMatch[1]!.trim().toLowerCase() : undefined;
      let targetCls = mentionedClasses.length === 1 ? mentionedClasses[0] : undefined;
      const classInTextMatch = /(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (classInTextMatch) {
        const cCand = classes.find((c) => c.name.toLowerCase() === classInTextMatch[1]!.toLowerCase());
        if (cCand) targetCls = cCand;
      }
      if (requestedMethodName) {
        const searchClasses = targetCls ? [targetCls] : classes;
        for (const cls of searchClasses) {
          const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
          const matchedMethod = fullCls?.methods?.find((m: any) => m.name && m.name.toLowerCase().trim() === requestedMethodName);
          if (matchedMethod) {
            return {
              action: 'modify',
              deletions: {
                methods: [{ class: cls.name, method: matchedMethod.name }],
              },
            };
          }
        }
      }
    }

    // 1b. Si el usuario pide explícitamente borrar una CLASE específica (ej. "elimina la clase Multa que esta relacionada con Libro")
    const explicitClassTargetMatch = /(?:la\s+clase\s+|clase\s+|class\s+|tabla\s+|entidad\s+)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
    if (explicitClassTargetMatch) {
      const targetName = explicitClassTargetMatch[1]?.toLowerCase();
      const targetCls = classes.find((c) => c.name.toLowerCase() === targetName);
      if (targetCls) {
        return {
          action: 'modify',
          deletions: {
            classes: [targetCls.name],
          },
        };
      }
    }

    // 1b2. Desvinculación limpia de clase de asociación (E4: "desvincula la clase de asociacion de Publicacion y Autor" o "quita la clase de asociacion")
    // Preserva la asociación binaria y las clases en el lienzo, restableciendo associationClassId a null.
    const isUnlinkAssocClass =
      /(?:desvincul[aáeé]|quit[aáeé]|elimin[aáeé]|remover?|sac[aáeé])\s+(?:la\s+)?clase\s+de\s+asociaci[oó]n/i.test(normalized) ||
      /(?:unlink|detach|remove)\s+(?:the\s+)?association\s+class/i.test(normalized);

    if (isUnlinkAssocClass) {
      let targetAssoc: any = undefined;
      if (mentionedClasses.length >= 2) {
        const c1 = mentionedClasses[0]!;
        const c2 = mentionedClasses[1]!;
        targetAssoc = associations.find(
          (a) =>
            ((a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
             (a.sourceClassId === c2.id && a.targetClassId === c1.id)) &&
            a.associationClassId
        );
      } else if (mentionedClasses.length === 1) {
        const c1 = mentionedClasses[0]!;
        targetAssoc = associations.find(
          (a) =>
            (a.sourceClassId === c1.id || a.targetClassId === c1.id || a.associationClassId === c1.id) &&
            a.associationClassId
        );
      } else {
        targetAssoc = associations.find((a) => a.associationClassId);
      }

      if (targetAssoc) {
        const src = classes.find((c) => c.id === targetAssoc.sourceClassId);
        const tgt = classes.find((c) => c.id === targetAssoc.targetClassId);
        if (src && tgt) {
          return {
            action: 'modify',
            updates: {
              associations: [
                {
                  source: src.name,
                  target: tgt.name,
                  associationClass: null,
                },
              ],
            },
          };
        }
      }
    }

    // 1c. Borrado de relación / asociación
    const isRelTarget = /(?:relaci[oó]n|asociaci[oó]n|composici[oó]n|agregaci[oó]n|enlace|link|relationship|association)/i.test(normalized);
    if (isRelTarget || mentionedClasses.length >= 2) {
      if (mentionedClasses.length >= 2) {
        const c1 = mentionedClasses[0]!;
        const c2 = mentionedClasses[1]!;
        const matchingAssoc = associations.find(
          (a) =>
            (a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
            (a.sourceClassId === c2.id && a.targetClassId === c1.id)
        );
        if (matchingAssoc) {
          const src = classes.find((c) => c.id === matchingAssoc.sourceClassId);
          const tgt = classes.find((c) => c.id === matchingAssoc.targetClassId);
          if (src && tgt) {
            return {
              action: 'modify',
              deletions: {
                associations: [{ source: src.name, target: tgt.name }],
              },
            };
          }
        }
      } else if (associations.length === 1 && isRelTarget) {
        const singleAssoc = associations[0]!;
        const src = classes.find((c) => c.id === singleAssoc.sourceClassId);
        const tgt = classes.find((c) => c.id === singleAssoc.targetClassId);
        if (src && tgt) {
          return {
            action: 'modify',
            deletions: {
              associations: [{ source: src.name, target: tgt.name }],
            },
          };
        }
      }
    }

    // 1d. Borrado de clase si se menciona exactamente una clase (y no era una orden de borrar atributo, método o relación)
    if (!isAttrTarget && !isRelTarget && !isMethodTarget && mentionedClasses.length === 1) {
      return {
        action: 'modify',
        deletions: {
          classes: [mentionedClasses[0]!.name],
        },
      };
    }
  }

  // 2. Renombrado de clase (ES y EN con pronombres enclíticos)
  const isClassRename =
    /(?:rename|renaming|renombr[aáeé]?(?:me|te|le|nos|les)?|change\s+name\s+of)\s+(?:la\s+clase\s+|clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text) ||
    /(?:cambi[aáeé]?(?:me|te|le|nos|les)?\s+el\s+nombre\s+de\s+(?:la\s+clase\s+|class\s+)?)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);

  if (isClassRename) {
    const fromName = isClassRename[1]?.trim();
    const toName = isClassRename[2]?.trim();
    const matchedClass = classes.find((c) => c.name.toLowerCase() === fromName?.toLowerCase());
    if (matchedClass && toName) {
      return {
        action: 'modify',
        renames: {
          classes: [
            {
              from: matchedClass.name,
              to: toName,
            },
          ],
        },
      };
    }
  }

  // 3. Mutación de clase a abstracta o interfaz (ES y EN)
  const isClassModIntent =
    /(?:abstract[ao]?|interfa[cz]|interface)/i.test(normalized) &&
    /(?:hac|haz|marc|cambi|modific|make|set|turn|convert|defin|sea|to\s+be|as)/i.test(normalized);

  if (isClassModIntent) {
    const wantsAbstract = /abstract/i.test(normalized);
    const wantsInterface = /interfa/i.test(normalized);

    // Priorizar la clase que está directamente adyacente a la declaración (ej. "hace que Multa sea abstracta")
    const explicitClassContext = /(?:clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:sea\s+|to\s+be\s+|as\s+)?(?:abstract|interfa)/i.exec(text) ||
      /(?:abstract[ao]?|interfa[cz]|interface).*?(?:para\s+|de\s+|in\s+|for\s+)(?:la\s+clase\s+|class\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);

    let matchedClass: { id: string; name: string } | undefined;
    if (explicitClassContext) {
      const candName = explicitClassContext[1]?.toLowerCase();
      matchedClass = classes.find((c) => c.name.toLowerCase() === candName);
    }

    if (!matchedClass) {
      const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
      matchedClass = classes.find((c) => {
        const cNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const wordRegex = new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i');
        if (wordRegex.test(normalized)) return true;
        if (cleanedTextWithoutSpaces.includes(cNorm)) return true;
        return false;
      });
    }

    if (matchedClass) {
      return {
        action: 'modify',
        updates: {
          classes: [
            {
              name: matchedClass.name,
              isAbstract: wantsAbstract,
              classKind: wantsInterface ? 'interface' : 'class',
            },
          ],
        },
      };
    }
  }

  // 3a. Adición / modificación / renombrado determinista de métodos en una clase existente
  const isMethodIntent =
    /(?:agreg[aáeé]|a[ñn]ad[eé]|pon[eé]?|sum[aá]|add|insert[aáeé]|cre[aáeé]|create|cambi[aáeé]|modific[aáeé]|renombr[aáeé])/i.test(normalized) &&
    (/(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)\b/i.test(normalized) ||
      /\b[A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*\s*\([^)]*\)\s*(?::\s*[A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)?/i.test(text));

  if (isMethodIntent) {
    const methodTypeMap: Record<string, string> = {
      entero: 'int',
      entera: 'int',
      int: 'int',
      integer: 'int',
      numero: 'int',
      number: 'int',
      texto: 'string',
      cadena: 'string',
      string: 'string',
      str: 'string',
      booleano: 'boolean',
      booleana: 'boolean',
      bool: 'boolean',
      boolean: 'boolean',
      fecha: 'date',
      date: 'date',
      timestamp: 'date',
      datetime: 'date',
      decimal: 'float',
      float: 'float',
      double: 'float',
      real: 'float',
      void: 'void',
      vacio: 'void',
      vacío: 'void',
      nada: 'void',
    };

    let targetClass: { id: string; name: string } | undefined;
    for (const cls of classes) {
      const cNorm = cls.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (new RegExp(`(?:\\b|["'])${cNorm}(?:\\b|["'])`, 'i').test(normalized)) {
        targetClass = cls;
        break;
      }
    }

    // Renombrado de método: "renombra el metodo <A> a/por <B>"
    const methodRenameMatch =
      /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+del?\s+m[eé]todo)\s+(?:el\s+m[eé]todo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(
        text
      );
    if (methodRenameMatch && targetClass) {
      const fromName = methodRenameMatch[1]!.trim();
      const toName = methodRenameMatch[2]!.trim();
      return {
        action: 'modify',
        renames: {
          methods: [
            {
              class: targetClass.name,
              from: fromName,
              to: toName,
            },
          ],
        },
      };
    }

    let methodName = '';
    let returnType = 'void';
    let params: Array<{ name: string; type: string }> = [];

    // Signature match: e.g. "calcularRegalias(porcentaje:float):float" or "calcular()"
    const sigMatch =
      /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s*\(([^)]*)\)(?:\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*))?/i.exec(
        text
      );

    if (sigMatch) {
      methodName = sigMatch[1]!.trim();
      const rawParams = sigMatch[2]?.trim();
      const rawRet = sigMatch[3]?.trim();
      if (rawRet) {
        const normRet = stripAccents(rawRet.toLowerCase());
        returnType = methodTypeMap[normRet] || rawRet;
      }
      if (rawParams) {
        const paramItems = rawParams.split(',').map((p) => p.trim()).filter(Boolean);
        for (const item of paramItems) {
          const colonMatch = /([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/.exec(item);
          if (colonMatch) {
            const pName = colonMatch[1]!.trim();
            const pTypeRaw = stripAccents(colonMatch[2]!.trim().toLowerCase());
            params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
          } else {
            const spaceParts = item.split(/\s+/);
            if (spaceParts.length >= 2) {
              const pName = spaceParts[0]!.trim();
              const pTypeRaw = stripAccents(spaceParts[1]!.trim().toLowerCase());
              params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
            } else if (spaceParts[0]) {
              params.push({ name: spaceParts[0].trim(), type: 'string' });
            }
          }
        }
      }
    } else {
      const nameMatch = /(?:m[eé]todo|method|operaci[oó]n|operation|funci[oó]n|function)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (nameMatch) {
        methodName = nameMatch[1]!.trim();
      }
      const retMatch = /(?:devuelve|retorna|retorne|regrese|que\s+devuelva|returns?)\s+(?:un\s+|una\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(text);
      if (retMatch) {
        const normRet = stripAccents(retMatch[1]!.toLowerCase());
        returnType = methodTypeMap[normRet] || retMatch[1]!;
      }
      const paramMatch = /(?:recibe|con\s+par[aá]metro|par[aá]metro)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)(?:\s+(?:de\s+tipo|tipo|type|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*))?/i.exec(text);
      if (paramMatch) {
        const pName = paramMatch[1]!.trim();
        const pTypeRaw = paramMatch[2] ? stripAccents(paramMatch[2].trim().toLowerCase()) : 'string';
        params.push({ name: pName, type: methodTypeMap[pTypeRaw] || pTypeRaw });
      }
    }

    const stopWords = new Set(['el', 'la', 'un', 'una', 'clase', 'class', 'metodo', 'método']);
    if (stopWords.has(methodName.toLowerCase())) methodName = '';

    if (!targetClass && methodName) {
      for (const cls of classes) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        if (fullCls && Array.isArray(fullCls.methods)) {
          const hasM = fullCls.methods.some((m: any) => m.name && m.name.toLowerCase() === methodName.toLowerCase());
          if (hasM) {
            targetClass = cls;
            break;
          }
        }
      }
    }

    if (targetClass && methodName) {
      const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetClass!.id);
      const existingMethod = fullCls?.methods?.find((m: any) => m.name && m.name.toLowerCase().trim() === methodName.toLowerCase());
      if (existingMethod || /(?:cambi|modific|pas|change|modify)/i.test(normalized)) {
        return {
          action: 'modify',
          updates: {
            methods: [
              {
                class: targetClass.name,
                name: methodName,
                returnType,
                parameters: params.length > 0 ? params : (existingMethod?.parameters ?? []),
              },
            ],
          },
        };
      }

      return {
        action: 'modify',
        classes: [
          {
            name: targetClass.name,
            methods: [
              {
                name: methodName,
                returnType,
                parameters: params,
                visibility: '+',
              },
            ],
          },
        ],
      };
    }
  }

  // 3b. Adición / modificación / renombrado determinista de atributos en una clase existente
  // Ejemplos:
  // - "a la clase prestamo agregarle un id de tipo entero"
  // - "cambia el tipo del atributo id en Prestamo a string"
  // - "cambia el tipo de fechaDevolucion a string" (infiere que pertenece a Prestamo)
  // - "renombra el atributo fechaDevolucion a fechaEntrega en Prestamo"
  const isAttrIntent =
    !isMethodIntent &&
    /(?:agreg[aáeé]|a[ñn]ad[eé]|pon[eé]?|sum[aá]|add|insert[aáeé]|set|cambi[aáeé]|modific[aáeé]|pas[aáeé]|change|modify|renombr[aáeé]|rename)/i.test(normalized) &&
    /(?:atributo|campo|field|attribute|propiedad|property|tipo\s+de|un\s+id|el\s+id|id\b|:\s*(?:int|string|date|boolean|float|integer|texto|fecha|booleano|numero))/i.test(normalized);

  if (isAttrIntent) {
    const typeMap: Record<string, string> = {
      entero: 'int',
      entera: 'int',
      int: 'int',
      integer: 'int',
      numero: 'int',
      number: 'int',
      texto: 'string',
      cadena: 'string',
      string: 'string',
      str: 'string',
      booleano: 'boolean',
      booleana: 'boolean',
      bool: 'boolean',
      boolean: 'boolean',
      fecha: 'date',
      date: 'date',
      timestamp: 'date',
      datetime: 'date',
      decimal: 'float',
      float: 'float',
      double: 'float',
      real: 'float',
    };

    let attrName = '';
    let attrType = 'string';
    let newAttrName = '';
    let matchedCandClass: string | undefined;

    // Patrón renombrar atributo: "renombra el atributo <A> a/por <B>"
    const attrRenameMatch =
      /(?:renombr[aáeé]|cambi[aáeé]\s+el\s+nombre\s+del?\s+atributo)\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );
    if (attrRenameMatch) {
      attrName = attrRenameMatch[1]!;
      newAttrName = attrRenameMatch[2]!;
    }

    // Patrón cambio de tipo con clase intermedia: "cambia el tipo de <A> en <Clase> a <Tipo>"
    const changeTypeWithClass =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón cambio de tipo con clase al inicio: "en <Clase> cambia el tipo de <A> a <Tipo>"
    const changeTypeClassFirst =
      /(?:en|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón cambio de tipo directo: "cambia el tipo de <A> a <Tipo> [en <Clase>]"
    const changeTypeDirect =
      /(?:cambi[aáeé]|modific[aáeé]|pas[aáeé]|set)\s+(?:el\s+)?tipo\s+(?:del?\s+)?(?:atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      ) ||
      /(?:cambi[aáeé]|modific[aáeé])\s+(?:el\s+atributo\s+|campo\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:para\s+que\s+sea|a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:en|de|para)\s+(?:la\s+clase\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(
        text
      );

    // Patrón atributo:tipo
    const attrColonMatch =
      /(?:atributo|campo|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    // Patrón general: "<A> de tipo <Tipo>"
    const attrWithTypeMatch =
      /(?:(?:un|el|el\s+atributo|un\s+atributo|atributo|campo|field|property)\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:de\s+tipo|tipo|type|as)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );

    const idDirectMatch =
      /(?:un\s+id|el\s+id|id)\s*(?:de\s+tipo|tipo|type|as)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)?/i.exec(
        text
      );

    if (attrRenameMatch) {
      // ya asignado
    } else if (changeTypeWithClass) {
      attrName = changeTypeWithClass[1]!;
      matchedCandClass = changeTypeWithClass[2]!;
      const rawType = stripAccents(changeTypeWithClass[3]!);
      attrType = typeMap[rawType] || rawType;
    } else if (changeTypeClassFirst) {
      matchedCandClass = changeTypeClassFirst[1]!;
      attrName = changeTypeClassFirst[2]!;
      const rawType = stripAccents(changeTypeClassFirst[3]!);
      attrType = typeMap[rawType] || rawType;
    } else if (changeTypeDirect) {
      attrName = changeTypeDirect[1]!;
      const rawType = stripAccents(changeTypeDirect[2]!);
      attrType = typeMap[rawType] || rawType;
      if (changeTypeDirect[3]) matchedCandClass = changeTypeDirect[3];
    } else if (attrColonMatch) {
      attrName = attrColonMatch[1]!;
      const rawType = stripAccents(attrColonMatch[2]!);
      attrType = typeMap[rawType] || rawType;
    } else if (attrWithTypeMatch) {
      const candName = attrWithTypeMatch[1]!;
      const stopWords = new Set(['clase', 'class', 'tipo', 'type', 'de', 'la', 'el', 'un', 'una']);
      if (!stopWords.has(candName.toLowerCase())) {
        attrName = candName;
        const rawType = stripAccents(attrWithTypeMatch[2]!);
        attrType = typeMap[rawType] || rawType;
      }
    } else if (idDirectMatch) {
      attrName = 'id';
      const rawType = idDirectMatch[1] ? stripAccents(idDirectMatch[1]) : 'int';
      attrType = typeMap[rawType] || 'int';
    }

    // Buscar clase objetivo
    let targetClass: { id: string; name: string } | undefined;
    if (matchedCandClass) {
      const match = findClosestClassName(matchedCandClass, classes);
      if (match && match.distance <= 2) {
        targetClass = classes.find((c) => c.name.toLowerCase() === match.matchedName.toLowerCase());
      }
    }
    const targetClassMatch =
      /(?:a\s+la\s+clase|en\s+la\s+clase|para\s+la\s+clase|de\s+la\s+clase|to\s+class|in\s+class|on\s+class|a|en|para)\s+(?:de\s+asociaci[oó]n\s+)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(text);
    if (targetClassMatch) {
      const cand = targetClassMatch[1]!;
      const match = findClosestClassName(cand, classes);
      if (match && match.distance <= 2) {
        targetClass = classes.find((c) => c.name.toLowerCase() === match.matchedName.toLowerCase());
      }
    }

    if (!targetClass) {
      for (const cls of classes) {
        const cNorm = stripAccents(cls.name);
        if (normalized.includes(cNorm)) {
          targetClass = cls;
          break;
        }
      }
    }

    // Si la clase no fue nombrada explícitamente, buscar qué clase del lienzo posee este atributo
    if (!targetClass && attrName) {
      const aNorm = attrName.toLowerCase();
      for (const cls of classes) {
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === cls.id);
        if (fullCls && Array.isArray(fullCls.attributes)) {
          const hasAttr = fullCls.attributes.some((a: any) => a.name && a.name.toLowerCase() === aNorm);
          if (hasAttr) {
            targetClass = cls;
            break;
          }
        }
      }
    }

    if (targetClass) {
      // Soporte para múltiples atributos simultáneos: ej. "agregale numeroEdicion:int y anio:int"
      const allColonMatches = Array.from(
        text.matchAll(/([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*:\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/g)
      );

      if (allColonMatches.length > 1 && !/(?:cambi|modific|pas|renombr)/i.test(normalized)) {
        const multiAttrs = allColonMatches.map((m) => {
          const name = m[1]!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');
          const rawType = stripAccents(m[2]!);
          return {
            name,
            type: typeMap[rawType] || rawType,
            visibility: '+',
          };
        });

        return {
          action: 'modify',
          classes: [
            {
              name: targetClass.name,
              attributes: multiAttrs,
            },
          ],
        };
      }

      if (attrName) {
        const cleanAttrName = attrName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');

        // Caso Renombrado de atributo
        if (newAttrName) {
          const cleanNewName = newAttrName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '');
          return {
            action: 'modify',
            renames: {
              attributes: [
                {
                  class: targetClass.name,
                  from: cleanAttrName,
                  to: cleanNewName,
                },
              ],
            },
          };
        }

        // Comprobar si el atributo ya existe en la clase (en cuyo caso es una modificación de tipo)
        const fullCls = currentDiagram?.classes?.find((c: any) => c.id === targetClass!.id);
        const existingAttr = fullCls?.attributes?.find((a: any) => a.name && a.name.toLowerCase() === cleanAttrName.toLowerCase());

        if (existingAttr || /(?:cambi|modific|pas|change|modify)/i.test(normalized)) {
          return {
            action: 'modify',
            updates: {
              attributes: [
                {
                  class: targetClass.name,
                  name: cleanAttrName,
                  type: attrType,
                },
              ],
            },
          };
        }

        // Si es adición de nuevo atributo
        return {
          action: 'modify',
          classes: [
            {
              name: targetClass.name,
              attributes: [
                {
                  name: cleanAttrName,
                  type: attrType,
                  visibility: '+',
                },
              ],
            },
          ],
        };
      }
    }
  }

  // 3c. Mutación de multiplicidades, roles y clases de asociación en relaciones existentes
  const isMultiplicityOrRoleIntent =
    /(?:multiplicidad|cardinalidad|multiplicity|cardinality|rol\b|role\b|clase\s+de\s+asociaci[oó]n)/i.test(normalized) ||
    (/(?:cambi|modific|pon|set|change|modify|ajust)/i.test(normalized) &&
      /(?:1\.\.\*|0\.\.\*|0\.\.1|\b1\b\s+a\s+\*|\b1\b\s+a\s+muchos|muchos\s+a\s+\b1\b|muchos\s+a\s+muchos|uno\s+a\s+muchos|muchos\s+a\s+uno|uno\s+a\s+uno)/i.test(normalized));

  if (isMultiplicityOrRoleIntent && associations.length > 0) {
    const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
    const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
    const mentionedClasses = classes.filter((c) => {
      const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
      if (regex.test(normalized)) return true;
      if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
      if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
      return false;
    });
    mentionedClasses.sort((a, b) => b.name.length - a.name.length);

    let matchingAssoc: any = null;
    let sourceCls: { id: string; name: string } | null = null;
    let targetCls: { id: string; name: string } | null = null;

    if (mentionedClasses.length >= 2) {
      for (let i = 0; i < mentionedClasses.length; i++) {
        for (let j = i + 1; j < mentionedClasses.length; j++) {
          const ci = mentionedClasses[i]!;
          const cj = mentionedClasses[j]!;
          const found = associations.find(
            (a) =>
              (a.sourceClassId === ci.id && a.targetClassId === cj.id) ||
              (a.sourceClassId === cj.id && a.targetClassId === ci.id)
          );
          if (found) {
            matchingAssoc = found;
            sourceCls = found.sourceClassId === ci.id ? ci : cj;
            targetCls = found.targetClassId === cj.id ? cj : ci;
            break;
          }
        }
        if (matchingAssoc) break;
      }
    } else if (associations.length === 1) {
      matchingAssoc = associations[0]!;
      sourceCls = classes.find((c) => c.id === matchingAssoc.sourceClassId) || null;
      targetCls = classes.find((c) => c.id === matchingAssoc.targetClassId) || null;
    }

    if (matchingAssoc && sourceCls && targetCls) {
      let sourceMultiplicity: string | undefined;
      let targetMultiplicity: string | undefined;

      // Extracción de multiplicidades explícitas (ej: "1..* y 1", "uno a muchos", "1 a *")
      const multPairMatch = /(1\.\.\*|0\.\.\*|0\.\.1|\*|1)\s*(?:a|y|-|\/)\s*(1\.\.\*|0\.\.\*|0\.\.1|\*|1)/i.exec(text);
      if (multPairMatch) {
        sourceMultiplicity = multPairMatch[1] === '*' ? '1..*' : multPairMatch[1];
        targetMultiplicity = multPairMatch[2] === '*' ? '1..*' : multPairMatch[2];
      } else if (/(?:uno|1)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '1..*';
      } else if (/(?:muchos|\*)\s+a\s+(?:uno|1)/i.test(normalized)) {
        sourceMultiplicity = '1..*';
        targetMultiplicity = '1';
      } else if (/(?:muchos|\*)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
        sourceMultiplicity = '1..*';
        targetMultiplicity = '1..*';
      } else if (/(?:uno|1)\s+a\s+(?:uno|1)/i.test(normalized)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '1';
      } else if (/(?:cero|0)\s+a\s+(?:muchos|\*)/i.test(normalized)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '0..*';
      } else if (/(?:cero|0)\s+a\s+(?:uno|1)/i.test(normalized)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '0..1';
      }

      // Si se especificó una sola multiplicidad con "a <mult>"
      if (!sourceMultiplicity && !targetMultiplicity) {
        const singleMultMatch = /(?:multiplicidad\s+(?:sea\s+|a\s+|por\s+)?|a\s+)(1\.\.\*|0\.\.\*|0\.\.1|\*|1)/i.exec(text);
        if (singleMultMatch) {
          const val = singleMultMatch[1] === '*' ? '1..*' : singleMultMatch[1]!;
          targetMultiplicity = val;
        }
      }

      // Extracción de roles (sourceRole / targetRole)
      let sourceRole: string | undefined;
      let targetRole: string | undefined;
      const roleOriginMatch = /(?:rol\s+origen|source\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
      if (roleOriginMatch) sourceRole = roleOriginMatch[1];
      const roleDestMatch = /(?:rol\s+destino|target\s+role)\s+(?:sea\s+|es\s+|a\s+)?["']?([A-Za-z_][\w]*)["']?/i.exec(text);
      if (roleDestMatch) targetRole = roleDestMatch[1];

      // Extracción de clase de asociación
      let assocClass: string | undefined;
      const assocClassMatch = /(?:clase\s+de\s+asociaci[oó]n|association\s+class)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
      if (assocClassMatch) {
        const candClass = assocClassMatch[1]!;
        const foundAssocCls = classes.find((c) => c.name.toLowerCase() === candClass.toLowerCase());
        if (foundAssocCls) assocClass = foundAssocCls.name;
      }

      if (sourceMultiplicity || targetMultiplicity || sourceRole || targetRole || assocClass) {
        return {
          action: 'modify',
          updates: {
            associations: [
              {
                source: sourceCls.name,
                target: targetCls.name,
                sourceMultiplicity: sourceMultiplicity || matchingAssoc.sourceMultiplicity || '1',
                targetMultiplicity: targetMultiplicity || matchingAssoc.targetMultiplicity || '1',
                sourceRole,
                targetRole,
                associationClass: assocClass,
              },
            ],
          },
        };
      }
    }
  }

  // 3d. Adición o vinculación de Clase de Asociación (con nombre explícito o autogenerado PascalCase)
  const isAssocClassCreate =
    /(?:clase\s+de\s+asociaci[oó]n|association\s+class)/i.test(normalized) &&
    /(?:agreg[aáeé]|a[ñn]ad[eé]|cre[aáeé]|pon[eé]?|sum[aá]|add|insert|asoci[aáeé]|asign[aáeé]|convert)/i.test(normalized);

  if (isAssocClassCreate && classes.length >= 2) {
    const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
    const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
    const mentionedClasses = classes.filter((c) => {
      const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
      if (regex.test(normalized)) return true;
      if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
      if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
      return false;
    });

    if (mentionedClasses.length >= 2) {
      const c1 = mentionedClasses[0]!;
      const c2 = mentionedClasses[1]!;

      // Buscar si el usuario dio un nombre explícito a la clase de asociación
      let assocClassName: string | undefined;
      const explicitNameMatch =
        /(?:llamada|nombrada|con\s+el\s+nombre|named)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text) ||
        /(?:clase\s+de\s+asociaci[oó]n|association\s+class)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?\s+(?:entre|between)/i.exec(text);

      if (explicitNameMatch) {
        assocClassName = explicitNameMatch[1];
      } else {
        // Convención estándar: concatenar en PascalCase ambos extremos (ej. EstudianteCurso)
        assocClassName = `${c1.name}${c2.name}`;
      }

      const matchingAssoc = associations.find(
        (a) =>
          (a.sourceClassId === c1.id && a.targetClassId === c2.id) ||
          (a.sourceClassId === c2.id && a.targetClassId === c1.id)
      );

      const createdClasses: any[] = [];
      if (!classes.some((c) => c.name.toLowerCase() === assocClassName!.toLowerCase())) {
        createdClasses.push({
          name: assocClassName,
          attributes: [],
          methods: [],
        });
      }

      if (matchingAssoc) {
        const src = classes.find((c) => c.id === matchingAssoc.sourceClassId) || c1;
        const tgt = classes.find((c) => c.id === matchingAssoc.targetClassId) || c2;
        return {
          action: 'modify',
          classes: createdClasses.length > 0 ? createdClasses : undefined,
          updates: {
            associations: [
              {
                source: src.name,
                target: tgt.name,
                associationClass: assocClassName,
              },
            ],
          },
        };
      } else {
        return {
          action: 'modify',
          classes: createdClasses.length > 0 ? createdClasses : undefined,
          associations: [
            {
              source: c1.name,
              target: c2.name,
              sourceMultiplicity: '1..*',
              targetMultiplicity: '1..*',
              associationClass: assocClassName,
            },
          ],
        };
      }
    }
  }

  // 3e. Adición de Asociación N-aria (diamante central conectando 3+ clases)
  const isNaryCreate =
    /(?:n-ari[ao]|ternari[ao]|nary|ternary)/i.test(normalized) &&
    /(?:cre[aáeé]|agreg[aáeé]|a[ñn]ad[eé]|pon[eé]|conect[aáeé]|arm[aáeé]|hac[eé]|haz)/i.test(normalized);

  if (isNaryCreate && classes.length >= 3) {
    const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
    const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
    const mentionedClasses = classes.filter((c) => {
      const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
      if (regex.test(normalized)) return true;
      if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
      if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
      return false;
    });

    if (mentionedClasses.length >= 3) {
      let naryName: string | undefined;
      const naryNameMatch = /(?:llamada|nombrada|con\s+el\s+nombre|named)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(text);
      if (naryNameMatch) naryName = naryNameMatch[1];

      return {
        action: 'modify',
        naryAssociations: [
          {
            name: naryName,
            members: mentionedClasses.map((c) => ({
              class: c.name,
              multiplicity: '1',
            })),
          },
        ],
      };
    }
  }

  // 4. Mutación de relación (asociación <-> composición <-> agregación <-> generalización <-> realización <-> dependencia)
  const isGeneralization = /(?:generalizaci[oó]n|generalization|herencia|hered[aáeé]|extends|subclase|superclase)/i.test(normalized);
  const isRealization = /(?:realizaci[oó]n|realization|implement[aáeé]|implements)/i.test(normalized);
  const isDependency = /(?:dependencia|dependency|depend[eé])/i.test(normalized);

  const isRelationChange =
    ((/(?:cambi|modific|hac|haz|convert|set|poner?|pon\b|que\s+sea|renombr|change|modify|switch|turn|make|conect|asoci|vincul|relacion|cre|agreg|a[ñn]ad).*?(?:relaci[oó]n|asociaci[oó]n|tipo\s+de\s+relaci[oó]n|v[ií]nculo|relation|relationship|association|link)/i.test(
      normalized
    ) && /(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance|realization|dependency|shared|composite|none)/i.test(normalized)) ||
    /(?:tipo\s+de\s+relaci[oó]n|cambia\s+el\s+tipo|relationship\s+type|change\s+type)\s+(?:a|por|to)\s+(?:una?\s+|an?\s+)?(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance)/i.test(
      normalized
    ) ||
    /(?:relaci[oó]n|relationship|association)\s+(?:entre|between)\s+["']?[A-Za-z_ñÑáéíóúÁÉÍÓÚ].*?\(.*?(?:composici|agregaci|asociaci|generaliz|hered|realiz|depend|composite|aggregation|association)/i.test(
      text
    ) ||
    /(?:a|por|to|into)\s+(?:una?\s+|an?\s+)?(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|generalizaci[oó]n|herencia|realizaci[oó]n|dependencia|composition|aggregation|generalization|inheritance)/i.test(
      normalized
    ) ||
    /(?:conect[aáeé]|asoci[aáeé]|vincul[aáeé]|relacion[aáeé]|connect|link|associate)\s+.*?(?:con\b|entre|between|y\b|and\b)/i.test(
      normalized
    ) ||
    ((isGeneralization || isRealization || isDependency) &&
      /(?:cambi|modific|pas[aá]|convert|turn|relaci[oó]n|hac|haz|sea|hered|subclase|superclase|extends|implement|depend)/i.test(normalized)));

  if (isRelationChange) {
    let targetAggregation: 'composite' | 'shared' | 'none' = 'none';
    if (/(?:composici[oó]n|composition|composite|compone|rombo\s+negro|black\s+diamond)/i.test(normalized)) {
      targetAggregation = 'composite';
    } else if (/(?:agregaci[oó]n|aggregation|shared|rombo\s+blanco|white\s+diamond)/i.test(normalized)) {
      targetAggregation = 'shared';
    } else if (/(?:asociaci[oó]n\s+simple|asociaci[oó]n\b|simple|plain\s+association)/i.test(normalized)) {
      targetAggregation = 'none';
    }

    // Extracción explícita de la entidad "todo" (contenedor donde va el rombo)
    const wholeMatch =
      /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      ) ||
      /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is|diamond\s+on)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(
        text
      );
    const rawWholeName = wholeMatch ? wholeMatch[1]?.toLowerCase() : undefined;

    // Buscar qué clases del lienzo están mencionadas en el texto (con soporte para plurales: prestamos -> prestamo)
    const cleanedTextWithoutSpaces = normalized.replace(/\s+/g, '');
    const tokens = normalized.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean);
    const mentionedClasses = classes.filter((c) => {
      const cNameNorm = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const regex = new RegExp(`(?:\\b|["'])${cNameNorm}(?:\\b|["'])`, 'i');
      if (regex.test(normalized)) return true;
      if (tokens.some((t) => classExactOrPluralMatches(t, cNameNorm))) return true;
      if (cleanedTextWithoutSpaces.includes(cNameNorm)) return true;
      return false;
    });

    // Ordenar por longitud de nombre descendente para priorizar clases más específicas
    // (ej. 'PrestamoLibro' tiene precedencia sobre 'Prestamo' si ambas coinciden en el texto)
    mentionedClasses.sort((a, b) => b.name.length - a.name.length);

    const resolveAggregationEnd = (sourceCls: { id: string; name: string }, targetCls: { id: string; name: string }, existingAssoc?: any): 'source' | 'target' => {
      if (rawWholeName) {
        const sNorm = sourceCls.name.toLowerCase();
        const tNorm = targetCls.name.toLowerCase();
        if (sNorm === rawWholeName || sNorm.startsWith(rawWholeName) || rawWholeName.startsWith(sNorm)) return 'source';
        if (tNorm === rawWholeName || tNorm.startsWith(rawWholeName) || rawWholeName.startsWith(tNorm)) return 'target';
      }
      if (existingAssoc) {
        const sm = existingAssoc.sourceMultiplicity || '';
        const tm = existingAssoc.targetMultiplicity || '';
        if (sm === '1' && (tm.includes('*') || tm === '0..*' || tm === '1..*')) return 'source';
        if (tm === '1' && (sm.includes('*') || sm === '0..*' || sm === '1..*')) return 'target';
        if (existingAssoc.aggregationEnd) return existingAssoc.aggregationEnd;
      }
      return 'source';
    };

    const generalizations: Array<any> = currentDiagram.generalizations || [];
    const realizations: Array<any> = currentDiagram.realizations || [];
    const dependencies: Array<any> = currentDiagram.dependencies || [];

    // Helper para determinar el orden de subclase/superclase
    const resolveHierarchyOrder = (clsA: { id: string; name: string }, clsB: { id: string; name: string }): { subclass: { id: string; name: string }; superclass: { id: string; name: string } } => {
      const aNorm = clsA.name.toLowerCase();
      const bNorm = clsB.name.toLowerCase();
      // "A hereda de B" o "A es subclase de B"
      if (new RegExp(`${aNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${bNorm}`, 'i').test(normalized)) {
        return { subclass: clsA, superclass: clsB };
      }
      if (new RegExp(`${bNorm}\\s+(?:hereda\\s+de|herede\\s+de|sea\\s+subclase\\s+de|subclase\\s+de|extends)\\s+${aNorm}`, 'i').test(normalized)) {
        return { subclass: clsB, superclass: clsA };
      }
      // "B es padre de A" o "B es superclase de A"
      if (new RegExp(`${bNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${aNorm}`, 'i').test(normalized)) {
        return { subclass: clsA, superclass: clsB };
      }
      if (new RegExp(`${aNorm}\\s+(?:es\\s+padre\\s+de|sea\\s+superclase\\s+de|superclase\\s+de)\\s+${bNorm}`, 'i').test(normalized)) {
        return { subclass: clsB, superclass: clsA };
      }
      // Orden de aparición en el texto: el primero mencionado suele ser la entidad especializada (ej. "entre ejemplar y prestamo")
      const posA = normalized.indexOf(aNorm);
      const posB = normalized.indexOf(bNorm);
      if (posA !== -1 && posB !== -1 && posA <= posB) {
        return { subclass: clsA, superclass: clsB };
      }
      return { subclass: clsB, superclass: clsA };
    };

    if (mentionedClasses.length >= 2) {
      // Evaluar todas las combinaciones posibles de pares de clases mencionadas contra las asociaciones y generalizaciones existentes en el lienzo
      let matchingAssoc: any = null;
      let matchingGen: any = null;
      let sourceCls: { id: string; name: string } | null = null;
      let targetCls: { id: string; name: string } | null = null;

      for (let i = 0; i < mentionedClasses.length; i++) {
        for (let j = i + 1; j < mentionedClasses.length; j++) {
          const ci = mentionedClasses[i]!;
          const cj = mentionedClasses[j]!;
          const foundAssoc = associations.find(
            (a) =>
              (a.sourceClassId === ci.id && a.targetClassId === cj.id) ||
              (a.sourceClassId === cj.id && a.targetClassId === ci.id)
          );
          if (foundAssoc) {
            matchingAssoc = foundAssoc;
            sourceCls = foundAssoc.sourceClassId === ci.id ? ci : cj;
            targetCls = foundAssoc.targetClassId === cj.id ? cj : ci;
            break;
          }
          const foundGen = generalizations.find(
            (g) =>
              (g.subClassId === ci.id && g.superClassId === cj.id) ||
              (g.subClassId === cj.id && g.superClassId === ci.id)
          );
          if (foundGen) {
            matchingGen = foundGen;
            sourceCls = ci;
            targetCls = cj;
            break;
          }
        }
        if (matchingAssoc || matchingGen) break;
      }

      let c1 = sourceCls || mentionedClasses[0]!;
      let c2 = targetCls || mentionedClasses[1]!;

      // Si no existe asociación/generalización previa, respetar el orden de aparición en el texto
      // (el primer mencionado es source y el segundo target)
      if (!sourceCls && !targetCls && mentionedClasses.length >= 2) {
        const pos1 = normalized.indexOf(c1.name.toLowerCase());
        const pos2 = normalized.indexOf(c2.name.toLowerCase());
        if (pos1 !== -1 && pos2 !== -1 && pos1 > pos2) {
          const temp = c1;
          c1 = c2;
          c2 = temp;
        }
      }

      // Caso 4A: El usuario pide GENERALIZACIÓN / HERENCIA
      if (isGeneralization) {
        const hierarchy = resolveHierarchyOrder(c1, c2);
        const deletions: any = {};
        if (matchingAssoc) {
          const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
          const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
          if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
        }
        return {
          action: 'modify',
          deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
          generalizations: [
            {
              subclass: hierarchy.subclass.name,
              superclass: hierarchy.superclass.name,
            },
          ],
        };
      }

      // Caso 4B: El usuario pide REALIZACIÓN (interfaz)
      if (isRealization) {
        const hierarchy = resolveHierarchyOrder(c1, c2);
        const deletions: any = {};
        if (matchingAssoc) {
          const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
          const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
          if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
        }
        return {
          action: 'modify',
          deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
          realizations: [
            {
              clientClass: hierarchy.subclass.name,
              supplierInterface: hierarchy.superclass.name,
            },
          ],
        };
      }

      // Caso 4C: El usuario pide DEPENDENCIA
      if (isDependency) {
        const hierarchy = resolveHierarchyOrder(c1, c2);
        const deletions: any = {};
        if (matchingAssoc) {
          const s = classes.find((c) => c.id === matchingAssoc.sourceClassId);
          const t = classes.find((c) => c.id === matchingAssoc.targetClassId);
          if (s && t) deletions.associations = [{ source: s.name, target: t.name }];
        }
        return {
          action: 'modify',
          deletions: Object.keys(deletions).length > 0 ? deletions : undefined,
          dependencies: [
            {
              clientClass: hierarchy.subclass.name,
              supplierClass: hierarchy.superclass.name,
            },
          ],
        };
      }

      // Caso 4D: El usuario pide cambiar a ASOCIACIÓN / AGREGACIÓN / COMPOSICIÓN
      // Si existía una generalización previa entre ellos, la eliminamos para dar paso a la asociación
      if (matchingGen) {
        const sub = classes.find((c) => c.id === matchingGen.subClassId);
        const sup = classes.find((c) => c.id === matchingGen.superClassId);
        if (sub && sup) {
          const calcEnd = resolveAggregationEnd(sub, sup);
          return {
            action: 'modify',
            deletions: {
              generalizations: [{ subclass: sub.name, superclass: sup.name }],
            },
            associations: [
              {
                source: sub.name,
                target: sup.name,
                aggregation: targetAggregation,
                aggregationEnd: calcEnd,
                sourceMultiplicity: '1',
                targetMultiplicity: '1..*',
              },
            ],
          };
        }
      }

      if (matchingAssoc && sourceCls && targetCls) {
        const calcEnd = resolveAggregationEnd(sourceCls, targetCls, matchingAssoc);
        const explicit = extractExplicitMultiplicities(text, sourceCls.name, targetCls.name);
        const updateAssoc: any = {
          source: sourceCls.name,
          target: targetCls.name,
          aggregation: targetAggregation,
          aggregationEnd: calcEnd,
        };
        if (explicit?.sourceMultiplicity) updateAssoc.sourceMultiplicity = explicit.sourceMultiplicity;
        if (explicit?.targetMultiplicity) updateAssoc.targetMultiplicity = explicit.targetMultiplicity;

        return {
          action: 'modify',
          updates: {
            associations: [updateAssoc],
          },
        };
      }

      // Si no existe asociación previa entre las dos clases, creamos la asociación con el tipo de agregación requerido
      const calcEnd = resolveAggregationEnd(c1, c2);
      let srcMult = '1';
      let tgtMult = '1..*';
      const explicit = extractExplicitMultiplicities(text, c1.name, c2.name);
      if (explicit) {
        if (explicit.sourceMultiplicity) srcMult = explicit.sourceMultiplicity;
        if (explicit.targetMultiplicity) tgtMult = explicit.targetMultiplicity;
      }
      return {
        action: 'modify',
        associations: [
          {
            source: c1.name,
            target: c2.name,
            sourceMultiplicity: srcMult,
            targetMultiplicity: tgtMult,
            aggregation: targetAggregation,
            aggregationEnd: calcEnd,
          },
        ],
      };
    } else if (mentionedClasses.length === 1) {
      // Si se menciona exactamente una clase y tiene una única asociación conectada en el lienzo
      const c = mentionedClasses[0]!;
      const touchingAssocs = associations.filter(
        (a) => a.sourceClassId === c.id || a.targetClassId === c.id
      );
      if (touchingAssocs.length === 1) {
        const singleAssoc = touchingAssocs[0]!;
        const src = classes.find((cls) => cls.id === singleAssoc.sourceClassId);
        const tgt = classes.find((cls) => cls.id === singleAssoc.targetClassId);
        if (src && tgt) {
          if (isGeneralization) {
            const hierarchy = resolveHierarchyOrder(src, tgt);
            return {
              action: 'modify',
              deletions: {
                associations: [{ source: src.name, target: tgt.name }],
              },
              generalizations: [
                {
                  subclass: hierarchy.subclass.name,
                  superclass: hierarchy.superclass.name,
                },
              ],
            };
          }
          const calcEnd = resolveAggregationEnd(src, tgt, singleAssoc);
          return {
            action: 'modify',
            updates: {
              associations: [
                {
                  source: src.name,
                  target: tgt.name,
                  aggregation: targetAggregation,
                  aggregationEnd: calcEnd,
                },
              ],
            },
          };
        }
      }
    } else if (associations.length === 1) {
      // Si el lienzo tiene una sola asociación y el usuario pide cambiar el tipo de relación
      const singleAssoc = associations[0]!;
      const src = classes.find((c) => c.id === singleAssoc.sourceClassId);
      const tgt = classes.find((c) => c.id === singleAssoc.targetClassId);
      if (src && tgt) {
        if (isGeneralization) {
          const hierarchy = resolveHierarchyOrder(src, tgt);
          return {
            action: 'modify',
            deletions: {
              associations: [{ source: src.name, target: tgt.name }],
            },
            generalizations: [
              {
                subclass: hierarchy.subclass.name,
                superclass: hierarchy.superclass.name,
              },
            ],
          };
        }
        const calcEnd = resolveAggregationEnd(src, tgt, singleAssoc);
        return {
          action: 'modify',
          updates: {
            associations: [
              {
                source: src.name,
                target: tgt.name,
                aggregation: targetAggregation,
                aggregationEnd: calcEnd,
              },
            ],
          },
        };
      }
    }
  }

  return null;
}

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
export async function synthesizeDomainModel(
  text: string,
  diagramId: string,
  llm?: LlmPort,
  currentDiagram?: any,
  force = false
): Promise<BatchDelta | null> {
  if (!force && !isDomainModelRequest(text)) {
    return null;
  }

  // Si no hay LLM o no soporta chat, no falsificamos con plantillas estáticas
  if (!llm || typeof (llm as any).chat !== 'function') {
    return null;
  }

  const existingClassesList = currentDiagram?.classes?.map((c: any) => c.name).filter(Boolean) || [];
  const contextHint = existingClassesList.length > 0
    ? `\nThe current diagram already has these classes: ${existingClassesList.join(', ')}. Reuse these exact names if relating to them, and do not duplicate them unless creating distinct entities.`
    : '';

  const existingAssocsList = currentDiagram?.associations?.map((a: any) => {
    const src = currentDiagram.classes?.find((c: any) => c.id === a.sourceClassId)?.name;
    const tgt = currentDiagram.classes?.find((c: any) => c.id === a.targetClassId)?.name;
    return src && tgt ? `${src} <-> ${tgt}` : null;
  }).filter(Boolean) || [];

  const assocHint = existingAssocsList.length > 0
    ? `\nExisting relationships already in the canvas: ${existingAssocsList.join(', ')}. CRITICAL: DO NOT duplicate or create redundant relationships between classes that already have an association! Only link new entities to existing ones without repeating existing links.`
    : '';

  const isSpecificClassCreation = /\b(?:clase|calse|clse|class|tabla)\s+[A-Za-z_ñÑáéíóúÁÉÍÓÚ]/i.test(text);
  const domainMatch = !isSpecificClassCreation ? matchCanonicalDomain(text) : null;
  const isEn = !/(?:es|spanish|español)/i.test(process.env.DEFAULT_LANGUAGE || '') &&
    !/(?:veterinaria|tienda|cl[ií]nica|hospital|hotel|banco|facultad|universidad|gimnasio|restaurante|aerol[ií]nea|sistema|pedido|comercio)/i.test(text);
  const groundingHint = domainMatch ? `\n${formatDomainGroundingPrompt(domainMatch.domain, isEn)}` : '';

  const requestedClassMatches = Array.from(
    text.matchAll(/\b(?:clases?|calses?|clses?|class(?:es)?|tablas?)\s+(?:llamadas?\s+|llamados?\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*(?:\s*,\s*[A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)*)/gi)
  ).flatMap((m) => m[1].split(/[\s,]+/)).map(cleanClassName).filter(Boolean);
  const specificClassesHint = requestedClassMatches.length > 0
    ? `\nCRITICAL SPECIFIC CLASSES: The user explicitly requested to create these EXACT class name(s): ${requestedClassMatches.join(', ')}. You MUST name the classes EXACTLY with these requested names. DO NOT substitute them with other domain names (e.g. NEVER substitute Pedido with Factura).`
    : '';

  const systemPrompt = [
    'You are a senior UML software architect and domain-driven design expert.',
    'Design a concise, realistic, and cohesive domain model tailored specifically to the user request.',
    groundingHint,
    specificClassesHint,
    'CRITICAL LANGUAGE RULE: If the prompt or context is in Spanish, name all classes, attributes, and roles in Spanish. If in English, name them in English.',
    'CRITICAL ENTITIES RULE: If candidate classes or entities are requested or implied, you MUST include ALL of them in the "classes" array. For EVERY SINGLE CLASS, you MUST provide 2 to 4 realistic domain attributes with clean types (string, int, float, boolean, date). NEVER leave attributes empty.',
    'CRITICAL RELATIONSHIP TYPES RULES:',
    '1. DEFAULT TO PLAIN ASSOCIATION: Most relationships between classes are standard associations with "aggregation": "none" (e.g. Cliente -> Pedido, DetalleFactura -> Producto, Medico -> Paciente, Pasajero -> Vuelo).',
    '2. COMPOSITION (strong whole-part lifecycle dependency: if the whole is deleted, parts cease to exist): Set "aggregation": "composite" on the association (e.g. Factura -> DetalleFactura, Pedido -> ItemPedido, Venta -> LineaVenta). The container/whole is the "source".',
    '3. AGGREGATION (use SPARINGLY, ONLY when a container aggregates independent entities that survive without the container): Set "aggregation": "shared" (e.g. Biblioteca -> Libro, Departamento -> Empleado). Do NOT use aggregation for simple references.',
    '4. INHERITANCE / GENERALIZATION: For specialized subtypes ("is-a" relationship, e.g. Perro is an Animal, TarjetaCredito is a MetodoPago), declare in "generalizations": [{"subclass": "TarjetaCredito", "superclass": "MetodoPago"}]. Subclasses inherit attributes from superclass; do NOT repeat inherited attributes in the subclass. NEVER create an association between a subclass and its superclass.',
    '5. INTERMEDIATE ASSOCIATION CLASSES: Use an association class ONLY when an M:N relationship genuinely carries its own link attributes (e.g. DetalleVenta between Venta and Producto with cantidad/precio; Inscripcion between Estudiante and Curso with nota/fecha). In that case, specify "associationClass": "ClassName" on the association, and declare that class in "classes". For relationships without link attributes (1:1, 1:N, or attribute-less M:N), use direct associations without intermediate classes. NEVER concatenate class names (e.g. NEVER "VentaProducto").',
    '6. ZERO DUPLICATES: Between any two classes, create AT MOST ONE relationship. NEVER output multiple associations or association + aggregation or association + generalization between the same pair of classes.',
    '7. GRAPH CONNECTIVITY: Every class MUST be connected to at least one other class. No isolated or floating classes.',
    '8. STANDARD MULTIPLICITIES: Associations must use standard UML 2.5.1 multiplicities ONLY: "1", "0..1", "1..*", "0..*". NEVER output non-standard labels like "n", "m", or "n-to-1".',
    contextHint,
    assocHint,
    'CRITICAL EXTENSION RULE: When extending an existing diagram, do NOT re-declare existing classes in "classes". Include ONLY the new classes being created. In "associations", you CAN and SHOULD reference existing classes by name to connect them to the new classes.',
    'CRITICAL MULTIPLICITY RULE: "sourceMultiplicity" applies to "source", and "targetMultiplicity" applies to "target". E.g. If "1 Libro has many Reservas", then: if source="Libro" and target="Reserva", sourceMultiplicity="1", targetMultiplicity="1..*". If source="Reserva" and target="Libro", sourceMultiplicity="1..*", targetMultiplicity="1". Never invert cardinalities.',
    'CRITICAL ANTI-HALLUCINATION RULE: ONLY output the classes explicitly requested by the user. NEVER invent or include extra entities (such as Cliente, Factura, Usuario, etc.) that were not asked for by the user. If the user asks to create 1 class, output EXACTLY 1 class. If the user asks to create 2 classes, output EXACTLY 2 classes.',
    'CRITICAL REFACTORING & RENAMING RULE: If the user requests to rename, update, or delete classes, members, or relationships, use:',
    '  - Renames: "renames": {"classes": [{"from": "OldName", "to": "NewName"}]}. DO NOT put the renamed class into "classes" as a new class!',
    '  - Updates: "updates": {"classes": [{"name": "ClassName", "isAbstract": true}], "associations": [{"source": "A", "target": "B", "sourceMultiplicity": "1", "targetMultiplicity": "0..*"}]}',
    '  - Deletions: "deletions": {"classes": ["DeletedClassName"], "associations": [{"source": "A", "target": "B"}]}',
    'Output ONLY a valid raw JSON object matching the requested domain:',
    '{',
    '  "classes": [',
    '    {"name": "DomainEntity", "attributes": ["id:int", "name:string"]}',
    '  ],',
    '  "associations": []',
    '}',
  ].filter(Boolean).join('\n');

  try {
    let responseText = '';
    const chunkCollector = (chunk: string) => {
      responseText += chunk;
    };

    let response: any;
    try {
      response = await (llm as any).chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        {
          timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000,
          temperature: 0.1,
          maxTokens: 650,
          onChunk: chunkCollector,
        }
      );
    } catch (llmErr) {
      if (responseText.trim().length > 0) {
        const rescued = robustParseDomainJson(responseText);
        if (rescued && rescued.classes?.length) {
          if (rescued.classes.length > 5) {
            rescued.classes = rescued.classes.slice(0, 5);
          }
          const expanded = expandSemanticDomainToDelta(rescued, diagramId, currentDiagram, text);
          if (expanded && expanded.deltas.length >= 1) {
            return expanded;
          }
        }
      }
      if (domainMatch) {
        const canonicalSemantic = canonicalToSemantic(domainMatch.domain);
        const fallback = expandSemanticDomainToDelta(canonicalSemantic, diagramId, currentDiagram, text);
        if (fallback && fallback.deltas.length >= 1) {
          return fallback;
        }
      }
      if (requestedClassMatches.length > 0) {
        const fallbackClasses: SemanticClass[] = requestedClassMatches.slice(0, 5).map((name) => ({
          name,
          attributes: [
            { name: 'id', type: 'string' },
            { name: 'nombre', type: 'string' },
            { name: 'estado', type: 'string' },
          ],
        }));
        const existingClassNames = (currentDiagram?.classes || []).map((c: any) => c.name);
        const anchorName = existingClassNames[0];
        const fallbackAssocs: SemanticAssociation[] = [];
        if (anchorName) {
          fallbackClasses.forEach((fc) => {
            if (fc.name !== anchorName) {
              fallbackAssocs.push({
                source: anchorName,
                target: fc.name,
                aggregation: 'none',
                sourceMultiplicity: '1',
                targetMultiplicity: '0..*',
              });
            }
          });
        }
        const fallbackModel: SemanticDomainModel = {
          action: 'modify',
          classes: fallbackClasses,
          associations: fallbackAssocs,
        };
        const expanded = expandSemanticDomainToDelta(fallbackModel, diagramId, currentDiagram, text);
        if (expanded && expanded.deltas.length >= 1) {
          return expanded;
        }
      }
      return null;
    }

    if (typeof response !== 'string') {
      return null;
    }

    const parsed = robustParseDomainJson(response);
    if (!parsed) {
      return null;
    }

    if (parsed.classes && parsed.classes.length > 5) {
      const allowedNames = new Set(parsed.classes.slice(0, 5).map((c: any) => c.name));
      parsed.classes = parsed.classes.slice(0, 5);
      if (parsed.associations) {
        parsed.associations = parsed.associations.filter(
          (a: any) => allowedNames.has(a.source) || allowedNames.has(a.target)
        );
      }
    }

    const expanded = expandSemanticDomainToDelta(parsed, diagramId, currentDiagram, text);
    if (expanded && expanded.deltas.length >= 1) {
      return expanded;
    }

    return null;
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
    return null;
  }
}

