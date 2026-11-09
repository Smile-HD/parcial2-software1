import type {
  ClassDelta,
  MemberDelta,
  BatchDelta,
  Delta,
  LlmResult,
} from '@app/core';
import { classIdByName, nextPosition, deltaBase, type FakeLlmContext } from './helpers.js';
import { sanitizeUmlType } from '../normalizer.js';

export function tryClassCommands(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, adornments, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

  // 0 (evaluado PRIMERO entre las creaciones). crear interfaz: "create interface X"
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

  return null;
}
