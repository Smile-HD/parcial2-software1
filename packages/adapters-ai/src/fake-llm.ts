import {
  DeltaSchema,
  applyDelta,
  type AssociationDelta,
  type ClassDelta,
  type Dependency,
  type DependencyDelta,
  type Diagram,
  type Delta,
  type Generalization,
  type GeneralizationDelta,
  type MemberDelta,
  type NaryAssociationDelta,
  type RealizationDelta,
  type LlmPort,
  type LlmResult,
  AggregationKindSchema,
} from '@app/core';

import { repairModelIdentifiers } from './repair.js';
import {
  normalizeUmlUtterance,
  sanitizeUmlType,
  inferAttributeType,
  splitCompoundUtterance,
  extractExclusionClasses,
  levenshtein,
} from './normalizer.js';

// ── helpers compartidos ────────────────────────────────────────────────────

function classIdByName(diagram: Diagram, name: string): string | null {
  const target = name.toLowerCase();
  const exact = diagram.classes.find((cls) => cls.name.toLowerCase() === target);
  if (exact) return exact.id;

  // Búsqueda difusa para tolerar typos tipográficos de 1 o 2 letras (ej. alunmo -> alumno)
  let bestId: string | null = null;
  let bestDist = 3;
  for (const cls of diagram.classes) {
    const dist = levenshtein(cls.name.toLowerCase(), target);
    if (dist < bestDist && dist <= 2) {
      bestDist = dist;
      bestId = cls.id;
    }
  }
  return bestId;
}

function parseMultiplicities(text: string): { source: string; target: string } | null {
  const norm = text.trim().toLowerCase();
  if (/^(?:muchos\s+(?:a|to)\s+muchos|muchos\s*:\s*muchos|[nm\*]\s+(?:a|to)\s+[nm\*]|[nm\*]\s*:\s*[nm\*])$/.test(norm)) {
    return { source: '0..*', target: '0..*' };
  }
  if (/^(?:1\s+(?:a|to)\s+(?:muchos|[nm\*])|uno\s+(?:a|to)\s+muchos|1\s*:\s*(?:muchos|[nm\*]))$/.test(norm)) {
    return { source: '1', target: '0..*' };
  }
  if (/^(?:(?:muchos|[nm\*])\s+(?:a|to)\s+1|muchos\s+(?:a|to)\s+uno|(?:muchos|[nm\*])\s*:\s*1)$/.test(norm)) {
    return { source: '0..*', target: '1' };
  }
  if (/^(?:1\s+(?:a|to)\s+1|uno\s+(?:a|to)\s+uno|1\s*:\s*1)$/.test(norm)) {
    return { source: '1', target: '1' };
  }
  if (/^(?:0\.\.1\s+(?:a|to)\s+1)$/.test(norm)) {
    return { source: '0..1', target: '1' };
  }
  if (/^(?:0\.\.1\s+(?:a|to)\s+(?:0\.\.\*|[nm\*]))$/.test(norm)) {
    return { source: '0..1', target: '0..*' };
  }
  const generic = /^([^\s:]+)\s*(?::|\s+(?:a|to)\s+)\s*([^\s:]+)$/.exec(norm);
  if (generic) {
    const mapOne = (val: string) => {
      if (val === 'muchos' || val === 'n' || val === 'm' || val === '*') return '0..*';
      if (val === 'uno') return '1';
      return val;
    };
    return { source: mapOne(generic[1]!), target: mapOne(generic[2]!) };
  }
  return null;
}

function nextPosition(diagram: Diagram): { x: number; y: number } {
  const n = diagram.classes.length;
  return { x: 80 + n * 40, y: 80 + n * 40 };
}

function deltaBase(diagram: Diagram): { id: string; diagramId: string; timestamp: string } {
  return {
    id: crypto.randomUUID(),
    diagramId: diagram.id,
    timestamp: new Date().toISOString(),
  };
}

const WHOLE_DESIGN_REQUEST = /\b(generate|genera|generá|dise[ñn]a|dise[ñn]o)\b[\s\S]*\b(design|dise[ñn]o|full|completo|complete|system|sistema|library|biblioteca)\b/i;

// ── FakeLlm ────────────────────────────────────────────────────────────────

/**
 * Intérprete determinista para el vocabulario acotado de comandos. Basado en patrones
 * a propósito: las pruebas (7.1/7.2/7.5) y el desarrollo offline se ejecutan sin red.
 */
export class FakeLlm implements LlmPort {
  async checkHealth(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async interpret(rawUtterance: string, _deltaJsonSchema: object, currentIr: Diagram): Promise<LlmResult> {
    const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });
    const utterance = normalizeUmlUtterance(rawUtterance);
    if (WHOLE_DESIGN_REQUEST.test(utterance)) {
      return {
        kind: 'refused',
        reason: 'I edit an existing model on explicit instruction; I do not generate whole designs.',
      };
    }

