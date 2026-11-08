import {
  type Diagram,
  GeneralizationSchema,
  RealizationSchema,
  DependencySchema,
} from '../ir.js';
import {
  type GeneralizationDelta,
  type RealizationDelta,
  type DependencyDelta,
} from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import { findClass, wouldCreateGeneralizationCycle } from './cascade.js';

/**
 * Aplica un delta de generalización individual (invariantes de la unidad 11.2):
 * - create: ambas clases deben existir; sin aristas duplicadas (mismo sub+super);
 *   sin ciclos (auto-bucle, ciclo de 2 elementos, o transitivo vía recorrido de ancestros).
 * - update: la arista debe existir; establece la etiqueta opcional (unidad 13c). Una
 *   cadena vacía la limpia (imita la semántica del nombre de asociación).
 * - delete: la arista debe existir.
 */
export function applyGeneralizationDelta(
  diagram: Diagram,
  delta: GeneralizationDelta
): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.subClassId || !delta.superClassId) {
        return err({
          kind: 'InvalidOperationError',
          reason: 'Generalization create requires subClassId and superClassId',
        });
      }
      if (!findClass(diagram, delta.subClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.subClassId });
      }
      if (!findClass(diagram, delta.superClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.superClassId });
      }
      if (
        diagram.generalizations.some(
          g => g.subClassId === delta.subClassId && g.superClassId === delta.superClassId
        )
      ) {
        return err({
          kind: 'DuplicateGeneralizationError',
          subClassId: delta.subClassId,
          superClassId: delta.superClassId,
        });
      }
      if (wouldCreateGeneralizationCycle(diagram, delta.subClassId, delta.superClassId)) {
        return err({
          kind: 'GeneralizationCycleError',
          subClassId: delta.subClassId,
          superClassId: delta.superClassId,
        });
      }
      const newGeneralization = GeneralizationSchema.parse({
        id: delta.generalizationId,
        subClassId: delta.subClassId,
        superClassId: delta.superClassId,
      });
      return ok({ ...diagram, generalizations: [...diagram.generalizations, newGeneralization] });
    }

    case 'update': {
      if (delta.name === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Generalization update requires name' });
      }
      const genIndex = diagram.generalizations.findIndex(g => g.id === delta.generalizationId);
      if (genIndex === -1) {
        return err({ kind: 'GeneralizationNotFoundError', generalizationId: delta.generalizationId });
      }
      const updatedGeneralizations = [...diagram.generalizations];
      updatedGeneralizations[genIndex] = {
        ...updatedGeneralizations[genIndex],
        name: delta.name || undefined,
      };
      return ok({ ...diagram, generalizations: updatedGeneralizations });
    }

    case 'delete': {
      const genIndex = diagram.generalizations.findIndex(g => g.id === delta.generalizationId);
      if (genIndex === -1) {
        return err({ kind: 'GeneralizationNotFoundError', generalizationId: delta.generalizationId });
      }
      const updatedGeneralizations = diagram.generalizations.filter(
        g => g.id !== delta.generalizationId
      );
      return ok({ ...diagram, generalizations: updatedGeneralizations });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({
        kind: 'InvalidOperationError',
        reason: `Unknown generalization op: ${_exhaustive}`,
      });
    }
  }
}

/**
 * Aplica un delta de realización individual (invariantes de la unidad 12.2):
 * - create: ambos extremos deben existir; el PROVEEDOR (supplier) DEBE ser una interfaz
 *   (`kind === 'interface'` — realizar una clase común o abstracta es una
 *   violación de UML); sin aristas duplicadas (mismo cliente + proveedor).
 * - update: la arista debe existir; establece la etiqueta opcional (unidad 13c). Una
 *   cadena vacía la limpia (imita la semántica del nombre de asociación).
 * - delete: la arista debe existir.
 */
