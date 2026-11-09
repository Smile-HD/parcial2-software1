import crypto from 'node:crypto';
import type { DeltaExpansionContext } from './context.js';
import type { SemanticRenames, SemanticUpdates } from '../types.js';
import { cleanClassName, toCanonicalKey } from './delta-helpers.js';

/**
 * Procesa renombrados de clases, atributos y métodos en el diagrama.
 */
export function applyClassRenames(ctx: DeltaExpansionContext, renames?: SemanticRenames): void {
  if (!renames) return;
  const { diagramId, timestamp, deltas, classIdMap, existingClassesMap, resolveClassId } = ctx;

  if (Array.isArray(renames.classes)) {
    for (const r of renames.classes) {
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

  if (Array.isArray(renames.attributes)) {
    for (const r of renames.attributes) {
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

  if (Array.isArray(renames.methods)) {
    for (const r of renames.methods) {
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

/**
 * Procesa actualizaciones de clases existentes, posiciones, atributos y métodos.
 */
export function applyClassAndMemberUpdates(ctx: DeltaExpansionContext, updates?: SemanticUpdates): void {
  if (!updates) return;
  const { diagramId, timestamp, deltas, existingClassesMap, resolveClassId } = ctx;

  if (Array.isArray(updates.classes)) {
    for (const u of updates.classes) {
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

  if (Array.isArray(updates.positions)) {
    for (const p of updates.positions) {
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

  if (Array.isArray(updates.attributes)) {
    for (const u of updates.attributes) {
      const classId = resolveClassId(u.class);
      if (classId) {
        const ec = Array.from(existingClassesMap.values()).find((c) => c.id === classId);
        if (ec && Array.isArray(ec.attributes)) {
          const attr = ec.attributes.find((a: any) => a.name && a.name.trim().toLowerCase() === u.name.trim().toLowerCase());
          if (attr) {
            const cleanType = u.type
              ? (['int', 'float', 'string', 'boolean', 'date'].includes(u.type.toLowerCase()) ? u.type.toLowerCase() : (u.type === 'number' ? 'float' : 'string'))
              : attr.type;
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

  if (Array.isArray(updates.methods)) {
    for (const u of updates.methods) {
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
}
