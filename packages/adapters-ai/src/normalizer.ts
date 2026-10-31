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

  // ── A. Verbos de Creación (crear, armar, construir, diseñar, modelar, generar, definir, registrar, etc.)
  // Abarca: Tuteo (crea), Voseo (creá), Ustedeo (cree), Vosotros (cread), Infinitivo (crear)
  // Enclíticos: crealo, creala, creame, armalo, etc.
  s = s.replace(
    /(?<!\p{L})(?:cre[aáeé]|cread|crear|craer|creaer|crrea|crer|cre[aá]l[oa]|cr[eé]al[oa]|cre[aá]me|cr[eé]ame|cre[aá]nos|cr[eé]anos)(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:arm[aáeé]|armad|armar|arm[aá]l[oa]|[aá]rmal[oa]|arm[aá]me)(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:constru[yíi]|construy[ea]?|construid|construir|constru[yíi]l[oa]|constr[uú]yel[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:(?:diseñ|diséñ|disen|disén)[aáeé]|(?:diseñ|disen)ad|(?:diseñ|disen)ar|(?:diseñ|diséñ|disen|disén)[aá]l[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:model[aáeé]|modelad|modelar|model[aá]l[oa]|m[oó]delal[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:gener[aáeé]|generad|generar|gener[aá]l[oa]|gen[eé]ral[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:defin[eíiaé]|definid|definir|defin[eíi]l[oa]|def[ií]nal[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:insert[aáeé]|insertad|insertar|insert[aá]l[oa]|ins[eé]rtal[oa])(?!\p{L})/giu,
    'crea'
  );
  s = s.replace(
    /(?<!\p{L})(?:registr[aáeé]|registrad|registrar|registr[aá]l[oa]|reg[ií]stral[oa])(?!\p{L})/giu,
    'crea'
  );

  // ── B. Verbos de Borrado / Eliminación (borrar, eliminar, sacar, quitar, remover, suprimir, descartar)
  s = s.replace(
    /(?<!\p{L})(?:borr[aáeé]|borrad|borrar|brr[aá]|brrar|borr[aá]l[oa]|b[oó]rral[oa]|borr[aá]me)(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:elimin[aáeé]|elmin[aáe]?|elimnar|eliminad|eliminar|elminar|elimin[aá]l[oa]|elim[ií]nal[oa]|elimin[aá]me)(?!\p{L})/giu,
    'elimina'
  );
  s = s.replace(
    /(?<!\p{L})(?:sac[aáeé]|saque|sacad|sacar|sac[aá]l[oa]|s[aá]cal[oa]|sac[aá]me)(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:quit[aáeé]|quitad|quitar|quit[aá]l[oa]|qu[ií]tal[oa]|quit[aá]me)(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:remov[eé]|remuev[ea]?|removad|removed|remover|remov[eé]l[oa]|remu[eé]vel[oa])(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:suprim[eíiaé]|suprimid|suprimir|suprim[eíi]l[oa]|supr[ií]mal[oa])(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:descart[aáeé]|descartad|descartar|descart[aá]l[oa]|desc[aá]rtal[oa])(?!\p{L})/giu,
    'borra'
  );
  s = s.replace(
    /(?<!\p{L})(?:vol[aáeé]|purg[aáeé]|limpi[aáeé])(?!\p{L})/giu,
    'borra'
  );

  // ── C. Verbos de Agregar Miembros (agregar, añadir, meter, poner, sumar, incorporar, anexar)
  s = s.replace(
    /(?<!\p{L})(?:agreg[aáeé]|agrg|agrga|agre|agregad|agregar|agreg[aá]le[s]?|agr[eé]gale[s]?|agreg[aá]me|agrrename)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:(?:añad|anad|añád|anád)[eíiaé]|(?:añad|anad)id|(?:añad|anad)ir|(?:añad|anad|añád|anád)[eíi]le[s]?)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:met[eé]|meta|meted|meter|met[eé]le[s]?|m[eé]tele[s]?)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:pon|pon[eé]|ponga|poned|poner|pon[eé]le[s]?|p[oó]nle[s]?)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:sum[aáeé]|sumad|sumar|sum[aá]le[s]?|s[uú]male[s]?)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:incorpor[aáeé]|incorporad|incorporar|incorpor[aá]le[s]?|incorp[oó]rale[s]?)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:anex[aáeé]|anexad|anexar|adicion[aáeé]|adicionar)(?!\p{L})/giu,
    'agrega'
  );
  s = s.replace(
    /(?<!\p{L})(?:inclu[yíi]|incluy[ea]?|incluid|incluir|inclu[yíi]le[s]?|incl[uú]yele[s]?)(?!\p{L})/giu,
    'agrega'
  );

  // ── D. Verbos de Renombrar / Modificar (renombrar, cambiar, modificar, actualizar, editar)
  s = s.replace(
    /(?<!\p{L})(?:renombr[aáeé]|renomvrar|renomra|rnombre|renombrad|renombrar|renombr[aá]l[oa]|ren[oó]mbral[oa])(?!\p{L})/giu,
    'renombra'
  );
  s = s.replace(
    /(?<!\p{L})(?:cambi[aáeé]|cambiad|cambiar|cambi[aá]le[s]?|c[aá]mbiale[s]?|cambi[aá]l[oa]|c[aá]mbial[oa])(?!\p{L})/giu,
    'renombra'
  );
  s = s.replace(
    /(?<!\p{L})(?:modific[aá]|modifique|modificad|modificar|modific[aá]l[oa]|modif[ií]cal[oa])(?!\p{L})/giu,
    'renombra'
  );
  s = s.replace(
    /(?<!\p{L})(?:actualiz[aá]|actualice|actualizad|actualizar|actualiz[aá]l[oa]|actual[ií]zal[oa])(?!\p{L})/giu,
    'renombra'
  );
  s = s.replace(
    /(?<!\p{L})(?:edit[aáeé]|editad|editar|edit[aá]l[oa]|ed[ií]tal[oa])(?!\p{L})/giu,
    'renombra'
  );

  // ── E. Verbos de Relación / Conexión (conectar, relacionar, asociar, vincular, unir, enlazar)
  s = s.replace(
    /(?<!\p{L})(?:conect[aáeé]|conectad|conectar|conect[aá]l[oa]s?|con[eé]ctal[oa]s?|conect[aá]le)(?!\p{L})/giu,
    'conecta'
  );
  s = s.replace(
    /(?<!\p{L})(?:relacion[aáeé]|relacionad|relacionar|relacion[aá]l[oa]s?|relaci[oó]nal[oa]s?)(?!\p{L})/giu,
    'conecta'
  );
  s = s.replace(
    /(?<!\p{L})(?:asoci[aáeé]|asociad|asociar|asoci[aá]l[oa]s?|as[oó]cial[oa]s?)(?!\p{L})/giu,
    'conecta'
  );
  s = s.replace(
    /(?<!\p{L})(?:vincul[aáeé]|vinculad|vincular|vincul[aá]l[oa]s?|v[ií]nculal[oa]s?)(?!\p{L})/giu,
    'conecta'
  );
  s = s.replace(
    /(?<!\p{L})(?:un[eíi]|unid|unir|unan|un[eíi]l[oa]s?)(?!\p{L})/giu,
    'conecta'
  );
  s = s.replace(
    /(?<!\p{L})(?:enlaz[aá]|enlace|enlazad|enlazar|enlaz[aá]l[oa]s?|enl[aá]zal[oa]s?)(?!\p{L})/giu,
    'conecta'
  );

  // ── F. Clasificadores y contenedores del metamodelo UML (NUNCA clases de negocio)
  s = s.replace(/(?<!\p{L})(?:calse|clse|claze|calses|clses)(?!\p{L})/giu, 'clase');
  s = s.replace(/(?<!\p{L})(?:tavla|tavlas)(?!\p{L})/giu, 'tabla');

  // ── G. Miembros y propiedades del metamodelo UML
  s = s.replace(/(?<!\p{L})(?:atrbutos?|atrubutos?|atriutos?|atribtos?|atibutos?|atribs?|atrivutos?|propiedades|campos)(?!\p{L})/giu, 'atributos');
  s = s.replace(/(?<!\p{L})(?:mtodo|mtodos|metodo|método|metodos|métodos|funciones|operaciones)(?!\p{L})/giu, 'metodos');
  s = s.replace(/(?<!\p{L})(?:relacion|relación|relaciones|asociacion|asociación|asociaciones)(?!\p{L})/giu, 'asociacion');

  // ── G2. Typos fonéticos en nombres comunes de atributos (NO afecta nombres de clases)
  s = s.replace(/(?<!\p{L})(?:nbre|nombr|nomvre|nobmre)(?!\p{L})/giu, 'nombre');
  s = s.replace(/(?<!\p{L})(?:feha|fcha)(?!\p{L})/giu, 'fecha');
  s = s.replace(/(?<!\p{L})(?:nimero|nro)(?!\p{L})/giu, 'numero');
  s = s.replace(/(?<!\p{L})(?:totl)(?!\p{L})/giu, 'total');
  s = s.replace(/(?<!\p{L})(?:improte)(?!\p{L})/giu, 'importe');
  s = s.replace(/(?<!\p{L})(?:cdigo)(?!\p{L})/giu, 'codigo');

  // ── H. Conectores gramaticales y preposiciones
  s = s.replace(/(?<!\p{L})(?:cn|c\/)(?!\p{L})/giu, 'con');
  s = s.replace(/(?<!\p{L})(?:llamda|llamd[ao])(?!\p{L})/giu, 'llamada');
  s = s.replace(/(?<!\p{L})(?:d|del)\s+tipo(?!\p{L})/giu, 'de tipo');

  // ── I. Fraseos de Relaciones Especiales (Composición, Agregación, Herencia, Realización, Dependencia, Reflexiva)
  // Composición (fuerte): "compone", "compuesto por", "es parte de"
  s = s.replace(
    /(?<!\p{L})(?:est[aá]\s+compuest[ao]\s+(?:por|de)|compuest[ao]\s+por|es\s+composici[oó]n\s+de|contiene\s+fuertemente|contiene\s+exclusivamente)(?!\p{L})/giu,
    'compone'
  );
  s = s.replace(
    /(?<!\p{L})(?:es\s+parte\s+de|forma\s+parte\s+de|pertenece\s+a)(?!\p{L})/giu,
    'es parte de'
  );
  // Agregación (débil): "agregación entre", "agrega"
  s = s.replace(
    /(?<!\p{L})(?:est[aá]\s+agregad[ao]\s+a|es\s+agregaci[oó]n\s+de)(?!\p{L})/giu,
    'agregación entre'
  );
  // Herencia / Generalización: estandarizar a "inherits from" (reconocido directamente por el intérprete)
  s = s.replace(
    /(?<!\p{L})(?:hereda\s+de|es\s+un\s+tipo\s+de|es\s+subtipo\s+de|es\s+una\s+subclase\s+de|subclase\s+de|es\s+hija\s+de|clase\s+hija\s+de|extiende\s+(?:de|a))(?!\p{L})/giu,
    'inherits from'
  );
  // Realización: estandarizar a "implementa" (reconocido directamente)
  s = s.replace(
    /(?<!\p{L})(?:cumple\s+el\s+contrato\s+de|es\s+realizaci[oó]n\s+de|es\s+implementaci[oó]n\s+de)(?!\p{L})/giu,
    'implementa'
  );
  // Dependencia: estandarizar a "depende de"
  s = s.replace(
    /(?<!\p{L})(?:hace\s+uso\s+de|tiene\s+dependencia\s+de|tiene\s+dependencia\s+con)(?!\p{L})/giu,
    'depende de'
  );
  // Reflexiva: estandarizar a "consigo misma"
  s = s.replace(
    /(?<!\p{L})(?:a\s+s[ií]\s+mism[ao]|de\s+forma\s+reflexiva|relaci[oó]n\s+reflexiva)(?!\p{L})/giu,
    'consigo misma'
  );

  // ── J. Multiplicidades y Cardinalidades (Estandarización léxica en español)
  // 1 a N / Uno a muchos
  s = s.replace(
    /(?<!\p{L})(?:uno\s+a\s+muchos|uno\s+a\s+varios|1\s+a\s+muchos|1\s+a\s+varios|1\s*:\s*[nN\*]|1\s+a\s+[nN\*]|de\s+uno\s+a\s+muchos|de\s+uno\s+a\s+varios)(?!\p{L})/giu,
    '1 a N'
  );
  // N a 1 / Muchos a uno
  s = s.replace(
    /(?<!\p{L})(?:muchos\s+a\s+uno|varios\s+a\s+uno|[nN\*]\s*:\s*1|[nN\*]\s+a\s+1|muchos\s+para\s+un[oa]|varios\s+para\s+un[oa]|de\s+muchos\s+a\s+uno)(?!\p{L})/giu,
    'N a 1'
  );
  // N a M / Muchos a muchos
  s = s.replace(
    /(?<!\p{L})(?:muchos\s+a\s+muchos|varios\s+a\s+varios|[nN\*]\s*:\s*[nNmM\*]|[nN\*]\s+a\s+[nNmM\*]|de\s+muchos\s+a\s+muchos)(?!\p{L})/giu,
    'N a M'
  );
  // 1 a 1 / Uno a uno
  s = s.replace(
    /(?<!\p{L})(?:uno\s+a\s+uno|1\s*:\s*1|1\s+a\s+1|un[íi]voca|biun[íi]voca|uno\s+solo\s+a\s+uno\s+solo)(?!\p{L})/giu,
    '1 a 1'
  );
  // 0..1 / Cero o uno
  s = s.replace(
    /(?<!\p{L})(?:cero\s+o\s+uno|cero\s+a\s+uno|0\s+o\s+1|0\s+a\s+1|a\s+lo\s+sumo\s+uno|como\s+m[aá]ximo\s+uno)(?!\p{L})/giu,
    '0..1'
  );
  // 1..* / Uno o más
  s = s.replace(
    /(?<!\p{L})(?:uno\s+o\s+m[aá]s|1\s+o\s+m[aá]s|al\s+menos\s+uno|como\s+m[íi]nimo\s+uno)(?!\p{L})/giu,
    '1..*'
  );
  // 0..* / Cero o más
  s = s.replace(
    /(?<!\p{L})(?:cero\s+o\s+m[aá]s|cero\s+a\s+muchos|cualquier\s+cantidad)(?!\p{L})/giu,
    '0..*'
  );

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

  // Aliases canónicos en lenguaje natural -> tipo primitivo
  if (/^(?:str|texto|text|cadena|varchar|char|alfanumerico|alfanumérico)$/.test(t)) return 'string';
  if (/^(?:entero|numero|número|num|count|long|short|byte|numero\s+raro|cantidad|entero\s+largo)$/.test(t)) return 'int';
  if (/^(?:real|float|double|decimal|fraccionario)$/.test(t)) return 'float';
  if (/^(?:fecha|date|datetime|timestamp|hora|time|fechahora)$/.test(t)) return 'date';
  if (/^(?:booleano|bool|logico|lógico|flag|binario|verdaderofalso|si\s*no)$/.test(t)) return 'boolean';
  if (/^(?:vacio|vacío|void|nada|ninguno)$/.test(t)) return 'void';

  // Si no es un tipo primitivo conocido de UML (ej: banana, color):
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
