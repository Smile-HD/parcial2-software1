import {
  applyDelta,
  type Diagram,
  type Delta,
  type LlmPort,
  type LlmResult,
} from '@app/core';
import {
  normalizeUmlUtterance,
  splitCompoundUtterance,
} from '../normalizer.js';
import {
  deltaBase,
  WHOLE_DESIGN_REQUEST,
  type FakeLlmContext,
} from './helpers.js';
import { tryMemberAdd, tryMemberMutations } from './member-handlers.js';
import { tryClassCommands } from './class-handlers.js';
import { tryAssociationMutations } from './association-mutations.js';
import { tryRelationshipCommands } from './relationship-handlers.js';
import { tryHierarchyCommands } from './hierarchy-handlers.js';

export * from './helpers.js';
export * from './class-handlers.js';
export * from './member-handlers.js';
export * from './association-mutations.js';
export * from './relationship-handlers.js';
export * from './hierarchy-handlers.js';

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

    // Multi-comando compuesto separado por ';'
    const parts = splitCompoundUtterance(rawUtterance);
    if (parts.length > 1) {
      let runningIr: Diagram = currentIr;
      const collectedDeltas: Delta[] = [];
      const renamedClasses = new Map<string, string>();
      let lastTargetClass: string | null = null;

      for (let part of parts) {
        for (const [oldName, newName] of renamedClasses.entries()) {
          const regex = new RegExp(`\\b${oldName}\\b`, 'gi');
          part = part.replace(regex, newName);
        }

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

    // Heurísticas de adornos UML
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

    const ctx: FakeLlmContext = {
      rawUtterance,
      utterance,
      adornments,
      currentIr,
    };

    // 1. Inserción de atributos a clase existente (evaluado primero)
    const memberAddRes = tryMemberAdd(ctx);
    if (memberAddRes) return memberAddRes;

    // 2. Operaciones sobre clases (crear interfaz, crear clase, renombrar, borrar, wipe)
    const classRes = tryClassCommands(ctx);
    if (classRes) return classRes;

    // 3. Mutaciones de miembros (eliminar atributo/método, cambiar tipo, renombrar, agregar método)
    const memberMutRes = tryMemberMutations(ctx);
    if (memberMutRes) return memberMutRes;

    // 4. Mutaciones de asociaciones existentes (cardinalidad, conversión, renombre, inversión, eliminación)
    const assocMutRes = tryAssociationMutations(ctx);
    if (assocMutRes) return assocMutRes;

    // 5. Creación de relaciones (n-aria, asociación con clase intermedia, nombrada, reflexiva, binaria, composición, agregación)
    const relRes = tryRelationshipCommands(ctx);
    if (relRes) return relRes;

    // 6. Jerarquías y dependencias (generalización, realización, dependencia, marcar abstracto)
    const hierRes = tryHierarchyCommands(ctx);
    if (hierRes) return hierRes;

    return refused('Unsupported command.');
  }
}
