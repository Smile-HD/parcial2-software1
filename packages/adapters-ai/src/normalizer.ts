/**
 * @app/adapters-ai — Normalizador y sanitizador determinista para UML y comandos Amongus.
 *
 * Módulo aislado y de alta resiliencia para:
 * 1. Normalización de tildes/acentos en imperativos usando límites unicode (?<!\p{L}) / (?!\p{L}).
 * 2. Corrección fonética y léxica de typos comunes en comandos de modelado.
 * 3. Sanitización de tipos UML (evita tipos inválidos como 'banana' o 'color' en codegen).
 * 4. Segmentación atómica de comandos compuestos (separados por ';' o conjunciones).
 * 5. Detección temprana de contradicciones (crear y borrar en el mismo turno).
 * 6. Extracción de excepciones en borrados masivos ('todas menos Libro y Autor').
 * 7. Sugerencia de comandos slash con typos (/auditt -> /audit).
 */

// ── 1. Diccionario de normalización de tildes y verbos ────────────────────────

export function normalizeUmlUtterance(raw: string): string {
  if (!raw) return '';
  let s = raw;

  // Normalizar acentos en verbos imperativos hacia formas canónicas sin acento
  // Usamos (?<!\p{L}) y (?!\p{L}) con bandera 'u' para que letras acentuadas (á, é, í, ó, ú, ñ)
  // respeten los límites de palabra sin romperse como ocurre con \b en ASCII.
  s = s.replace(/(?<!\p{L})(?:cre[aá]|crear|craer|creaer|crrea|crer|creame|creáme)(?!\p{L})/giu, 'crea');
  s = s.replace(/(?<!\p{L})(?:agreg[aá]|agrg|agrga|agre|agregar|agregame|agregáme|agregale|agregále|añad[eí]|añadir|añadile|pon|ponele|sumal[eo])(?!\p{L})/giu, 'agrega');
  s = s.replace(/(?<!\p{L})(?:elimin[aá]|elmin[aá]|eliminar|elminar|eliminame|elimináme)(?!\p{L})/giu, 'elimina');
  s = s.replace(/(?<!\p{L})(?:borr[aá]|brr[aá]|borrar|brrar|borrame|borráme)(?!\p{L})/giu, 'borra');
  s = s.replace(/(?<!\p{L})(?:sac[aá]|sacar|sacame|sacáme|quit[aá]|quitar|quitame|quitáme)(?!\p{L})/giu, 'borra');
  s = s.replace(/(?<!\p{L})(?:renombr[aá]|renomvrar|renomra|rnombre|renombrar)(?!\p{L})/giu, 'renombra');
  s = s.replace(/(?<!\p{L})(?:arm[aá]|armar|armame|armáme|constru[yí]|construir)(?!\p{L})/giu, 'crea');

  // Clasificadores y contenedores
  s = s.replace(/(?<!\p{L})(?:calse|clse|claze|calses|clses)(?!\p{L})/giu, 'clase');
  s = s.replace(/(?<!\p{L})(?:tavla|tavlas)(?!\p{L})/giu, 'tabla');

  // Miembros y propiedades
  s = s.replace(/(?<!\p{L})(?:atrbutos?|atrubutos?|atriutos?|atribtos?|atibutos?|atribs?|atrivutos?|propedad|propedades)(?!\p{L})/giu, 'atributos');
  s = s.replace(/(?<!\p{L})(?:mtodo|mtodos|metodo|método|metodos|métodos)(?!\p{L})/giu, 'metodos');

  // Atributos y campos típicos
  s = s.replace(/(?<!\p{L})(?:nbre|nombr|nomvre|nobmre)(?!\p{L})/giu, 'nombre');
  s = s.replace(/(?<!\p{L})(?:feha|fcha)(?!\p{L})/giu, 'fecha');
  s = s.replace(/(?<!\p{L})(?:nimero|nro|n[uú]m)(?!\p{L})/giu, 'numero');
  s = s.replace(/(?<!\p{L})(?:improte)(?!\p{L})/giu, 'importe');
  s = s.replace(/(?<!\p{L})(?:totl)(?!\p{L})/giu, 'total');
  s = s.replace(/(?<!\p{L})(?:prcio|prec)(?!\p{L})/giu, 'precio');
  s = s.replace(/(?<!\p{L})(?:sldo|sueld)(?!\p{L})/giu, 'sueldo');
  s = s.replace(/(?<!\p{L})(?:cdigo|cod)(?!\p{L})/giu, 'codigo');
  s = s.replace(/(?<!\p{L})(?:descrip|descr)(?!\p{L})/giu, 'descripcion');

  // Entidades comunes
  s = s.replace(/(?<!\p{L})(?:usario|usuaio)(?!\p{L})/giu, 'Usuario');
  s = s.replace(/(?<!\p{L})(?:poducto|prodcuto)(?!\p{L})/giu, 'Producto');
  s = s.replace(/(?<!\p{L})(?:clente)(?!\p{L})/giu, 'Cliente');
  s = s.replace(/(?<!\p{L})(?:emplado|empeado)(?!\p{L})/giu, 'Empleado');
  s = s.replace(/(?<!\p{L})(?:fctura|fatura|factra)(?!\p{L})/giu, 'Factura');
  s = s.replace(/(?<!\p{L})(?:estudinate|estudinte)(?!\p{L})/giu, 'Estudiante');
  s = s.replace(/(?<!\p{L})(?:aluno|alunmo)(?!\p{L})/giu, 'Alumno');

  // Conectores y preposiciones
  s = s.replace(/(?<!\p{L})(?:cn|c\/)(?!\p{L})/giu, 'con');
  s = s.replace(/(?<!\p{L})(?:llamda|llamd[ao])(?!\p{L})/giu, 'llamada');
  s = s.replace(/(?<!\p{L})(?:d|del)\s+tipo(?!\p{L})/giu, 'de tipo');

  return s;
}

