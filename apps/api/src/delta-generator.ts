import type { BatchDelta } from '@app/core';
import { stripAccents, findClosestClassName, normalizeUmlUtterance } from '@app/adapters-ai';

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
  const childPattern = /(?:detalle|item|\blinea\b|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;
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

    // Prune existing associations between sub and super to prevent zombie lines
    const existingAssocsForGen = currentDiagram?.associations?.filter((a: any) =>
      (a.sourceClassId === subId && a.targetClassId === superId) ||
      (a.sourceClassId === superId && a.targetClassId === subId)
    ) || [];
    for (const ea of existingAssocsForGen) {
      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'delete',
        associationId: ea.id,
      });
    }

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

      const existingAssocsForRealiz = currentDiagram?.associations?.filter((a: any) =>
        (a.sourceClassId === client && a.targetClassId === supplier) ||
        (a.sourceClassId === supplier && a.targetClassId === client)
      ) || [];
      for (const ea of existingAssocsForRealiz) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'association',
          op: 'delete',
          associationId: ea.id,
        });
      }

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
      const client = resolveClassId(d.clientClass);
      const supplier = resolveClassId(d.supplierClass);
      if (!client || !supplier || client === supplier) return;
      const pair = getPairKey(client, supplier);
      if (seenConnectedPairs.has(pair)) return;

      const existingAssocsForDep = currentDiagram?.associations?.filter((a: any) =>
        (a.sourceClassId === client && a.targetClassId === supplier) ||
        (a.sourceClassId === supplier && a.targetClassId === client)
      ) || [];
      for (const ea of existingAssocsForDep) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'association',
          op: 'delete',
          associationId: ea.id,
        });
      }

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

      const isExplicitInText = !!originText && /(?:composici[oó]n|composision|composite)\b/i.test(originText);
      const canBeComposite = isRequestedComposite && !isRecursive && (isExplicitInText || isHeuristicComposition(sourceName, targetName, !!assocClassId || !!assoc.associationClass) || isHeuristicComposition(targetName, sourceName, !!assocClassId || !!assoc.associationClass));
      const targetAggregation = canBeComposite ? 'composite' : (isRequestedShared ? 'shared' : 'none');
      const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;
      const targetEnd = (canBeComposite || isRequestedShared)
        ? (assoc.aggregationEnd ?? (childPattern.test(sourceName) && !childPattern.test(targetName) ? 'target' : 'source'))
        : 'source';

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
        // Cero duplicados: Si existían múltiples asociaciones paralelas entre este mismo par, eliminamos los zombies
        const duplicateAssocs = currentDiagram?.associations?.filter((a: any) =>
          a.id !== existingAssoc.id &&
          ((a.sourceClassId === sourceId && a.targetClassId === targetId) ||
           (a.sourceClassId === targetId && a.targetClassId === sourceId))
        ) || [];
        for (const dup of duplicateAssocs) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'association',
            op: 'delete',
            associationId: dup.id,
          });
        }

        // Sanitizar nombres inválidos que son palabras funcionales o tipos de relación (ej. "una", "generalizacion")
        const invalidAssocNames = /^(?:un|una|el|la|los|las|por|de|a|con|para|generalizaci[oó]n|composici[oó]n|agregaci[oó]n|asociaci[oó]n|realizaci[oó]n|dependencia|inheritance|composition|aggregation|association|dependency|realization)$/i;
        const sanitizedAssocName = (assoc.name && !invalidAssocNames.test(assoc.name.trim())) ? assoc.name : undefined;

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
        const endChanged = targetEnd !== existingAssoc.aggregationEnd;
        const multChanged = (newSourceMult !== undefined && newSourceMult !== existingAssoc.sourceMultiplicity) ||
                            (newTargetMult !== undefined && newTargetMult !== existingAssoc.targetMultiplicity);
        const metaChanged = (sanitizedAssocName !== undefined && sanitizedAssocName !== existingAssoc.name) ||
                            (assoc.sourceRole !== undefined && assoc.sourceRole !== existingAssoc.sourceRole) ||
                            (assoc.targetRole !== undefined && assoc.targetRole !== existingAssoc.targetRole) ||
                            (assocClassId !== undefined && assocClassId !== existingAssoc.associationClassId);

        if (aggregationChanged || endChanged || multChanged || metaChanged) {
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
          if (sanitizedAssocName !== undefined) updateDelta.name = sanitizedAssocName;
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
