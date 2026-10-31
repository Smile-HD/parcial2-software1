import type { BatchDelta, LlmPort } from '@app/core';
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
  associationClass?: string;
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

export interface SemanticDeletions {
  classes?: string[];
  attributes?: Array<{ class: string; attribute: string }>;
  methods?: Array<{ class: string; method: string }>;
  associations?: Array<{ source: string; target: string }>;
}

export interface SemanticDomainModel {
  action?: 'create' | 'modify' | 'delete';
  classes?: SemanticClass[];
  associations?: SemanticAssociation[];
  generalizations?: SemanticGeneralization[];
  realizations?: SemanticRealization[];
  dependencies?: SemanticDependency[];
  naryAssociations?: SemanticNaryAssociation[];
  deletions?: SemanticDeletions;
}

export function isDomainModelRequest(text: string): boolean {
  return /(crea|crear|dise[ñn]|model|arma|armar|implement|aplica|agrega|inserta|pone|pon\b|hace|haz|constru|reserva|base de datos|sistema|diagrama|quiero un|necesito un|hazme|haceme|hacer|make|build|generate|design|model|add|apply)\b/i.test(text);
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
  const cleaned = cleanClassName(raw).toLowerCase();
  if (cleaned.endsWith('es') && cleaned.length > 4) return cleaned.slice(0, -2);
  if (cleaned.endsWith('s') && cleaned.length > 3) return cleaned.slice(0, -1);
  return cleaned;
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
  const matches = Array.from(
    text.matchAll(/\b(?:clase|calse|clse|class|tabla)\s+(?:llamada\s+|llamado\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/gi)
  ).map((m) => cleanClassName(m[1]));
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
  const hasDeletions = !!model.deletions && (
    (Array.isArray(model.deletions.classes) && model.deletions.classes.length > 0) ||
    (Array.isArray(model.deletions.attributes) && model.deletions.attributes.length > 0) ||
    (Array.isArray(model.deletions.methods) && model.deletions.methods.length > 0) ||
    (Array.isArray(model.deletions.associations) && model.deletions.associations.length > 0)
  );

  if (!hasClasses && !hasAssociations && !hasGeneralizations && !hasRealizations && !hasDependencies && !hasNary && !hasDeletions) {
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
        classId = crypto.randomUUID();
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
              const aName = subParts[0]?.trim().replace(/^[-+*#~]\s*/, '').replace(/^[\[\(\{]+/, '');
              const aType = subParts[1]?.trim().replace(/[\]\)\}]+$/, '') || 'string';
              if (aName) attrList.push({ name: aName, type: aType });
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

        // Sanitizar si el modelo devolvió "nombre:string" adherido dentro del campo name
        if (name.includes(':')) {
          const colonParts = name.split(':');
          name = colonParts[0]?.trim() ?? '';
          const embeddedType = colonParts[1]?.trim();
          if (embeddedType && (!type || type === 'string')) {
            type = embeddedType;
          }
        }
        name = name.replace(/^[-+*#~]\s*/, '').replace(/\s+/g, '').replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
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

  // Clave canónica de pares para asegurar unicidad absoluta de aristas entre dos clases
  const getPairKey = (idA: string, idB: string): string => [idA, idB].sort().join('::');
  const seenConnectedPairs = new Set<string>();

  // Pre-cargar generalizaciones, realizaciones y dependencias existentes para no crear asociaciones redundantes
  if (currentDiagram?.generalizations && Array.isArray(currentDiagram.generalizations)) {
    for (const g of currentDiagram.generalizations) {
      if (g.subClassId && g.superClassId) {
        seenConnectedPairs.add(getPairKey(g.subClassId, g.superClassId));
      }
    }
  }
  if (currentDiagram?.realizations && Array.isArray(currentDiagram.realizations)) {
    for (const r of currentDiagram.realizations) {
      if (r.clientClassId && r.supplierInterfaceId) {
        seenConnectedPairs.add(getPairKey(r.clientClassId, r.supplierInterfaceId));
      }
    }
  }
  if (currentDiagram?.dependencies && Array.isArray(currentDiagram.dependencies)) {
    for (const d of currentDiagram.dependencies) {
      if (d.clientClassId && d.supplierClassId) {
        seenConnectedPairs.add(getPairKey(d.clientClassId, d.supplierClassId));
      }
    }
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

      const canBeComposite = isRequestedComposite && !isRecursive && isHeuristicComposition(sourceName, targetName, !!assocClassId || !!assoc.associationClass);
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
          if (assocClassId) updateDelta.newAssociationClassId = assocClassId;

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
        const cid = classIdMap.get(m.class.toLowerCase().trim());
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

  // 7. Eliminaciones puntuales (clases, atributos, métodos, relaciones)
  if (model.deletions) {
    // Borrado de clases
    if (Array.isArray(model.deletions.classes)) {
      model.deletions.classes.forEach((cname) => {
        const cid = classIdMap.get(cname.toLowerCase().trim());
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

    // Borrado de atributos
    if (Array.isArray(model.deletions.attributes)) {
      model.deletions.attributes.forEach((item) => {
        const lower = item.class.toLowerCase().trim();
        const cid = classIdMap.get(lower);
        const ec = existingClassesMap.get(lower);
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
        const lower = item.class.toLowerCase().trim();
        const cid = classIdMap.get(lower);
        const ec = existingClassesMap.get(lower);
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

    // Borrado de asociaciones
    if (Array.isArray(model.deletions.associations) && currentDiagram?.associations) {
      model.deletions.associations.forEach((item) => {
        const srcId = classIdMap.get(item.source.toLowerCase().trim());
        const tgtId = classIdMap.get(item.target.toLowerCase().trim());
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
 * Parsea el JSON devuelto por el modelo, tolerando markdown y truncamientos parciales.
 */
export function robustParseDomainJson(raw: string): SemanticDomainModel | null {
  const isDummyName = (str?: string) => !str || /^(NombreClase|ClassName|ClaseA|ClaseB|Origen|Destino|Hijo|Padre)$/i.test(str.trim());

  // 1. Intento de parseo JSON estándar
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
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
                const aName = subParts[0]?.trim().replace(/^[-+*#~]\s*/, '').replace(/^[\[\(\{]+/, '');
                const aType = subParts[1]?.trim().replace(/[\]\)\}]+$/, '') || 'string';
                if (aName) list.push({ name: aName, type: aType });
              }
            } else if (item && typeof item === 'object') {
              list.push(item);
            }
          }
          return list;
        } else if (typeof rawAttrs === 'object') {
          return Object.entries(rawAttrs).map(([k, v]) => ({
            name: k,
            type: typeof v === 'string' ? v : 'string',
          }));
        } else if (typeof rawAttrs === 'string') {
          const cleaned = rawAttrs.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
          return cleaned.split(/,\s*(?=[a-zA-Z_])/).map((s) => {
            const parts = s.split(':');
            return {
              name: parts[0]?.trim().replace(/^[-+*#~]\s*/, '') || '',
              type: parts[1]?.trim() || 'string',
            };
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

      const deletions = parsed.deletions;

      if (
        classes.length > 0 ||
        associations.length > 0 ||
        generalizations.length > 0 ||
        realizations.length > 0 ||
        dependencies.length > 0 ||
        naryAssociations.length > 0 ||
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
    text.matchAll(/\b(?:clase|calse|clse|class|tabla)\s+(?:llamada\s+|llamado\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/gi)
  ).map((m) => cleanClassName(m[1])).filter(Boolean);
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
    'Output ONLY a valid raw JSON object matching the requested domain (DO NOT copy example class or attribute names like CatalogItem, Order, OrderItem unless they belong to the user requested domain):',
    '{',
    '  "classes": [',
    '    {"name": "Order", "attributes": ["orderNumber:string", "totalAmount:float"]},',
    '    {"name": "OrderItem", "attributes": ["quantity:int", "unitPrice:float"]}',
    '  ],',
    '  "associations": [',
    '    {"source": "Order", "target": "OrderItem", "aggregation": "composite", "sourceMultiplicity": "1", "targetMultiplicity": "1..*"}',
    '  ],',
    '  "generalizations": []',
    '}',
  ].filter(Boolean).join('\n');

  try {
    const response = await (llm as any).chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000, temperature: 0.1, maxTokens: 2000 }
    );

    if (typeof response !== 'string') {
      return null;
    }

    const parsed = robustParseDomainJson(response);
    if (!parsed) {
      return null;
    }

    const expanded = expandSemanticDomainToDelta(parsed, diagramId, currentDiagram, text);
    if (expanded && expanded.deltas.length >= 1) {
      return expanded;
    }
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
  }

  return null;
}