// ── 2. Inferencia y Sanitización de Tipos UML ──────────────────────────────────

export function inferAttributeType(attrName: string): string {
  const lower = attrName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(?:cantidad|stock|edad|ano|anio|capacidad|legajo|numero|orden|piso|habitacion|telefono|codigo|id|count|folio|version|puerto)$/.test(lower)) {
    return 'int';
  }
  if (/^(?:precio|total|subtotal|monto|saldo|costo|peso|altura|cargahoraria|importe|tasa|sueldo|salario|promedio|porcentaje|tarifa|descuento|comision)$/.test(lower)) {
    return 'float';
  }
  if (/^(?:fecha|fechadeventa|fechacreacion|fechanacimiento|vencimiento|creadoen|actualizadoen|date|datetime|timestamp|ingreso|egreso|salida|llegada)$/.test(lower)) {
    return 'date';
  }
  if (/^(?:activo|habilitado|esadmin|disponible|pagado|estado|isadmin|active|enabled|vigente|borrado|eliminado)$/.test(lower)) {
    return 'boolean';
  }
  return 'string';
}

export function sanitizeUmlType(rawType: string, attrName: string): string {
  const t = rawType.toLowerCase().trim();

  // Tipos estándar válidos preservados
  if (t === 'string') return rawType.trim();
  if (t === 'int' || t === 'integer') return rawType.trim();
  if (t === 'float' || t === 'double' || t === 'decimal') return rawType.trim();
  if (t === 'boolean' || t === 'bool') return rawType.trim();
  if (t === 'date' || t === 'datetime' || t === 'timestamp') return rawType.trim();
  if (t === 'void') return 'void';

  // Aliases en lenguaje natural -> tipo canónico
  if (/^(?:str|texto|text|cadena|varchar|char|palabra|letras|alfanumerico|alfanumérico)$/.test(t)) return 'string';
  if (/^(?:entero|numero|número|num|count|long|short|byte|numero\s+raro|cantidad|entero\s+largo)$/.test(t)) return 'int';
  if (/^(?:real|monto|precio|dinero|porcentaje|importe|saldo|costo|tasa|valor\s+monetario)$/.test(t)) return 'float';
  if (/^(?:fecha|hora|time|fechahora|dia|año|mes)$/.test(t)) return 'date';
  if (/^(?:booleano|logico|lógico|flag|binario|verdaderofalso|si\s*no)$/.test(t)) return 'boolean';
  if (/^(?:vacio|vacío|nada|ninguno)$/.test(t)) return 'void';

  // Si no es un tipo primitivo conocido de UML (ej: banana, color, fruta):
  // inferir según la semántica del nombre del atributo
  return inferAttributeType(attrName);
}

