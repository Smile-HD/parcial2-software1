import {
  type Generalization,
  type GeneralizationDelta,
  type RealizationDelta,
  type Dependency,
  type DependencyDelta,
  type ClassDelta,
  type LlmResult,
  wouldCreateGeneralizationCycle,
} from '@app/core';
import { classIdByName, deltaBase, type FakeLlmContext } from './helpers.js';

export function tryHierarchyCommands(ctx: FakeLlmContext): LlmResult | null {
  const { utterance, currentIr } = ctx;
  const refused = (reason: string): LlmResult => ({ kind: 'refused', reason });

  // 11. ELIMINACIÓN de generalización (verificado ANTES de create para que las negaciones tengan prioridad)
  const existingGens: readonly Generalization[] = currentIr.generalizations ?? [];
  const notInherit = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+does\s+not\s+inherit\s+from\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  const removeInheritance = /\b(?:remove|delete|elimina|eliminá|borra|borrá)\b[\s\S]*?\binheritance\b[\s\S]*?\b(?:from|between|de|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)(?:\s+(?:and|y|con)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*))?/i.exec(utterance);
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

  // 12. CREACIÓN de generalización
  const generalization = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:(?:is\s+)?(?:a\s+kind\s+of|inherits\s+from|a\s+subclass\s+of)|hereda\s+de|es\s+(?:un|una|subtipo\s+de))\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  if (generalization) {
    const subClassId = classIdByName(currentIr, generalization[1]!);
    const superClassId = classIdByName(currentIr, generalization[2]!);
    if (subClassId === null) return refused(`Unknown class "${generalization[1]}"`);
    if (superClassId === null) return refused(`Unknown class "${generalization[2]}"`);
    if (subClassId === superClassId) {
      return refused(`La auto-herencia es inválida en UML ("${generalization[1]}" no puede heredar de sí misma)`);
    }
    if (wouldCreateGeneralizationCycle(currentIr, subClassId, superClassId)) {
      return refused(`La herencia circular es inválida en UML (crearía un ciclo entre "${generalization[1]}" y "${generalization[2]}")`);
    }
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

  // 13. CREACIÓN de realización
  const realization = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:realizes|realiza|implements|implementa)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
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

  // 13b. ELIMINACIÓN de dependencia
  const existingDeps: readonly Dependency[] = currentIr.dependencies ?? [];
  const notDepend = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+does\s+not\s+depend\s+on\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
  const removeDependency = /\b(?:remove|delete|elimina|eliminá|borra|borrá)\b[\s\S]*?\bdependen(?:cy|cia)\b[\s\S]*?\b(?:between|from|de|entre)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)(?:\s+(?:and|y|con)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*))?/i.exec(utterance);
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

  // 13c. CREACIÓN de dependencia
  const dependency = /\b([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:depends\s+on|depende\s+de|uses|utiliza|usa)\s+([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)/i.exec(utterance);
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

  // 14. marcado abstracto
  const makeAbstract = /\b(?:make|mark|marca|marcá|hace|haz|pon|ponele)\s+(?:the\s+|la\s+)?(?:class\s+|clase\s+|calse\s+|tabla\s+|entidad\s+)?([A-Za-z_ñÑáéíóúÁÉÍÓÚüÜ][\wñÑáéíóúÁÉÍÓÚüÜ]*)\s+(?:como\s+)?abstract(?:a|o)?/i.exec(utterance);
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

  return null;
}
