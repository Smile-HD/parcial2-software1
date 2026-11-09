import crypto from 'node:crypto';
import type { DeltaExpansionContext } from './context.js';
import type { SemanticDomainModel } from '../types.js';
import {
  cleanClassName,
  toCanonicalKey,
  sanitizeAttributeNameAndType,
  generateDefaultAttributesForClass,
} from './delta-helpers.js';

/**
 * Crea clases nuevas o actualiza miembros de clases existentes en el lienzo.
 */
export function applyClassesDeltas(ctx: DeltaExpansionContext, model: SemanticDomainModel): void {
  if (!Array.isArray(model.classes) || model.classes.length === 0) return;
  const { diagramId, timestamp, deltas, classIdMap, existingClassesMap, currentDiagram } = ctx;

  const cols = 2;
  model.classes.forEach((cls, idx) => {
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

    // Atributos de la clase
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

      const sanitized = sanitizeAttributeNameAndType(name, type);
      name = sanitized.name;
      type = sanitized.type;
      if (!name) return;
      if (/^(type|tipo|string|int|float|boolean|attribute|attr|date)$/i.test(name)) return;
      if (name.toLowerCase() === 'name' && type.toLowerCase() === 'string' && attrList.length > 3) return;

      const rawType = type.toLowerCase().trim().replace(/\[\]$/, '').replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
      const cleanType = ['int', 'float', 'string', 'boolean', 'date'].includes(rawType)
        ? rawType
        : rawType === 'number' || rawType === 'double' || rawType === 'decimal' ? 'float' : 'string';

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
