import type { MemberDelta, LlmResult } from '@app/core';
import { classIdByName, deltaBase, type FakeLlmContext } from './helpers.js';
import { sanitizeUmlType, inferAttributeType } from '../normalizer.js';

export function tryMemberAdd(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, adornments, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

  // 4 (evaluado PRIMERO). agregar atributo a una clase EXISTENTE.
  const directAdd = /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|añadile|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?\s+(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
  const invertedAdd = !directAdd && /\b(?:en|a|para|edit(?:a|ar|á|ame|áme)|modific(?:a|ar|á|ame|áme))\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?/i.exec(utterance);
  const directToClassAdd = !directAdd && !invertedAdd && /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)[\s\S]*?\b(?:attributes?|atributos?|campos?|columnas?|propiedades?|property|properties|fields?)\s+(?:llamado\s+|con\s+nombre\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*))?/i.exec(utterance);
  const directTypedAdd = !directAdd && !invertedAdd && !directToClassAdd &&
    /\b(?:add|agrega|agregá|agregale|agregále|añade|añadí|añadile|pon|ponele|sumale|sumá|inserta|insertá)\b[\s\S]*?\b([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s*(?::|\bof type\b|\bde tipo\b|\btipo\b|\bque sea\b|\bcomo\b)\s*([A-Za-z_][\w.]*)\s+(?:to|into|in|a|en|para)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);

  // Soporte para múltiples atributos a una clase existente
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

  return null;
}

export function tryMemberMutations(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

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
  // 5b2. mutación de atributo con clase al inicio
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
  const renameAttrToIn = /\b(?:rename|renombr[aá]|cambi[aá]\s+el\s+nombre\s+de)\s+(?:(?:the|el|la)\s+)?(?:attribute|atributo|campo|columna|propiedad|property|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)/i.exec(utterance);
  const renameAttrInClass = !renameAttrToIn && /\b(?:rename|renombr[aá]|cambi[aá]\s+el\s+nombre\s+de|pon[eé]\s+en\s+min[uú]sculas)\s+(?:(?:the|el|la)\s+)?(?:attribute|atributo|campo|columna|propiedad|property|field)?\s*([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)\s+(?:en|de|in)\s+(?:(?:the|la|el)\s+)?(?:class\s+|clase\s+|tabla\s+|table\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*)(?:\s+(?:a|por|to)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚ][\wñÑáéíóúÁÉÍÓÚ]*))?/i.exec(utterance);
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

  return null;
}