    // Multi-comando compuesto separado por ';' (ej. S5: "creá una clase Factura con numero, total y fecha; renombrá la clase Estudiante a Alumno; y borrá la clase Usuario")
    const parts = splitCompoundUtterance(rawUtterance);
    if (parts.length > 1) {
      let runningIr: Diagram = currentIr;
      const collectedDeltas: Delta[] = [];
      const renamedClasses = new Map<string, string>();
      let lastTargetClass: string | null = null;

      for (let part of parts) {
        // Si una clase fue renombrada previamente en este lote, reemplazar el nombre viejo en la parte
        for (const [oldName, newName] of renamedClasses.entries()) {
          const regex = new RegExp(`\\b${oldName}\\b`, 'gi');
          part = part.replace(regex, newName);
        }

        // Si la parte no especifica clase pero es una adición pronominal ("agregale...", "ponele..."), heredar lastTargetClass
        const isPronounAdd = /^(?:y\s+)?(?:agregale|agregále|ponele|sumale|sumá|insertale|añadile)\b/i.test(part.trim());
        const specifiesClass = /\b(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.test(part);
        if (isPronounAdd && !specifiesClass && lastTargetClass) {
          part = `a la clase ${lastTargetClass} ${part}`;
        }

        const subResult = await this.interpret(part, _deltaJsonSchema, runningIr);
        if (subResult.kind === 'delta') {
          const val = subResult.value;
          const deltasToApply = val.kind === 'batch' ? val.deltas : [val];
          for (const d of deltasToApply) {
            collectedDeltas.push(d);
            if (d.kind === 'class') {
              if (d.op === 'rename') {
                const targetId = (d as any).classId || (d as any).targetId;
                const targetCls = runningIr.classes.find(c => c.id === targetId);
                if (targetCls && d.newName) {
                  renamedClasses.set(targetCls.name, d.newName);
                  lastTargetClass = d.newName;
                }
              } else if (d.op === 'create') {
                lastTargetClass = d.name;
              }
            }
            const res = applyDelta(runningIr, d);
            if (res.ok) {
              runningIr = res.value;
            }
          }
        } else {
          return refused(`Part "${part}" failed: ${subResult.reason}`);
        }
      }

      if (collectedDeltas.length > 0) {
        const combinedBatch: Delta = {
          kind: 'batch',
          ...deltaBase(currentIr),
          deltas: collectedDeltas,
        };
        return { kind: 'delta', value: combinedBatch };
      }
    }

    // Unidad 9 — Heurísticas de adornos UML a partir de la elocución (opcional).
    const visibility = /\bprivate\b/i.test(utterance)
      ? ('-' as const)
      : /\bprotected\b/i.test(utterance)
        ? ('#' as const)
        : /\bpackage\b/i.test(utterance)
          ? ('~' as const)
          : undefined;
    const isStatic = /\bstatic\b/i.test(utterance) || undefined;
    const isDerived = /\bderived\b/i.test(utterance) || undefined;
    const adornments = {
      ...(visibility !== undefined ? { visibility } : {}),
      ...(isStatic !== undefined ? { isStatic } : {}),
      ...(isDerived !== undefined ? { isDerived } : {}),
    };

    // 4 (evaluado PRIMERO). agregar atributo a una clase EXISTENTE.
    // Soporta orden directo ("agrega atributo X a Y"), orden con clase al inicio ("editame la tabla Y, agregale un atributo llamado X")
    // y orden invertido con destino al principio ("agregale a la tabla Y el atributo X"), además de sintaxis directa typed ("agregá telefono:string a la clase Especialidad").
    const directAdd = /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|añadile|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?\s+(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
    const invertedAdd = !directAdd && /\b(?:en|a|para|edit(?:a|ar|á|ame|áme)|modific(?:a|ar|á|ame|áme))\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?/i.exec(utterance);
    const directToClassAdd = !directAdd && !invertedAdd && /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?/i.exec(utterance);
    const directTypedAdd = !directAdd && !invertedAdd && !directToClassAdd &&
      /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|añadile|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*)\s+(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);

    // Soporte para múltiples atributos a una clase existente:
    // "a la clase ProfesorMateria agregale atributo id de tipo entero, nombre de tipo string y profesor de tipo string"
    const invertedMultiAdd = !directAdd && /\b(?:en|a|para|edit(?:a|ar|á|ame|áme)|modific(?:a|ar|á|ame|áme))\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+([\s\S]+)$/i.exec(utterance);

    if (invertedMultiAdd && (invertedMultiAdd[2]!.includes(',') || /\s+(?:y|and)\s+/i.test(invertedMultiAdd[2]!))) {
      const targetClass = invertedMultiAdd[1]!;
      const classId = classIdByName(currentIr, targetClass);
      if (classId !== null) {
        const rawList = invertedMultiAdd[2]!;
        const items = rawList.split(/\s*,\s*|\s+(?:and|y)\s+/i).map(s => s.trim()).filter(Boolean);
        const memberDeltas: MemberDelta[] = [];
        for (const item of items) {
          const match = /^([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ\s]*?)\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w\s.]*)$/i.exec(item);
          if (match) {
            const rawName = match[1]!.trim().replace(/^(?:de|llamado|llamada)\s+/i, '');
            const camelName = rawName.split(/\s+/).map((w, idx) => idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
            const sanitizedType = sanitizeUmlType(match[2]!.trim(), camelName);
            memberDeltas.push({
              kind: 'member',
              op: 'addAttribute',
              ...deltaBase(currentIr),
              classId,
              memberId: crypto.randomUUID(),
              name: camelName,
              type: sanitizedType,
              ...adornments,
            });
          } else {
            const rawName = item.trim().replace(/^(?:de|llamado|llamada)\s+/i, '');
            if (rawName) {
              const camelName = rawName.split(/\s+/).map((w, idx) => idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
              memberDeltas.push({
                kind: 'member',
                op: 'addAttribute',
                ...deltaBase(currentIr),
                classId,
                memberId: crypto.randomUUID(),
                name: camelName,
                type: inferAttributeType(camelName),
                ...adornments,
              });
            }
          }
        }
        if (memberDeltas.length > 0) {
          return {
            kind: 'delta',
            value: {
              kind: 'batch',
              ...deltaBase(currentIr),
              deltas: memberDeltas,
            },
          };
        }
      }
    }

    const isCreateWithAttr = /\b(?:with|con)\s+(?:attribute|atributo|attributes|atributos)\b/i.test(utterance);
    const parsedAttr = !isCreateWithAttr && (directAdd
      ? { targetClass: directAdd[3]!, attrName: directAdd[1]!, attrType: directAdd[2] }
      : invertedAdd
        ? { targetClass: invertedAdd[1]!, attrName: invertedAdd[2]!, attrType: invertedAdd[3] }
        : directToClassAdd
          ? { targetClass: directToClassAdd[1]!, attrName: directToClassAdd[2]!, attrType: directToClassAdd[3] }
          : directTypedAdd
            ? { targetClass: directTypedAdd[3]!, attrName: directTypedAdd[1]!, attrType: directTypedAdd[2] }
            : null);

    if (parsedAttr) {
      const classId = classIdByName(currentIr, parsedAttr.targetClass);
      if (classId === null) return refused(`Unknown class "${parsedAttr.targetClass}"`);
      const delta: MemberDelta = {
        kind: 'member',
        op: 'addAttribute',
        ...deltaBase(currentIr),
        classId,
        memberId: crypto.randomUUID(),
        name: parsedAttr.attrName,
        type: parsedAttr.attrType ?? 'string',
        ...adornments,
      };
      return { kind: 'delta', value: delta };
    }

    // 0 (evaluado PRIMERO entre las creaciones). crear interfaz: "create interface X"
    // — una interfaz es una clase con kind 'interface' (unidad 12.5, mitad 12a).
    const createInterface = /\b(?:create|add|make|new|crea)\b[\s\S]*?\b(?:interface|interfaz)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
    if (createInterface) {
      const name = createInterface[1]!;
      const position = nextPosition(currentIr);
      const delta: ClassDelta = {
        kind: 'class',
        op: 'create',
        ...deltaBase(currentIr),
        classId: crypto.randomUUID(),
        name,
        position,
        classKind: 'interface',
      };
      return { kind: 'delta', value: delta };
    }

    // 1. crear clase / diagrama [+ opcional "con atributos a, b y c" o "con a y b"]
    const isExplicitCreateClass = /^\s*(?:@\w+\s+)?(?:add|create|crea|crear|craer|make|new)\s+(?:a|an|la|una|el|un|nueva|new)?\s*(?:class(?:es)?|clase|calse|clse|entidad|tabla|table|diagrama)\b/i.test(utterance);
    const isAddToClass = !isExplicitCreateClass && /\b(?:add|agrega|agregá|añade|pon|ponele|sumale)\b[\s\S]+?\b(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|entidad\s+)([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.test(utterance);
    const createClass = !isAddToClass ? /\b(?:add|create|crea|crear|craer|agregá|agrega|agrga|agregar|añade|añadir)\b[\s\S]*?\b(?:class(?:es)?|clase|calse|clse|entidad|tabla|table|diagrama)\s+(?:llamada\s+|llamado\s+|llamda\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance) : null;
    const STOP_CLASS_NAMES = new Set(['de', 'del', 'la', 'el', 'un', 'una', 'los', 'las', 'con', 'para', 'flujo', 'secuencia', 'casos']);
    if (createClass && !STOP_CLASS_NAMES.has(createClass[1]!.toLowerCase())) {
      const name = createClass[1]!;
      const position = nextPosition(currentIr);
      const create: ClassDelta = {
        kind: 'class',
        op: 'create',
        ...deltaBase(currentIr),
        classId: crypto.randomUUID(),
        name,
        position,
      };

      const afterClass = utterance.slice(createClass.index + createClass[0].length);

      // Si la frase que sigue contiene referencias a relaciones o herencia, derivar al LLM
      if (/\b(?:hered|es\s+(?:un|una)|subclase|asoci|conect|relacion|para\s+(?:un|una))\b/i.test(afterClass)) {
        return refused('Complex natural language or relationship expression; deferring to LLM.');
      }

      const attrTail = /\b(?:with|con)\s+(?:(?:an?\s+|los\s+|las\s+)?(?:attributes?|atributos?|atriutos?|atrivutos?|campos?|propiedades?)\s+)?([\s\S]+)$/i.exec(afterClass);
      if (attrTail) {
        const rawList = attrTail[1]!;
        const items = rawList
          .split(/\s*,\s*|\s+(?:and|y)\s+/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const KNOWN_UML_TYPES = new Set([
          'string', 'str', 'texto', 'int', 'integer', 'entero', 'float', 'double', 'decimal',
          'date', 'fecha', 'boolean', 'bool', 'booleano', 'void'
        ]);

        const memberDeltas: MemberDelta[] = [];
        for (let item of items) {
          item = item.replace(/^(?:and|y|e)\s+/i, '').trim();
          if (!item) continue;

          const typedMatch = /^([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ\s]*?)\s*(?::|\bof type\b|\bde tipo\b)\s*([A-Za-z_][\w\s.]*)$/i.exec(item);
          if (typedMatch) {
            const rawAttrName = typedMatch[1]!.trim();
            const attrParts = rawAttrName.split(/\s+/);
            const camelName = attrParts.map((w, idx) => idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
            const sanitizedType = sanitizeUmlType(typedMatch[2]!.trim(), camelName);
            memberDeltas.push({
              kind: 'member',
              op: 'addAttribute',
              ...deltaBase(currentIr),
              classId: create.classId,
              memberId: crypto.randomUUID(),
              name: camelName,
              type: sanitizedType,
              ...adornments,
            });
          } else {
            const tokens = item.trim().split(/\s+/);
            if (tokens.length >= 2 && KNOWN_UML_TYPES.has(tokens[tokens.length - 1]!.toLowerCase())) {
              const rawAttrName = tokens.slice(0, -1).join(' ');
              const rawType = tokens[tokens.length - 1]!;
              const camelName = rawAttrName.split(/\s+/).map((w, idx) => idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
              const sanitizedType = sanitizeUmlType(rawType, camelName);
              memberDeltas.push({
                kind: 'member',
                op: 'addAttribute',
                ...deltaBase(currentIr),
                classId: create.classId,
                memberId: crypto.randomUUID(),
                name: camelName,
                type: sanitizedType,
                ...adornments,
              });
            } else {
              const cleanItem = item.replace(/[^A-Za-z_ñÑáéíóúÁÉÍÓÚ\s]/g, '').trim();
              if (cleanItem.length > 0) {
                const attrParts = cleanItem.split(/\s+/);
                let camelName = attrParts.map((w, idx) => idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
                let inferredType = 'string';
                for (const suffix of ['boolean', 'bool', 'string', 'integer', 'int', 'float', 'double', 'decimal', 'datetime', 'date']) {
                  if (camelName.toLowerCase().endsWith(suffix) && camelName.length > suffix.length + 2) {
                    inferredType = sanitizeUmlType(suffix, camelName);
                    camelName = camelName.slice(0, -suffix.length);
                    break;
                  }
                }
                memberDeltas.push({
                  kind: 'member',
                  op: 'addAttribute',
                  ...deltaBase(currentIr),
                  classId: create.classId,
                  memberId: crypto.randomUUID(),
                  name: camelName,
                  type: inferredType,
                  ...adornments,
                });
              }
            }
          }
        }

        if (memberDeltas.length > 0) {
          const batch: Delta = {
            kind: 'batch',
            ...deltaBase(currentIr),
            deltas: [create, ...memberDeltas],
          };
          return { kind: 'delta', value: batch };
        }
      }
      return { kind: 'delta', value: create };
    }

    // 2. renombrar clase
    const isRenameMember = /\b(?:attribute|atributo|campo|columna|method|m[ée]todo)\b/i.test(utterance);
    const renameDirect = !isRenameMember
      ? /\b(?:rename|renombra|renombrá|renombrar)\b[\s\S]*?\b(?:class\s+|clase\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:to|a)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance)
      : null;
    const renameInverted = !isRenameMember && !renameDirect
      ? /\b(?:(?:y\s+a|ya|a)?\s*(?:la|el)?\s*(?:clase|tabla|entidad|class|table|entity))\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aá]le|cambi[aá]|modific[aá]|renombr[aá]|rename)\s+(?:de\s+nombre|el\s+nombre|name)?\s*(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance) ||
        /\b(?:cambi[aá]le|cambi[aá]|modific[aá]|renombr[aá])\s+(?:de\s+nombre|el\s+nombre)\s+(?:a|de)\s+(?:la\s+clase\s+|la\s+tabla\s+|la\s+entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance)
      : null;
    const rename = renameDirect || renameInverted;
    if (rename) {
      const classId = classIdByName(currentIr, rename[1]!);
      if (classId === null) return refused(`Unknown class "${rename[1]}"`);
      const delta: ClassDelta = {
        kind: 'class',
        op: 'rename',
        ...deltaBase(currentIr),
        classId,
        newName: rename[2]!,
      };
      return { kind: 'delta', value: delta };
    }

    // 2b. eliminar clase específica
    const isDeleteAttrOrMethod = /\b(?:attribute|atributo|campo|columna|method|m[ée]todo)\b/i.test(utterance);
    const deleteClassWithKeyword = !isDeleteAttrOrMethod ? /\b(?:delete|remove|elimina|eliminá|eliminar|eliminame|elimináme|elmina|borra|borrá|borrar|borrame|borráme|brra|sacar|sacá|saca)\b[\s\S]*?\b(?:class|clase|calse|clse|tabla|table|entidad)\s+(?:llamada\s+|llamado\s+|llamda\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance) : null;
    let targetClassName: string | null = null;
    if (deleteClassWithKeyword) {
      targetClassName = deleteClassWithKeyword[1];
    } else if (!isDeleteAttrOrMethod) {
      // Intentar detectar si dice "borra/elimina <NombreClase>" donde NombreClase es una clase existente en el diagrama
      const deleteDirect = /\b(?:delete|remove|elimina|eliminá|eliminar|eliminame|elimináme|elmina|borra|borrá|borrar|borrame|borráme|brra|sacar|sacá|saca)\s+(?:a\s+|la\s+|el\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\b/i.exec(utterance);
      if (deleteDirect) {
        const potentialName = deleteDirect[1];
        if (!/^(todas?|todos?|all|el|la|los|las|un|una|canvas|lienzo|diagrama|todo|clase|calse|clse|tabla|table|entidad)$/i.test(potentialName)) {
          if (classIdByName(currentIr, potentialName) !== null) {
            targetClassName = potentialName;
          }
        }
      }
    }

    if (targetClassName) {
      const classId = classIdByName(currentIr, targetClassName);
      if (classId === null) return refused(`Unknown class "${targetClassName}"`);
      const delta: ClassDelta = { kind: 'class', op: 'delete', ...deltaBase(currentIr), classId };
      return { kind: 'delta', value: delta };
    }

    // 2c. eliminar todas las clases / limpiar o reiniciar lienzo
    const isWipeOrDeleteAll =
      /\b(?:delete|remove|borr(?:a|ar|á|alo|álo|ame|amelo|ámelo)?|elimin(?:a|ar|á|alo|álo|ame|amelo|ámelo)?|limpi(?:a|ar|á|alo|álo|ame|amelo|ámelo)?|lmpi(?:a|ar|á|alo|álo|ame|amelo|ámelo)?|lipia|vaci(?:a|ar|á|alo|álo)?|reinici(?:a|ar|á|alo|álo)?|reset(?:ea|ear|ealo|eálo)?|clear|wipe|clean)\b[\s\S]*?\b(?:lienzo|canvas|diagrama|tablero|mesa|pantalla|(?:todas?|tod[oa]s?|all)\s+(?:las?\s+|the\s+)?(?:clases?|classes|tablas?|tables)|tod[oa]s?|todo|all)\b|\b(?:limpiamelo|limpiámelo|limpiame|borramelo|borrámelo|limpialo|limpiálo|borralo|borrálo|eliminalo|eliminálo|empezar\s+de\s+nuevo|comenzar\s+de\s+nuevo|partir\s+de\s+cero|desde\s+cero|clear\s+all|wipe\s+all)\b/i.test(utterance);
    if (isWipeOrDeleteAll) {
      if (currentIr.classes.length === 0) {
        return refused('No classes to delete');
      }

      // Detectar excepciones: "menos Libro y Autor", "excepto X", "salvo Y", "excluding Z"
      const exceptMatch = /\b(?:menos|excepto|salvo|excluding|except)\s+([\s\S]+)$/i.exec(utterance);
      let classesToDelete = currentIr.classes;
      if (exceptMatch) {
        const rawExceptions = exceptMatch[1]!;
        const excludedWords = rawExceptions
          .split(/\s*,\s*|\s+(?:and|y|o)\s+|\s+/i)
          .map((w) => w.replace(/[^A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]/g, '').toLowerCase().trim())
          .filter(Boolean);
        const excludedSet = new Set(excludedWords);
        classesToDelete = currentIr.classes.filter(
          (cls) => !excludedSet.has(cls.name.toLowerCase())
        );
      }

      if (classesToDelete.length === 0) {
        return refused('No classes to delete after applying exceptions.');
      }

      const batch: BatchDelta = {
        kind: 'batch',
        ...deltaBase(currentIr),
        deltas: classesToDelete.map((cls) => ({
          kind: 'class',
          op: 'delete',
          ...deltaBase(currentIr),
          classId: cls.id,
        })),
      };
      return { kind: 'delta', value: batch };
    }

    // 5. eliminar atributo / método
    const removeMember = /\b(?:remove|delete|elimina|eliminá|borra|borrá|sacar?|sac[aá]le?|quit[aá]le?)\b[\s\S]*?\b(?:attribute|atributo|method|m[ée]todo|campo|columna|propiedad|property|field|operaci[oó]n|funci[oó]n|operation|function)s?\s+([A-Za-z_]\w*)\s+(?:from|de|en|a)\s+(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_]\w*)/i.exec(utterance);
    if (removeMember) {
      const classId = classIdByName(currentIr, removeMember[2]!);
      if (classId === null) return refused(`Unknown class "${removeMember[2]}"`);
      const cls = currentIr.classes.find((c) => c.id === classId)!;
      const memberName = removeMember[1]!.toLowerCase();
      const attr = cls.attributes.find((a) => a.name.toLowerCase() === memberName);
      const meth = cls.methods.find((m) => m.name.toLowerCase() === memberName);
      if (!attr && !meth) {
        return refused(`Unknown member "${removeMember[1]}" in class "${removeMember[2]}"`);
      }
      const delta: MemberDelta = attr
        ? { kind: 'member', op: 'deleteAttribute', ...deltaBase(currentIr), classId, memberId: attr.id }
        : { kind: 'member', op: 'deleteMethod', ...deltaBase(currentIr), classId, memberId: meth!.id };
      return { kind: 'delta', value: delta };
    }

    // 5b. cambiar tipo de atributo: "cambiá el tipo de anio en Tirada a string"
    const changeAttrType = /\b(?:cambi[aá]|modific[aá]|edit[aá]|change|modify|update|set)\b[\s\S]*?\b(?:tipo\s+del?\s*(?:atributo|campo|columna|propiedad|property|field)?|type\s+of)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in|for)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_][\w.]*)/i.exec(utterance);
    // 5b2. mutación de atributo con clase al inicio (cambio de tipo o renombrado)
    // ej: "a la tabla alunmo cambiale el id tipo int a tipo float"
    // ej: "a la tabla materia cambiale el atribut id a id_materia"
    const attrMutateClassInverted =
      /\b(?:a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:cambi[aá]le|cambi[aá]|modific[aá]|edit[aá]|renombr[aá]|change|modify|update|set|rename)\s+(?:el\s+nombre\s+del?\s+|el\s+|la\s+)?(?:tipo\s+del?\s+|attributes?|atributos?|atributs?|campos?|columnas?|propiedades?|properties|fields?)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:de\s+tipo|tipo)\s+[A-Za-z_][\w.]*)?\s+(?:a|por|to)\s+(?:(?:el\s+)?nombre\s+)?(?:tipo\s+)?([A-Za-z_][\w.]*)/i.exec(utterance);

    const KNOWN_UML_TYPES = new Set([
      'int', 'entero', 'integer', 'number', 'float', 'double', 'decimal', 'real',
      'string', 'str', 'text', 'texto', 'varchar', 'char', 'cadena',
      'boolean', 'bool', 'booleano', 'date', 'fecha', 'timestamp', 'datetime'
    ]);
    const isTargetType = (t: string) => KNOWN_UML_TYPES.has(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const hasTipoKeyword = /\b(?:de\s+tipo|tipo|type)\s+[A-Za-z_]/i.test(utterance);

    const parsedChangeType = changeAttrType
      ? { className: changeAttrType[2]!, attrName: changeAttrType[1]!, rawType: changeAttrType[3]! }
      : (attrMutateClassInverted && (hasTipoKeyword || isTargetType(attrMutateClassInverted[3]!)))
        ? { className: attrMutateClassInverted[1]!, attrName: attrMutateClassInverted[2]!, rawType: attrMutateClassInverted[3]! }
        : null;

    if (parsedChangeType) {
      const classId = classIdByName(currentIr, parsedChangeType.className);
      if (classId === null) return refused(`Unknown class "${parsedChangeType.className}"`);
      const cls = currentIr.classes.find((c) => c.id === classId)!;
      const attr = cls.attributes.find((a) => a.name.toLowerCase() === parsedChangeType.attrName.toLowerCase());
      if (!attr) return refused(`Unknown attribute "${parsedChangeType.attrName}" in class "${parsedChangeType.className}"`);
      const delta: MemberDelta = {
        kind: 'member',
        op: 'editAttribute',
        ...deltaBase(currentIr),
        classId,
        memberId: attr.id,
        name: attr.name,
        type: sanitizeUmlType(parsedChangeType.rawType, attr.name),
      };
      return { kind: 'delta', value: delta };
    }

    // 5c. renombrar atributo / cambiar mayúsculas/minúsculas
    // Orden 1 (ToIn): "rename attribute fullName to nombreCompleto in Customer" / "renombrá el atributo nombre a name en Autor"
    const renameAttrToIn = /\b(?:rename|renombr[aá]|cambi[aá]\s+el\s+nombre\s+de)\s+(?:(?:the|el|la)\s+)?(?:attribute|atributo|campo|columna|propiedad|property|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
    // Orden 2 (InClass): "rename attribute fullName in Customer to nombreCompleto" / "poné en minúsculas el atributo nombre en Autor"
    const renameAttrInClass = !renameAttrToIn && /\b(?:rename|renombr[aá]|cambi[aá]\s+el\s+nombre\s+de|pon[eé]\s+en\s+min[uú]sculas)\s+(?:(?:the|el|la)\s+)?(?:attribute|atributo|campo|columna|propiedad|property|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(utterance);
    // Orden 3 (Inverted): "a la tabla materia cambiale el atribut id a id_materia"
    const renameAttrInverted =
      !renameAttrToIn &&
      !renameAttrInClass &&
      attrMutateClassInverted &&
      !hasTipoKeyword &&
      !isTargetType(attrMutateClassInverted[3]!)
        ? { className: attrMutateClassInverted[1]!, attrName: attrMutateClassInverted[2]!, toName: attrMutateClassInverted[3]! }
        : null;

    const parsedRename = renameAttrToIn
      ? { attrName: renameAttrToIn[1]!, className: renameAttrToIn[3]!, toName: renameAttrToIn[2]! }
      : renameAttrInClass
        ? { attrName: renameAttrInClass[1]!, className: renameAttrInClass[2]!, toName: renameAttrInClass[3] }
        : renameAttrInverted;

    if (parsedRename) {
      const classId = classIdByName(currentIr, parsedRename.className);
      if (classId !== null) {
        const cls = currentIr.classes.find((c) => c.id === classId)!;
        const attr = cls.attributes.find((a) => a.name.toLowerCase() === parsedRename.attrName.toLowerCase());
        if (attr) {
          const newName = /min[uú]sculas/i.test(utterance) ? attr.name.toLowerCase() : (parsedRename.toName ?? attr.name);
          const delta: MemberDelta = {
            kind: 'member',
            op: 'editAttribute',
            ...deltaBase(currentIr),
            classId,
            memberId: attr.id,
            name: newName,
            type: attr.type,
          };
          return { kind: 'delta', value: delta };
        }
      }
    }

    // 6. agregar método (directo o invertido con parámetros y tipo de retorno)
    // Ej: "agregá el método cancelar(motivo:string):boolean a Especialidad"
    // Ej: "sumale a Especialidad el método atender():void"
    const addMethodDirect = /(?:^|\b)(?:add|agrega|agregá|añade|añadí|sumale|ponele|inserta|insertá)(?:\b|\s)[\s\S]*?(?:method|m[ée]todo|operaci[oó]n|funci[oó]n|operation|function)s?\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\breturning\b|\bque retorna\b|\bdevuelve\b)?\s*([A-Za-z_][\w.]*)?\s+(?:to|a|en)\s+(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_]\w*)/i.exec(utterance);
    const addMethodInverted = !addMethodDirect && /(?:^|\b)(?:add|agrega|agregá|añade|añadí|sumale|ponele|inserta|insertá)(?:\b|\s)[\s\S]*?(?:to|a|en)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_]\w*)\s+(?:el\s+|la\s+)?(?:method|m[ée]todo|operaci[oó]n|funci[oó]n|operation|function)s?\s+([A-Za-z_]\w*)(?:\s*\((.*?)\))?\s*(?::|\breturning\b|\bque retorna\b|\bdevuelve\b)?\s*([A-Za-z_][\w.]*)?/i.exec(utterance);

    const parsedMethod = addMethodDirect
      ? { targetClass: addMethodDirect[4]!, methodName: addMethodDirect[1]!, rawParams: addMethodDirect[2], returnType: addMethodDirect[3] }
      : addMethodInverted
        ? { targetClass: addMethodInverted[1]!, methodName: addMethodInverted[2]!, rawParams: addMethodInverted[3], returnType: addMethodInverted[4] }
        : null;

    if (parsedMethod) {
      const classId = classIdByName(currentIr, parsedMethod.targetClass);
      if (classId === null) return refused(`Unknown class "${parsedMethod.targetClass}"`);
      const parameters: Array<{ name: string; type: string }> = [];
      if (parsedMethod.rawParams && parsedMethod.rawParams.trim().length > 0) {
        const parts = parsedMethod.rawParams.split(',');
        for (const part of parts) {
          const match = /^\s*([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_][\w.]*))?\s*$/.exec(part);
          if (match) {
            parameters.push({ name: match[1]!, type: match[2] ?? 'string' });
          }
        }
      }
      const delta: MemberDelta = {
        kind: 'member',
        op: 'addMethod',
        ...deltaBase(currentIr),
        classId,
        memberId: crypto.randomUUID(),
        name: parsedMethod.methodName,
        returnType: parsedMethod.returnType ?? 'void',
        parameters,
      };
      return { kind: 'delta', value: delta };
    }

    // 6b. Asociación N-ARIA (unidad 13.4): "ternary association between Supplier,
    // Part and Project" / "n-ary association between A, B, C and D" /
    // "asociación ternaria entre A, B y C". Evaluada ANTES de los patrones de asociación
    // binaria (7/8): sin esto, el patrón binario genérico interpretaría erróneamente
    // la cola de la lista de miembros ("Part and Project") como una asociación de dos extremos.
    // El motor aplica los invariantes de >=3 / duplicados / existencia; el intérprete
    // resuelve nombres y rechaza de antemano clases desconocidas o menos de tres miembros.
    const naryAssociation = /\b(?:(?:ternary|ternaria|n-ary|nary)\b[\s\S]*?\b(?:association|asociaci[óo]n)\b|(?:association|asociaci[óo]n)\b[\s\S]*?\b(?:ternary|ternaria|n-ary|nary)\b)[\s\S]*?\b(?:between|entre)\s+([A-Za-z_]\w*(?:(?:\s*,\s*|\s+(?:and|y)\s+)[A-Za-z_]\w*)+)/i.exec(utterance);
    if (naryAssociation) {
      const names = naryAssociation[1]!
        .split(/\s*,\s*|\s+(?:and|y)\s+/i)
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      if (names.length < 3) {
        return refused('An n-ary association needs at least three member classes.');
      }
      const memberEnds: { classId: string; multiplicity: string }[] = [];
      for (const name of names) {
        const classId = classIdByName(currentIr, name);
        if (classId === null) return refused(`Unknown class "${name}"`);
        memberEnds.push({ classId, multiplicity: '1' });
      }
      const delta: NaryAssociationDelta = {
        kind: 'naryAssociation',
        op: 'create',
        ...deltaBase(currentIr),
        naryAssociationId: crypto.randomUUID(),
        memberEnds,
      };
      return { kind: 'delta', value: delta };
    }

    // 6c. Asociación con CLASE DE ASOCIACIÓN / TABLA INTERMEDIA:
    // Soporta:
    // 1) Asignar clase existente o nueva: "hace que Clase sea la clase de asociacion entre Profesor y Materia", "converti Clase en tabla intermedia entre A y B"
    // 2) Con nombre explícito: "clase de asociacion Inscripcion entre Estudiante y Curso"
    // 3) Con nombre anónimo: "agrega clase de asociacion entre Profesor y Materia" -> genera ProfesorMateria
    // 4) Vía conector: "conecta A con B mediante clase de asociacion C"
    const assignAssocClassPattern =
      /(?:(?:hac[eé]|haz|make|set|convert[ií]|volv[eé]|pon(?:e|ele)?|transform[aá]|marc[aá]|asign[aá]|link|connect|conecta|conectá|asocia|asociá)\s+(?:que\s+|q\s+)?(?:(?:la|una|el|un|the|an?)\s+)?(?:class\s+|clase\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:sea|en|como|to\s+be|as|a\s+la\s+asociaci[óo]n\s+entre|to\s+(?:the\s+)?association\s+between)\s+(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table)?\s*(?:entre|between)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)|^(?:(?:la|el|the)\s+)?(?:class\s+|clase\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:sea|es|is)\s+(?:(?:la|una|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia)\s+(?:entre|between)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*))/i.exec(utterance);

    const assocClassPattern = !assignAssocClassPattern &&
      /(?:^|\b)(?:cre[aá]|crear|add|agrega|agregá|inserta|insertá|pon|ponele)?\s*(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table|linking\s+table)\s+(?:llamada\s+|llamado\s+|named\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:between|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);

    const assocClassViaPattern = !assignAssocClassPattern && !assocClassPattern &&
      /\b(?:link|connect|conecta|conectá|asocia|asociá)\b[\s\S]*?\b([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:with|con|y|and)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:mediante|a\s+trav[eé]s\s+de|via|using|through)\s+(?:(?:la|una|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|junction\s+table|join\s+table|intermediate\s+table|association\s+table)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);

    const anonAssocClassPattern = !assignAssocClassPattern && !assocClassPattern && !assocClassViaPattern &&
      /(?:^|\b)(?:cre[aá]|crear|add|agrega|agregá|inserta|insertá|pon|ponele|sumale|mete|metele)?\s*(?:(?:la|una|el|un|the|an?)\s+)?(?:association\s+class|clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table|linking\s+table)\s+(?:between|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);

    if (assignAssocClassPattern || assocClassPattern || assocClassViaPattern || anonAssocClassPattern) {
      let assocClassName: string;
      let srcName: string;
      let tgtName: string;

      if (assignAssocClassPattern) {
        assocClassName = assignAssocClassPattern[1] || assignAssocClassPattern[4]!;
        srcName = assignAssocClassPattern[2] || assignAssocClassPattern[5]!;
        tgtName = assignAssocClassPattern[3] || assignAssocClassPattern[6]!;
      } else if (assocClassPattern) {
        assocClassName = assocClassPattern[1]!;
        srcName = assocClassPattern[2]!;
        tgtName = assocClassPattern[3]!;
      } else if (assocClassViaPattern) {
        assocClassName = assocClassViaPattern[3]!;
        srcName = assocClassViaPattern[1]!;
        tgtName = assocClassViaPattern[2]!;
      } else {
        // anónimo: sintetizar nombre uniendo origen y destino
        srcName = anonAssocClassPattern![1]!;
        tgtName = anonAssocClassPattern![2]!;
        assocClassName = `${srcName.charAt(0).toUpperCase()}${srcName.slice(1)}${tgtName.charAt(0).toUpperCase()}${tgtName.slice(1)}`;
      }

      const sourceClassId = classIdByName(currentIr, srcName);
      const targetClassId = classIdByName(currentIr, tgtName);
      if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
      if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

      let assocClassId = classIdByName(currentIr, assocClassName);
      let createClassDelta: ClassDelta | undefined;
      if (assocClassId === null) {
        assocClassId = crypto.randomUUID();
        createClassDelta = {
          kind: 'class',
          op: 'create',
          ...deltaBase(currentIr),
          classId: assocClassId,
          name: assocClassName,
          position: nextPosition(currentIr),
        };
      }

      // Si ya existe una asociación entre origen y destino, vincular la clase de asociación a ella
      const existingAssoc = (currentIr.associations ?? []).find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
      );

      if (existingAssoc) {
        const updateDelta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: existingAssoc.id,
          newAssociationClassId: assocClassId,
        };

        if (createClassDelta) {
          return {
            kind: 'delta',
            value: {
              kind: 'batch',
              ...deltaBase(currentIr),
              deltas: [createClassDelta, updateDelta],
            },
          };
        }
        return { kind: 'delta', value: updateDelta };
      }

      // Si no existe, crear la asociación con associationClassId
      const assocDelta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity: '1',
        targetMultiplicity: '1',
        directed: false,
        associationClassId: assocClassId,
      };

      if (createClassDelta) {
        return {
          kind: 'delta',
          value: {
            kind: 'batch',
            ...deltaBase(currentIr),
            deltas: [createClassDelta, assocDelta],
          },
        };
      }
      return { kind: 'delta', value: assocDelta };
    }

    // 6d. Vincular clase existente a asociación como clase de asociación:
    // "link class Grade to association between Student and Course"
    const linkAssocClassPattern = /\b(?:link|connect|conecta|conectá|asocia|asociá)\s+(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:to\s+(?:association|relation)\s+between|a\s+(?:la\s+)?(?:asociaci[óo]n|relaci[óo]n)\s+entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|y|con|with)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);
    if (linkAssocClassPattern) {
      const className = linkAssocClassPattern[1]!;
      const srcName = linkAssocClassPattern[2]!;
      const tgtName = linkAssocClassPattern[3]!;
      const classId = classIdByName(currentIr, className);
      const srcId = classIdByName(currentIr, srcName);
      const tgtId = classIdByName(currentIr, tgtName);
      if (classId === null) return refused(`Unknown class "${className}"`);
      if (srcId === null) return refused(`Unknown class "${srcName}"`);
      if (tgtId === null) return refused(`Unknown class "${tgtName}"`);

      const existingAssoc = currentIr.associations.find(
        (a) =>
          (a.sourceClassId === srcId && a.targetClassId === tgtId) ||
          (a.sourceClassId === tgtId && a.targetClassId === srcId),
      );
      if (!existingAssoc) {
        return refused(`No association found between "${srcName}" and "${tgtName}".`);
      }

      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        newAssociationClassId: classId,
      };
      return { kind: 'delta', value: delta };
    }

    // 7. asociación nombrada con roles: "association X Y named Z role A role B"
    // Debe verificarse ANTES del patrón genérico de asociación
    const namedAssociation = /\b(?:association|link|asocia(?:ci[óo]n)?)\b[\s\S]*?\b([A-Za-z_]\w*)\s+(?:(?:with|con|y|and)\s+)?([A-Za-z_]\w*)\s+(?:named|called|llama(?:da)?)\s+([A-Za-z_]\w*)(?:(?:\s+(?:role|rol)\s+([A-Za-z_]\w*))?(?:\s+(?:role|rol)\s+([A-Za-z_]\w*))?)?/i.exec(utterance);
    if (namedAssociation) {
      const sourceClassId = classIdByName(currentIr, namedAssociation[1]!);
      const targetClassId = classIdByName(currentIr, namedAssociation[2]!);
      if (sourceClassId === null) return refused(`Unknown class "${namedAssociation[1]}"`);
      if (targetClassId === null) return refused(`Unknown class "${namedAssociation[2]}"`);
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity: '1',
        targetMultiplicity: '1',
        directed: false,
        name: namedAssociation[3]!,
        sourceRole: namedAssociation[4] || undefined,
        targetRole: namedAssociation[5] || undefined,
      };
      return { kind: 'delta', value: delta };
    }

    // 7b. asociación reflexiva: "conecta Empleado consigo misma" / "asocia Empleado de forma reflexiva" / "connect Node to itself"
    const reflexiveAssoc = /\b(?:link|conecta|conectá|asocia|asociá|asociaci[óo]n|association|connect)\b[\s\S]*?\b([A-Za-z_]\w*)\s+(?:consigo\s+misma|consigo\s+mismo|to\s+itself|reflexively|reflexive)/i.exec(utterance);
    if (reflexiveAssoc) {
      const classId = classIdByName(currentIr, reflexiveAssoc[1]!);
      if (classId === null) return refused(`Unknown class "${reflexiveAssoc[1]}"`);
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId: classId,
        targetClassId: classId,
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
        directed: false,
        aggregation: 'none',
      };
      return { kind: 'delta', value: delta };
    }

    // 7b. ACTUALIZACIÓN de multiplicidad / cardinalidad entre dos clases:
    // "cambia la multiplicidad entre materia y profesor a muchos a muchos", "actualiza la cardinalidad de X e Y a 1 a N"
    const isMultiplicityUpdate = /\b(?:cambi[aá]le|cambi[aá]|cambiar|modific[aá]|modificar|actualiz[aá]|actualizar|update|change)\b[\s\S]*?\b(?:multiplicidad|cardinalidad|multiplicity|cardinality)\b[\s\S]*?\b(?:entre|between|de)?\s*(?:la\s+relaci[oó]n\s+entre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([^\s,;]+(?:\s+(?:a|to)\s+[^\s,;]+)?)/i.exec(utterance);
    if (isMultiplicityUpdate) {
      const srcName = isMultiplicityUpdate[1]!;
      const tgtName = isMultiplicityUpdate[2]!;
      const sourceClassId = classIdByName(currentIr, srcName);
      const targetClassId = classIdByName(currentIr, tgtName);
      if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
      if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);
      const existingAssoc = (currentIr.associations ?? []).find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
      );
      if (!existingAssoc) {
        return refused(`No association found between "${srcName}" and "${tgtName}".`);
      }
      const mults = parseMultiplicities(isMultiplicityUpdate[3]!);
      if (!mults) {
        return refused(`Invalid multiplicity format "${isMultiplicityUpdate[3]}".`);
      }
      const isDirect = existingAssoc.sourceClassId === sourceClassId;
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        newSourceMultiplicity: isDirect ? mults.source : mults.target,
        newTargetMultiplicity: isDirect ? mults.target : mults.source,
      };
      const nameMatch = /\b(?:llamada|llamado|nombrada|nombrado|named|called|con\s+(?:el\s+)?nombre|de\s+nombre|nombrala|nombralo)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);
      if (nameMatch) {
        const candidate = nameMatch[1]!;
        if (!/^(clase|tabla|entidad|asociacion|relacion|multiplicidad|muchos|uno)$/i.test(candidate)) {
          delta.name = candidate;
        }
      }
      return { kind: 'delta', value: delta };
    }

    // 7d. ACTUALIZACIÓN / RENOMBRE de relación entre dos clases:
    // "renombra la relación entre Materia y Profesor a dicta", "cambia el nombre de la relación entre X e Y a Z", "a la relación entre X e Y llamala Z"
    // 7d. ACTUALIZACIÓN / CONVERSIÓN / RENOMBRE de relación entre dos clases:
    // "renombra la relación entre Materia y Profesor a dicta", "cambia la relación entre alumno y asistencia por una generalización",
    // "cambia el tipo de relación entre X e Y a composición"
    const isRelationRename =
      /\b(?:renombr[aá]|renombrar|cambi[aá]le|cambi[aá]|cambiar|modific[aá]|modificar|pon[eé]le|pon[eé]|nombr[aá]|rename)\b[\s\S]*?(?:el\s+nombre|de\s+nombre)?[\s\S]*?\b(?:de\s+la\s+|a\s+la\s+)?(?:relaci[oó]n|asociaci[oó]n|arista|link|association|relationship)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:a|por|como|to|llamada|llamado)\s+(?:(?:un[ao]?|el|la)\s+)?(?:(?:relaci[oó]n|tipo)\s+(?:de\s+)?)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance) ||
      /\b(?:a\s+la\s+)?(?:relaci[oó]n|asociaci[oó]n|arista|link|association|relationship)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:cambi[aá]le|cambi[aá]|modific[aá]|renombr[aá]|llamala|llamalo|nombra)\b[\s\S]*?(?:el\s+nombre|de\s+nombre)?[\s\S]*?\b(?:a|por|como|to)\s+(?:(?:un[ao]?|el|la)\s+)?(?:(?:relaci[oó]n|tipo)\s+(?:de\s+)?)?["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);

    if (isRelationRename) {
      const srcName = isRelationRename[1]!;
      const tgtName = isRelationRename[2]!;
      const sourceClassId = classIdByName(currentIr, srcName);
      const targetClassId = classIdByName(currentIr, tgtName);
      if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
      if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

      const matchingAssocs = (currentIr.associations ?? []).filter(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
      );
      const matchingGens = (currentIr.generalizations ?? []).filter(
        (g) =>
          (g.subClassId === sourceClassId && g.superClassId === targetClassId) ||
          (g.subClassId === targetClassId && g.superClassId === sourceClassId),
      );
      const matchingRealizs = (currentIr.realizations ?? []).filter(
        (r) =>
          (r.clientClassId === sourceClassId && r.supplierInterfaceId === targetClassId) ||
          (r.clientClassId === targetClassId && r.supplierInterfaceId === sourceClassId),
      );

      let newName = isRelationRename[3]!;
      const stopWords = new Set(['un', 'una', 'uno', 'el', 'la', 'los', 'las', 'de', 'del', 'a', 'por', 'como', 'relacion', 'relación', 'tipo']);
      if (stopWords.has(newName.toLowerCase())) {
        const nextWordMatch = /(?:composici[oó]n|composite|agregaci[oó]n|shared|asociaci[oó]n|generalizaci[oó]n|generalizasi[oó]n|generalization|herencia|realizaci[oó]n|dependencia)/i.exec(utterance);
        if (nextWordMatch) {
          newName = nextWordMatch[0];
        }
      }

      const isGenChange = /^(?:generalizaci[oó]n|generalizasi[oó]n|generalization|herencia|inheritance)$/i.test(newName);
      const isRealizChange = /^(?:realizaci[oó]n|realizasi[oó]n|realization|implementaci[oó]n|implementation|interfaz|interface)$/i.test(newName);
      const isDepChange = /^(?:dependencia|dependency)$/i.test(newName);
      const isAggChange = /^(?:composici[oó]n|composite|agregaci[oó]n|shared|asociaci[oó]n|simple|none)$/i.test(newName);

      // CASO 1: Conversión a Generalización (Herencia)
      if (isGenChange) {
        const subId = sourceClassId;
        const superId = targetClassId;

        const deltas: any[] = [];
        for (const a of matchingAssocs) {
          deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
        }
        for (const r of matchingRealizs) {
          deltas.push({ kind: 'realization', op: 'delete', ...deltaBase(currentIr), realizationId: r.id });
        }
        if (matchingGens.length === 0) {
          deltas.push({
            kind: 'generalization',
            op: 'create',
            ...deltaBase(currentIr),
            generalizationId: crypto.randomUUID(),
            subClassId: subId,
            superClassId: superId,
          });
        }
        return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
      }

      // CASO 2: Conversión a Realización (Interfaz)
      if (isRealizChange) {
        const deltas: any[] = [];
        for (const a of matchingAssocs) {
          deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
        }
        for (const g of matchingGens) {
          deltas.push({ kind: 'generalization', op: 'delete', ...deltaBase(currentIr), generalizationId: g.id });
        }
        if (matchingRealizs.length === 0) {
          deltas.push({
            kind: 'realization',
            op: 'create',
            ...deltaBase(currentIr),
            realizationId: crypto.randomUUID(),
            clientClassId: sourceClassId,
            supplierInterfaceId: targetClassId,
          });
        }
        return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
      }

      // CASO 3: Conversión a Dependencia
      if (isDepChange) {
        const deltas: any[] = [];
        for (const a of matchingAssocs) {
          deltas.push({ kind: 'association', op: 'delete', ...deltaBase(currentIr), associationId: a.id });
        }
        deltas.push({
          kind: 'dependency',
          op: 'create',
          ...deltaBase(currentIr),
          dependencyId: crypto.randomUUID(),
          clientClassId: sourceClassId,
          supplierClassId: targetClassId,
        });
        return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
      }

      // CASO 4: Conversión a Asociación / Composición / Agregación
      if (isAggChange) {
        const isComposite = /^(?:composici[oó]n|composite)$/i.test(newName);
        const isShared = /^(?:agregaci[oó]n|shared)$/i.test(newName);
        const targetAgg: 'composite' | 'shared' | 'none' = isComposite ? 'composite' : (isShared ? 'shared' : 'none');

        const wholeMatch =
          /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
        const childPattern = /(?:detalle|item|\blinea\b|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;

        let wholeClassId: string = targetClassId;
        const n1 = srcName.toLowerCase();
        const n2 = tgtName.toLowerCase();
        if (wholeMatch) {
          const rawWhole = wholeMatch[1]!.toLowerCase();
          if (n1 === rawWhole || n1.startsWith(rawWhole) || rawWhole.startsWith(n1)) wholeClassId = sourceClassId;
          else if (n2 === rawWhole || n2.startsWith(rawWhole) || rawWhole.startsWith(n2)) wholeClassId = targetClassId;
        } else if (childPattern.test(n1) && !childPattern.test(n2)) {
          wholeClassId = targetClassId;
        } else if (childPattern.test(n2) && !childPattern.test(n1)) {
          wholeClassId = sourceClassId;
        }

        // Si ya existía al menos una asociación: actualizar la primera y eliminar duplicados zombis si hubiese más de una
        if (matchingAssocs.length > 0) {
          const primaryAssoc = matchingAssocs.find((a) => a.aggregation === targetAgg) || matchingAssocs[0]!;
          const duplicateDeletes = matchingAssocs.filter((a) => a.id !== primaryAssoc.id).map((a) => ({
            kind: 'association' as const,
            op: 'delete' as const,
            ...deltaBase(currentIr),
            associationId: a.id,
          }));

          const assocAggregationEnd = (isComposite || isShared)
            ? (wholeClassId === primaryAssoc.sourceClassId ? 'source' : 'target')
            : (primaryAssoc.aggregationEnd ?? 'source');

          const isReversed = primaryAssoc.sourceClassId === targetClassId;
          const updateDelta: AssociationDelta = {
            kind: 'association',
            op: 'updateMultiplicity',
            ...deltaBase(currentIr),
            associationId: primaryAssoc.id,
            aggregation: targetAgg,
            aggregationEnd: assocAggregationEnd,
            newSourceMultiplicity: isComposite ? (wholeClassId === primaryAssoc.sourceClassId ? '1' : '0..*') : '1',
            newTargetMultiplicity: isComposite ? (wholeClassId === primaryAssoc.targetClassId ? '1' : '0..*') : '1',
          };

          if (duplicateDeletes.length > 0) {
            return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas: [...duplicateDeletes, updateDelta] } };
          }
          return { kind: 'delta', value: updateDelta };
        }

        // Si no existía asociación pero sí generalización: borrar generalización y crear asociación
        const deltas: any[] = [];
        for (const g of matchingGens) {
          deltas.push({ kind: 'generalization', op: 'delete', ...deltaBase(currentIr), generalizationId: g.id });
        }
        const deltaAggregationEnd = (isComposite || isShared)
          ? (wholeClassId === sourceClassId ? 'source' : 'target')
          : undefined;
        deltas.push({
          kind: 'association',
          op: 'create',
          ...deltaBase(currentIr),
          associationId: crypto.randomUUID(),
          sourceClassId,
          targetClassId,
          sourceMultiplicity: isComposite ? (wholeClassId === sourceClassId ? '1' : '0..*') : '1',
          targetMultiplicity: isComposite ? (wholeClassId === targetClassId ? '1' : '0..*') : '1',
          directed: false,
          aggregation: targetAgg,
          ...(deltaAggregationEnd ? { aggregationEnd: deltaAggregationEnd } : {}),
        });
        return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas } };
      }

      // CASO 5: Renombrado de nombre de etiqueta
      const existingAssoc = matchingAssocs[0];
      if (!existingAssoc) {
        return refused(`No association found between "${srcName}" and "${tgtName}".`);
      }
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'updateMultiplicity',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
        name: newName,
      };
      return { kind: 'delta', value: delta };
    }

    // 7e. INVERSIÓN de extremos, rombo, flecha o dirección entre dos clases o sobre una clase:
    // "inverti el nodo de relacion de composicion entre asistencia y materia",
    // "invertí la relación entre X e Y", "da vuelta la relación entre X e Y",
    // "invertí el rombo entre X e Y", "invertí la flecha entre X e Y",
    // "cambia el rombo a Materia", "pon el rombo en Materia"
    const isRelationInvert =
      /\b(?:invert[ií]|invierte|invertir|da\s+vuelta|dar\s+vuelta|dalo\s+vuelta|dala\s+vuelta|gira|girar|voltea|voltear|cambia\s+de\s+lado|flip|reverse|swap)\b[\s\S]*?\b(?:entre|between|de)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:y|and|con|with|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance) ||
      /\b(?:cambi[aá]|cambi[aá]le|pon[eé]|pon[eé]le|switch)\b[\s\S]*?\b(?:el\s+rombo|el\s+diamante|el\s+nodo|la\s+flecha|diamond|arrow)\b[\s\S]*?\b(?:a|hacia|en|to|on)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);

    if (isRelationInvert) {
      const srcName = isRelationInvert[1]!;
      const tgtName = isRelationInvert[2];

      if (tgtName) {
        const sourceClassId = classIdByName(currentIr, srcName);
        const targetClassId = classIdByName(currentIr, tgtName);
        if (sourceClassId === null) return refused(`Unknown class "${srcName}"`);
        if (targetClassId === null) return refused(`Unknown class "${tgtName}"`);

        const matchingAssocs = (currentIr.associations ?? []).filter(
          (a) =>
            (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
            (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
        );
        const matchingGens = (currentIr.generalizations ?? []).filter(
          (g) =>
            (g.subClassId === sourceClassId && g.superClassId === targetClassId) ||
            (g.subClassId === targetClassId && g.superClassId === sourceClassId),
        );

        // Inversión en asociación (rombo de composición / agregación o dirección)
        if (matchingAssocs.length > 0) {
          const primaryAssoc = matchingAssocs.find((a) => a.aggregation === 'composite' || a.aggregation === 'shared') || matchingAssocs[0]!;
          const duplicateDeletes = matchingAssocs.filter((a) => a.id !== primaryAssoc.id).map((a) => ({
            kind: 'association' as const,
            op: 'delete' as const,
            ...deltaBase(currentIr),
            associationId: a.id,
          }));

          const currentEnd = primaryAssoc.aggregationEnd ?? (primaryAssoc.sourceMultiplicity === '1' && primaryAssoc.targetMultiplicity?.includes('*') ? 'source' : 'target');
          const flippedEnd: 'source' | 'target' = currentEnd === 'source' ? 'target' : 'source';

          const updateDelta: AssociationDelta = {
            kind: 'association',
            op: 'updateMultiplicity',
            ...deltaBase(currentIr),
            associationId: primaryAssoc.id,
            aggregation: primaryAssoc.aggregation,
            aggregationEnd: flippedEnd,
            newSourceMultiplicity: primaryAssoc.targetMultiplicity || '1',
            newTargetMultiplicity: primaryAssoc.sourceMultiplicity || '1',
          };

          if (duplicateDeletes.length > 0) {
            return { kind: 'delta', value: { kind: 'batch', ...deltaBase(currentIr), deltas: [...duplicateDeletes, updateDelta] } };
          }
          return { kind: 'delta', value: updateDelta };
        }

        // Inversión en generalización (dar vuelta la flecha de herencia)
        if (matchingGens.length > 0) {
          const gen = matchingGens[0]!;
          const batch: BatchDelta = {
            kind: 'batch',
            ...deltaBase(currentIr),
            deltas: [
              {
                kind: 'generalization',
                op: 'delete',
                ...deltaBase(currentIr),
                generalizationId: gen.id,
              },
              {
                kind: 'generalization',
                op: 'create',
                ...deltaBase(currentIr),
                generalizationId: crypto.randomUUID(),
                subClassId: gen.superClassId,
                superClassId: gen.subClassId,
              },
            ],
          };
          return { kind: 'delta', value: batch };
        }
      } else {
        // Invertir rombo para que apunte a una clase específica: ej. "pon el rombo en Materia"
        const targetClassId = classIdByName(currentIr, srcName);
        if (targetClassId !== null) {
          const assoc = (currentIr.associations ?? []).find(
            (a) => (a.sourceClassId === targetClassId || a.targetClassId === targetClassId) && (a.aggregation === 'composite' || a.aggregation === 'shared')
          );
          if (assoc) {
            const isSource = assoc.sourceClassId === targetClassId;
            const updateDelta: AssociationDelta = {
              kind: 'association',
              op: 'updateMultiplicity',
              ...deltaBase(currentIr),
              associationId: assoc.id,
              aggregation: assoc.aggregation,
              aggregationEnd: isSource ? 'source' : 'target',
              newSourceMultiplicity: isSource ? '1' : '0..*',
              newTargetMultiplicity: isSource ? '0..*' : '1',
            };
            return { kind: 'delta', value: updateDelta };
          }
        }
      }
    }

    // 7c. ELIMINACIÓN de asociación / relación entre dos clases:
    // "elimina la relación entre X e Y", "borra la asociación entre X e Y", "delete association between X and Y", "desvincula X de Y"
    const isDeleteAssociation =
      /\b(?:delete|remove|elimina|eliminá|borra|borrá|sacar|sacá|saca|desvincula|desvinculá|unlink|detach)\b[\s\S]*?\b(?:asocia(?:ci[óo]n)?|association|link|relaci[oó]n|relations?|relationships?|enlace)\b[\s\S]*?\b(?:between|entre|de|from)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:and|with|y|e|de|con)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance) ||
      /\b(?:desvincula|desvinculá|unlink)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:de|from|con|with|y|and)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);
    if (isDeleteAssociation) {
      const sourceClassId = classIdByName(currentIr, isDeleteAssociation[1]!);
      const targetClassId = classIdByName(currentIr, isDeleteAssociation[2]!);
      if (sourceClassId === null) return refused(`Unknown class "${isDeleteAssociation[1]}"`);
      if (targetClassId === null) return refused(`Unknown class "${isDeleteAssociation[2]}"`);
      const existingAssoc = (currentIr.associations ?? []).find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId),
      );
      if (!existingAssoc) {
        return refused(`No association found between "${isDeleteAssociation[1]}" and "${isDeleteAssociation[2]}".`);
      }
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'delete',
        ...deltaBase(currentIr),
        associationId: existingAssoc.id,
      };
      return { kind: 'delta', value: delta };
    }

    // 8. asociación entre dos clases (simple o con cardinalidad)
    const isDeleteAssocIntent = /\b(?:delete|remove|elimina|eliminá|borra|borrá|sacar|sacá|saca|desvincula|desvinculá)\b/i.test(utterance);
    const isAssocClassIntent = /\b(?:clase\s+de\s+asociaci[óo]n|tabla\s+de\s+asociaci[óo]n|tabla\s+intermedia|clase\s+intermedia|entidad\s+intermedia|entidad\s+de\s+asociaci[óo]n|association\s+class|junction\s+table|join\s+table|intermediate\s+table|bridge\s+table|association\s+table)\b/i.test(utterance);
    const association = !isDeleteAssocIntent && !isAssocClassIntent
      ? /\b(?:link|conecta|conectá|asocia|asociá|associate|relate|relaciona|relacioná|asociaci[óo]n|association|connect|composici[óo]n|agregaci[óo]n)\b[\s\S]*?\b(?:entre\s+|between\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:with|con|y|and|e)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance)
      : null;
    if (association) {
      const sourceClassId = classIdByName(currentIr, association[1]!);
      const targetClassId = classIdByName(currentIr, association[2]!);
      if (sourceClassId === null) return refused(`Unknown class "${association[1]}"`);
      if (targetClassId === null) return refused(`Unknown class "${association[2]}"`);

      const isComposite = /\b(?:composici[oó]n|composite|composicion)\b/i.test(utterance);
      const isShared = /\b(?:agregaci[oó]n|shared|agregacion)\b/i.test(utterance);
      const aggregation: 'composite' | 'shared' | 'none' = isComposite ? 'composite' : (isShared ? 'shared' : 'none');

      // Detectar cuál es el todo (contenedor con rombo)
      const wholeMatch =
        /(?:(?:donde|que)\s+(?:la\s+clase\s+)?todo\s+(?:sea|es)|el\s+todo\s+es|la\s+clase\s+todo\s+es|todo\s+es|contenedor\s+es|rombo\s+en)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance) ||
        /(?:where\s+(?:the\s+)?(?:whole|container|owner)\s+(?:class\s+)?is|whole\s+is|container\s+is|diamond\s+on)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);

      const childPattern = /(?:detalle|item|linea|renglon|elemento|tramo|cuota|parte|componente|ticket|boleto|receta|presupuesto|movimiento|transaccion|bitacora|history|log|step|entry|inscripcion|matricula|asignacion|registro|subitem|subparte|asistencia)/i;

      let wholeClassId: string = targetClassId;
      const name1 = association[1]!.toLowerCase();
      const name2 = association[2]!.toLowerCase();

      if (wholeMatch) {
        const rawWhole = wholeMatch[1]!.toLowerCase();
        if (name1 === rawWhole || name1.startsWith(rawWhole) || rawWhole.startsWith(name1)) {
          wholeClassId = sourceClassId;
        } else if (name2 === rawWhole || name2.startsWith(rawWhole) || rawWhole.startsWith(name2)) {
          wholeClassId = targetClassId;
        }
      } else if (childPattern.test(name1) && !childPattern.test(name2)) {
        wholeClassId = targetClassId;
      } else if (childPattern.test(name2) && !childPattern.test(name1)) {
        wholeClassId = sourceClassId;
      }

      let sourceMultiplicity = isComposite ? (wholeClassId === sourceClassId ? '1' : '0..*') : '1';
      let targetMultiplicity = isComposite ? (wholeClassId === targetClassId ? '1' : '0..*') : '1';

      const explicitMultiplicities = /(?:from\s+)?(\d+(?:\.\.(?:\d+|\*))?|\*)\s+(?:to|a)\s+(\d+(?:\.\.(?:\d+|\*))?|\*)/i.exec(utterance);
      if (explicitMultiplicities) {
        sourceMultiplicity = explicitMultiplicities[1]!;
        targetMultiplicity = explicitMultiplicities[2]!;
      } else if (/\b(?:1\s+(?:a|to)\s+[nN\*]|(?:uno|one)\s+(?:a|to)\s+(?:muchos|many)|1\s*:\s*[nN\*])\b/i.test(utterance)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '0..*';
      } else if (/\b(?:[nN\*]\s+(?:a|to)\s+1|(?:muchos|many)\s+(?:a|to)\s+(?:uno|one)|[nN\*]\s*:\s*1)\b/i.test(utterance)) {
        sourceMultiplicity = '0..*';
        targetMultiplicity = '1';
      } else if (/\b(?:[nN\*]\s+(?:a|to)\s+[nNmM\*]|(?:muchos|many)\s+(?:a|to)\s+(?:muchos|many)|[nN\*]\s*:\s*[nNmM\*])\b/i.test(utterance)) {
        sourceMultiplicity = '0..*';
        targetMultiplicity = '0..*';
      } else if (/\b(?:1\s+(?:a|to)\s+1|(?:uno|one)\s+(?:a|to)\s+(?:uno|one)|1\s*:\s*1)\b/i.test(utterance)) {
        sourceMultiplicity = '1';
        targetMultiplicity = '1';
      }

      const nameMatch = /\b(?:llamada|llamado|nombrada|nombrado|named|called|con\s+(?:el\s+)?nombre|de\s+nombre)\s+["']?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)["']?/i.exec(utterance);
      let assocName: string | undefined;
      if (nameMatch) {
        const candidate = nameMatch[1]!;
        if (!/^(clase|tabla|entidad|asociacion|relacion|multiplicidad|muchos|uno)$/i.test(candidate) &&
            candidate.toLowerCase() !== association[1]!.toLowerCase() &&
            candidate.toLowerCase() !== association[2]!.toLowerCase()) {
          assocName = candidate;
        }
      }

      const existingAssoc = currentIr.associations.find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
      );

      const isExplicitChange = /(?:cambia|modifica|pasa|actualiza|change|update|haz\s+que|hace\s+que)/i.test(utterance);

      if (existingAssoc && isExplicitChange) {
        const isReversed = existingAssoc.sourceClassId === targetClassId;
        const assocAggregationEnd = (isComposite || isShared)
          ? (wholeClassId === existingAssoc.sourceClassId ? 'source' : 'target')
          : (existingAssoc.aggregationEnd ?? 'source');

        const delta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: existingAssoc.id,
          aggregation,
          aggregationEnd: assocAggregationEnd,
          newSourceMultiplicity: isReversed ? targetMultiplicity : sourceMultiplicity,
          newTargetMultiplicity: isReversed ? sourceMultiplicity : targetMultiplicity,
          ...(assocName ? { name: assocName } : {}),
        };
        return { kind: 'delta', value: delta };
      }

      const deltaAggregationEnd = (isComposite || isShared)
        ? (wholeClassId === sourceClassId ? 'source' : 'target')
        : undefined;

      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity,
        targetMultiplicity,
        directed: false,
        aggregation,
        ...(deltaAggregationEnd ? { aggregationEnd: deltaAggregationEnd } : {}),
        ...(assocName ? { name: assocName } : {}),
      };
      return { kind: 'delta', value: delta };
    }

    // 9. composición: "X is composed of Y" o "X composes Y" — X es el todo (contenedor), Y es la parte
    const composition = /\b([A-Za-z_]\w*)\s+(?:is\s+)?(?:composed\s+of|composes|compone)\s+([A-Za-z_]\w*)/i.exec(utterance);
    if (composition) {
      const sourceClassId = classIdByName(currentIr, composition[1]!); // todo/contenedor
      const targetClassId = classIdByName(currentIr, composition[2]!); // parte
      if (sourceClassId === null) return refused(`Unknown class "${composition[1]}"`);
      if (targetClassId === null) return refused(`Unknown class "${composition[2]}"`);
      const existingAssoc = currentIr.associations.find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
      );
      if (existingAssoc) {
        const isReversed = existingAssoc.sourceClassId === targetClassId;
        const delta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: existingAssoc.id,
          aggregation: 'composite',
          aggregationEnd: isReversed ? 'target' : 'source',
          newSourceMultiplicity: isReversed ? '0..*' : '1',
          newTargetMultiplicity: isReversed ? '1' : '0..*',
        };
        return { kind: 'delta', value: delta };
      }
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
        directed: false,
        aggregation: 'composite',
        aggregationEnd: 'source', // el todo está en el extremo origen (source)
      };
      return { kind: 'delta', value: delta };
    }

    // 9b. fraseo inverso de composición: "X is part of Y", "X belongs to Y", "X es parte de Y" — Y es el todo, X es la parte
    const partOf = /\b([A-Za-z_]\w*)\s+(?:is\s+)?(?:part\s+of|belongs\s+to|es\s+parte\s+de|pertenece\s+a)\s+([A-Za-z_]\w*)/i.exec(utterance);
    if (partOf) {
      const partClassId = classIdByName(currentIr, partOf[1]!); // parte
      const wholeClassId = classIdByName(currentIr, partOf[2]!); // todo/contenedor
      if (partClassId === null) return refused(`Unknown class "${partOf[1]}"`);
      if (wholeClassId === null) return refused(`Unknown class "${partOf[2]}"`);
      const existingAssoc = currentIr.associations.find(
        (a) =>
          (a.sourceClassId === partClassId && a.targetClassId === wholeClassId) ||
          (a.sourceClassId === wholeClassId && a.targetClassId === partClassId)
      );
      if (existingAssoc) {
        const isReversed = existingAssoc.sourceClassId === wholeClassId;
        const delta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: existingAssoc.id,
          aggregation: 'composite',
          aggregationEnd: isReversed ? 'source' : 'target',
          newSourceMultiplicity: isReversed ? '1' : '0..*',
          newTargetMultiplicity: isReversed ? '0..*' : '1',
        };
        return { kind: 'delta', value: delta };
      }
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId: partClassId,
        targetClassId: wholeClassId,
        sourceMultiplicity: '0..*',
        targetMultiplicity: '1',
        directed: false,
        aggregation: 'composite',
        aggregationEnd: 'target', // el todo está en el extremo destino (target)
      };
      return { kind: 'delta', value: delta };
    }

    // 10. agregación compartida: "aggregation between X and Y" o "X has a Y" (compartida)
    const sharedAgg = /\b(?:aggregation|shared|agregaci[oó]n)\b[\s\S]*?\b(?:between|entre\s+)?([A-Za-z_]\w*)\s+(?:and|with|y|e)\s+([A-Za-z_]\w*)/i.exec(utterance);
    if (sharedAgg) {
      const sourceClassId = classIdByName(currentIr, sharedAgg[1]!);
      const targetClassId = classIdByName(currentIr, sharedAgg[2]!);
      if (sourceClassId === null) return refused(`Unknown class "${sharedAgg[1]}"`);
      if (targetClassId === null) return refused(`Unknown class "${sharedAgg[2]}"`);
      const existingAssoc = currentIr.associations.find(
        (a) =>
          (a.sourceClassId === sourceClassId && a.targetClassId === targetClassId) ||
          (a.sourceClassId === targetClassId && a.targetClassId === sourceClassId)
      );
      if (existingAssoc) {
        const delta: AssociationDelta = {
          kind: 'association',
          op: 'updateMultiplicity',
          ...deltaBase(currentIr),
          associationId: existingAssoc.id,
          aggregation: 'shared',
          aggregationEnd: existingAssoc.sourceClassId === sourceClassId ? 'source' : 'target',
        };
        return { kind: 'delta', value: delta };
      }
      const delta: AssociationDelta = {
        kind: 'association',
        op: 'create',
        ...deltaBase(currentIr),
        associationId: crypto.randomUUID(),
        sourceClassId,
        targetClassId,
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
        directed: false,
        aggregation: 'shared',
        aggregationEnd: 'source', // por defecto origen para agregación compartida
      };
      return { kind: 'delta', value: delta };
    }

    // 11. ELIMINACIÓN de generalización (verificado ANTES de create para que las negaciones tengan prioridad):
    // "X does not inherit from Y", "remove inheritance from X",
    // "remove inheritance between X and Y".
    const existingGens: readonly Generalization[] = currentIr.generalizations ?? [];
    const notInherit = /\b([A-Za-z_]\w*)\s+does\s+not\s+inherit\s+from\s+([A-Za-z_]\w*)/i.exec(utterance);
    const removeInheritance = /\b(?:remove|delete|elimina|eliminá|borra|borrá)\b[\s\S]*?\binheritance\b[\s\S]*?\b(?:from|between|de|entre)\s+([A-Za-z_]\w*)(?:\s+(?:and|y|con)\s+([A-Za-z_]\w*))?/i.exec(utterance);
    const deleteMatch = notInherit ?? (removeInheritance ? [removeInheritance[0], removeInheritance[1]!, removeInheritance[2]] : null);
    if (deleteMatch) {
      const subClassId = classIdByName(currentIr, deleteMatch[1]!);
      if (subClassId === null) return refused(`Unknown class "${deleteMatch[1]}"`);
      let edge: Generalization | undefined;
      if (deleteMatch[2]) {
        const superClassId = classIdByName(currentIr, deleteMatch[2]);
        if (superClassId === null) return refused(`Unknown class "${deleteMatch[2]}"`);
        edge = existingGens.find((g) => g.subClassId === subClassId && g.superClassId === superClassId);
      } else {
        edge = existingGens.find((g) => g.subClassId === subClassId);
      }
      if (edge === undefined) {
        return refused(`No inheritance found for class "${deleteMatch[1]}".`);
      }
      const delta: GeneralizationDelta = {
        kind: 'generalization',
        op: 'delete',
        ...deltaBase(currentIr),
        generalizationId: edge.id,
      };
      return { kind: 'delta', value: delta };
    }

    // 12. CREACIÓN de generalización: "X is a kind of Y", "X inherits from Y",
    // "X is a subclass of Y", "X hereda de Y", "X es un Y", "X es una Y"
    const generalization = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:(?:is\s+)?(?:a\s+kind\s+of|inherits\s+from|a\s+subclass\s+of)|hereda\s+de|es\s+(?:un|una|subtipo\s+de))\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)/i.exec(utterance);
    if (generalization) {
      const subClassId = classIdByName(currentIr, generalization[1]!);
      const superClassId = classIdByName(currentIr, generalization[2]!);
      if (subClassId === null) return refused(`Unknown class "${generalization[1]}"`);
      if (superClassId === null) return refused(`Unknown class "${generalization[2]}"`);
      const delta: GeneralizationDelta = {
        kind: 'generalization',
        op: 'create',
        ...deltaBase(currentIr),
        generalizationId: crypto.randomUUID(),
        subClassId,
        superClassId,
      };
      return { kind: 'delta', value: delta };
    }

    // 13. CREACIÓN de realización (unidad 12.5, mitad 12a): "X realizes Y" /
    // "X implements Y" — X es la clase cliente, Y la interfaz proveedora.
    // El motor aplica el invariante de destino de interfaz al aplicar el delta.
    const realization = /\b([A-Za-z_]\w*)\s+(?:realizes|realiza|implements|implementa)\s+([A-Za-z_]\w*)/i.exec(utterance);
    if (realization) {
      const clientClassId = classIdByName(currentIr, realization[1]!);
      const supplierInterfaceId = classIdByName(currentIr, realization[2]!);
      if (clientClassId === null) return refused(`Unknown class "${realization[1]}"`);
      if (supplierInterfaceId === null) return refused(`Unknown class "${realization[2]}"`);
      const delta: RealizationDelta = {
        kind: 'realization',
        op: 'create',
        ...deltaBase(currentIr),
        realizationId: crypto.randomUUID(),
        clientClassId,
        supplierInterfaceId,
      };
      return { kind: 'delta', value: delta };
    }

    // 13b. ELIMINACIÓN de dependencia (unidad 12.5, mitad 12b; verificada ANTES de create
    // para que las negaciones tengan prioridad, imitando a la generalización):
    // "X does not depend on Y", "remove dependency between X and Y", "remove dependency from X".
    const existingDeps: readonly Dependency[] = currentIr.dependencies ?? [];
    const notDepend = /\b([A-Za-z_]\w*)\s+does\s+not\s+depend\s+on\s+([A-Za-z_]\w*)/i.exec(utterance);
    const removeDependency = /\b(?:remove|delete|elimina|eliminá|borra|borrá)\b[\s\S]*?\bdependen(?:cy|cia)\b[\s\S]*?\b(?:between|from|de|entre)\s+([A-Za-z_]\w*)(?:\s+(?:and|y|con)\s+([A-Za-z_]\w*))?/i.exec(utterance);
    const depDeleteMatch = notDepend ?? (removeDependency ? [removeDependency[0], removeDependency[1]!, removeDependency[2]] : null);
    if (depDeleteMatch) {
      const clientClassId = classIdByName(currentIr, depDeleteMatch[1]!);
      if (clientClassId === null) return refused(`Unknown class "${depDeleteMatch[1]}"`);
      let edge: Dependency | undefined;
      if (depDeleteMatch[2]) {
        const supplierClassId = classIdByName(currentIr, depDeleteMatch[2]);
        if (supplierClassId === null) return refused(`Unknown class "${depDeleteMatch[2]}"`);
        edge = existingDeps.find((d) => d.clientClassId === clientClassId && d.supplierClassId === supplierClassId);
      } else {
        edge = existingDeps.find((d) => d.clientClassId === clientClassId);
      }
      if (edge === undefined) {
        return refused(`No dependency found for class "${depDeleteMatch[1]}".`);
      }
      const delta: DependencyDelta = {
        kind: 'dependency',
        op: 'delete',
        ...deltaBase(currentIr),
        dependencyId: edge.id,
      };
      return { kind: 'delta', value: delta };
    }

    // 13c. CREACIÓN de dependencia (unidad 12.5, mitad 12b): "X depends on Y" /
    // "X uses Y" — X es el cliente, Y el proveedor (CUALQUIER clase o interfaz;
    // sin requerimiento de interfaz como destino, a diferencia de la realización).
    const dependency = /\b([A-Za-z_]\w*)\s+(?:depends\s+on|depende\s+de|uses|utiliza|usa)\s+([A-Za-z_]\w*)/i.exec(utterance);
    if (dependency) {
      const clientClassId = classIdByName(currentIr, dependency[1]!);
      const supplierClassId = classIdByName(currentIr, dependency[2]!);
      if (clientClassId === null) return refused(`Unknown class "${dependency[1]}"`);
      if (supplierClassId === null) return refused(`Unknown class "${dependency[2]}"`);
      const delta: DependencyDelta = {
        kind: 'dependency',
        op: 'create',
        ...deltaBase(currentIr),
        dependencyId: crypto.randomUUID(),
        clientClassId,
        supplierClassId,
      };
      return { kind: 'delta', value: delta };
    }

    // 14. marcado abstracto (unidad 12.5, mitad 12a): "make X abstract" / "marca la clase X como abstracta"
    const makeAbstract = /\b(?:make|mark|marca|marcá|hace|haz|pon|ponele)\s+(?:the\s+|la\s+)?(?:class\s+|clase\s+|calse\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ]\w*)\s+(?:como\s+)?abstract(?:a|o)?/i.exec(utterance);
    if (makeAbstract) {
      const classId = classIdByName(currentIr, makeAbstract[1]!);
      if (classId === null) return refused(`Unknown class "${makeAbstract[1]}"`);
      const delta: ClassDelta = {
        kind: 'class',
        op: 'update',
        ...deltaBase(currentIr),
        classId,
        isAbstract: true,
      };
      return { kind: 'delta', value: delta };
    }

    return refused('Unsupported command.');
  }
}