// ── 3. Segmentación de Comandos Compuestos ────────────────────────────────────

export function splitCompoundUtterance(raw: string): string[] {
  if (!raw.includes(';')) return [raw.trim()];
  return raw
    .split(';')
    .map((p) => p.trim().replace(/^(?:and|y|e)\s+/iu, '').trim())
    .filter((p) => p.length > 0);
}

// ── 4. Detección de Contradicciones ──────────────────────────────────────────

export function detectContradiction(utterance: string): { contradictory: boolean; className?: string } {
  const norm = normalizeUmlUtterance(utterance);
  const isCreate = /(?<!\p{L})(?:crea|crear|agrega|agregar)(?!\p{L})[\s\S]*?(?<!\p{L})(?:clase|tabla|entidad)(?!\p{L})\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/iu.exec(norm);
  const isDelete = /(?<!\p{L})(?:borra|borrar|elimina|eliminar)(?!\p{L})[\s\S]*?(?<!\p{L})(?:clase|tabla|entidad)(?!\p{L})\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/iu.exec(norm);

  if (isCreate && isDelete && isCreate[1]!.toLowerCase() === isDelete[1]!.toLowerCase()) {
    return { contradictory: true, className: isCreate[1] };
  }
  return { contradictory: false };
}

// ── 5. Extracción de Excepciones en Borrado Masivo ────────────────────────────

export function extractExclusionClasses(utterance: string): string[] {
  const norm = normalizeUmlUtterance(utterance);
  const isWipe = /(?<!\p{L})(?:borra|borrar|elimina|eliminar)(?!\p{L})[\s\S]*?(?<!\p{L})(?:todas?|todos?|all)(?!\p{L})/iu.test(norm);
  if (!isWipe) return [];

  const exceptMatch = /(?<!\p{L})(?:menos|excepto|salvo|excluding|except)(?!\p{L})([\s\S]*)$/iu.exec(norm);
  if (!exceptMatch || !exceptMatch[1]) return [];

  const rawList = exceptMatch[1]
    .replace(/(?<!\p{L})(?:las?\s+clases?|las?\s+tablas?|a|la|el|los|las|de|y|e|and)(?!\p{L})/giu, ' ')
    .replace(/[,\.;]/g, ' ')
    .trim();

  return rawList
    .split(/\s+/)
    .map((w) => w.trim().replace(/[^A-Za-z_ñÑáéíóúÁÉÍÓÚ0-9]/g, ''))
    .filter((w) => w.length > 1);
}

// ── 6. Sugerencia de Comandos Slash (Distancia de Levenshtein) ──────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

const KNOWN_SLASH_COMMANDS = [
  '/help',
  '/reset',
  '/context',
  '/model',
  '/audit',
  '/suggest',
  '/apply',
  '/clear',
  '/export',
  '/layout',
];

export function findClosestSlashCommand(rawCmd: string): string | null {
  const lower = rawCmd.toLowerCase().trim();
  let closest: string | null = null;
  let minDistance = 999;

  for (const cmd of KNOWN_SLASH_COMMANDS) {
    const dist = levenshtein(lower, cmd);
    if (dist < minDistance && dist <= 3) {
      minDistance = dist;
      closest = cmd;
    }
  }
  return closest;
}
