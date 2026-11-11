/**
 * Funciones auxiliares para sanitización, multiplicidades y concordancia léxica en la generación de deltas.
 */
import { stripAccents, findClosestClassName } from '@app/adapters-ai';

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
  if (s.length > 64) {
    s = s.slice(0, 64);
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
    uuid: 'uuid',
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
  const normType = typeMap[rawNorm] || (['int', 'float', 'string', 'boolean', 'date', 'uuid'].includes(rawNorm) ? rawNorm : (rawNorm || 'string'));

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