export function applyRealizationDelta(
  diagram: Diagram,
  delta: RealizationDelta
): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.clientClassId || !delta.supplierInterfaceId) {
        return err({
          kind: 'InvalidOperationError',
          reason: 'Realization create requires clientClassId and supplierInterfaceId',
        });
      }
      if (!findClass(diagram, delta.clientClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.clientClassId });
      }
      const supplier = findClass(diagram, delta.supplierInterfaceId);
      if (!supplier) {
        return err({ kind: 'ClassNotFoundError', classId: delta.supplierInterfaceId });
      }
      if (supplier.kind !== 'interface') {
        return err({ kind: 'RealizationTargetNotInterfaceError', supplierClassId: supplier.id });
      }
      if (
        diagram.realizations.some(
          r =>
            r.clientClassId === delta.clientClassId &&
            r.supplierInterfaceId === delta.supplierInterfaceId
        )
      ) {
        return err({
          kind: 'DuplicateRealizationError',
          clientClassId: delta.clientClassId,
          supplierInterfaceId: delta.supplierInterfaceId,
        });
      }
      const newRealization = RealizationSchema.parse({
        id: delta.realizationId,
        clientClassId: delta.clientClassId,
        supplierInterfaceId: delta.supplierInterfaceId,
      });
      return ok({ ...diagram, realizations: [...diagram.realizations, newRealization] });
    }

    case 'update': {
      if (delta.name === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Realization update requires name' });
      }
      const realIndex = diagram.realizations.findIndex(r => r.id === delta.realizationId);
      if (realIndex === -1) {
        return err({ kind: 'RealizationNotFoundError', realizationId: delta.realizationId });
      }
      const updatedRealizations = [...diagram.realizations];
      updatedRealizations[realIndex] = {
        ...updatedRealizations[realIndex],
        name: delta.name || undefined,
      };
      return ok({ ...diagram, realizations: updatedRealizations });
    }

    case 'delete': {
      const realIndex = diagram.realizations.findIndex(r => r.id === delta.realizationId);
      if (realIndex === -1) {
        return err({ kind: 'RealizationNotFoundError', realizationId: delta.realizationId });
      }
      const updatedRealizations = diagram.realizations.filter(r => r.id !== delta.realizationId);
      return ok({ ...diagram, realizations: updatedRealizations });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown realization op: ${_exhaustive}` });
    }
  }
}

/**
 * Aplica un delta de dependencia individual (invariantes de la unidad 12.2, mitad 12b):
 * - create: ambos extremos deben existir; sin aristas duplicadas (mismo cliente +
 *   proveedor). A diferencia de la realización, el proveedor puede ser CUALQUIER clase o
 *   interfaz — NO existe requisito de destino de interfaz ni multiplicidad.
 * - update: la arista debe existir; establece la etiqueta opcional (unidad 13c). Una
 *   cadena vacía la limpia (imita la semántica del nombre de asociación).
 * - delete: la arista debe existir.
 */
export function applyDependencyDelta(
  diagram: Diagram,
  delta: DependencyDelta
): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.clientClassId || !delta.supplierClassId) {
        return err({
          kind: 'InvalidOperationError',
          reason: 'Dependency create requires clientClassId and supplierClassId',
        });
      }
      if (!findClass(diagram, delta.clientClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.clientClassId });
      }
      if (!findClass(diagram, delta.supplierClassId)) {
        return err({ kind: 'ClassNotFoundError', classId: delta.supplierClassId });
      }
      if (
        diagram.dependencies.some(
          d => d.clientClassId === delta.clientClassId && d.supplierClassId === delta.supplierClassId
        )
      ) {
        return err({
          kind: 'DuplicateDependencyError',
          clientClassId: delta.clientClassId,
          supplierClassId: delta.supplierClassId,
        });
      }
      const newDependency = DependencySchema.parse({
        id: delta.dependencyId,
        clientClassId: delta.clientClassId,
        supplierClassId: delta.supplierClassId,
      });
      return ok({ ...diagram, dependencies: [...diagram.dependencies, newDependency] });
    }

    case 'update': {
      if (delta.name === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Dependency update requires name' });
      }
      const depIndex = diagram.dependencies.findIndex(d => d.id === delta.dependencyId);
      if (depIndex === -1) {
        return err({ kind: 'DependencyNotFoundError', dependencyId: delta.dependencyId });
      }
      const updatedDependencies = [...diagram.dependencies];
      updatedDependencies[depIndex] = {
        ...updatedDependencies[depIndex],
        name: delta.name || undefined,
      };
      return ok({ ...diagram, dependencies: updatedDependencies });
    }

    case 'delete': {
      const depIndex = diagram.dependencies.findIndex(d => d.id === delta.dependencyId);
      if (depIndex === -1) {
        return err({ kind: 'DependencyNotFoundError', dependencyId: delta.dependencyId });
      }
      const updatedDependencies = diagram.dependencies.filter(d => d.id !== delta.dependencyId);
      return ok({ ...diagram, dependencies: updatedDependencies });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown dependency op: ${_exhaustive}` });
    }
  }
}

