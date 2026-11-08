import { type Diagram, ClassSchema } from '../ir.js';
import { type ClassDelta } from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import {
  isDuplicateClassName,
  cascadeDeleteAssociations,
  cascadeDeleteGeneralizations,
  cascadeDeleteRealizations,
  cascadeDeleteDependencies,
  cascadeDeleteNaryAssociations,
} from './cascade.js';

/**
 * Aplica un único delta de clase.
 */
export function applyClassDelta(diagram: Diagram, delta: ClassDelta): ApplyResult<Diagram> {
  switch (delta.op) {
    case 'create': {
      if (!delta.name || !delta.position) {
        return err({ kind: 'InvalidOperationError', reason: 'Class create requires name and position' });
      }
      if (isDuplicateClassName(diagram, delta.name)) {
        return err({ kind: 'DuplicateClassError', className: delta.name, classId: delta.classId });
      }
      const newClass = ClassSchema.parse({
        id: delta.classId,
        name: delta.name,
        position: delta.position,
        attributes: [],
        methods: [],
        // Unidad 12.1: tipo de clasificador opcional en create (por defecto 'class').
        ...(delta.classKind !== undefined ? { kind: delta.classKind } : {}),
      });
      return ok({ ...diagram, classes: [...diagram.classes, newClass] });
    }

    case 'rename': {
      if (!delta.newName) {
        return err({ kind: 'InvalidOperationError', reason: 'Class rename requires newName' });
      }
      const classIndex = diagram.classes.findIndex(c => c.id === delta.classId);
      if (classIndex === -1) {
        return err({ kind: 'ClassNotFoundError', classId: delta.classId });
      }
      if (isDuplicateClassName(diagram, delta.newName, delta.classId)) {
        return err({ kind: 'DuplicateClassError', className: delta.newName, classId: delta.classId });
      }
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = { ...updatedClasses[classIndex], name: delta.newName };
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'reposition': {
      if (!delta.newPosition) {
        return err({ kind: 'InvalidOperationError', reason: 'Class reposition requires newPosition' });
      }
      const classIndex = diagram.classes.findIndex(c => c.id === delta.classId);
      if (classIndex === -1) {
        return err({ kind: 'ClassNotFoundError', classId: delta.classId });
      }
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = { ...updatedClasses[classIndex], position: delta.newPosition };
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'update': {
      // Unidad 12.1/12.4 — alternar tipo de clasificador y/o marcado abstracto.
      if (delta.classKind === undefined && delta.isAbstract === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Class update requires classKind or isAbstract' });
      }
      const classIndex = diagram.classes.findIndex(c => c.id === delta.classId);
      if (classIndex === -1) {
        return err({ kind: 'ClassNotFoundError', classId: delta.classId });
      }
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = ClassSchema.parse({
        ...updatedClasses[classIndex],
        ...(delta.classKind !== undefined ? { kind: delta.classKind } : {}),
        ...(delta.isAbstract !== undefined ? { isAbstract: delta.isAbstract } : {}),
      });
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'delete': {
      const classIndex = diagram.classes.findIndex(c => c.id === delta.classId);
      if (classIndex === -1) {
        return err({ kind: 'ClassNotFoundError', classId: delta.classId });
      }
      // Eliminar la clase
      const updatedClasses = diagram.classes.filter(c => c.id !== delta.classId);
      // Eliminación en cascada de asociaciones, generalizaciones, realizaciones,
      // dependencias y asociaciones n-arias
      let updatedDiagram = { ...diagram, classes: updatedClasses };
      updatedDiagram = cascadeDeleteAssociations(updatedDiagram, delta.classId);
      updatedDiagram = cascadeDeleteGeneralizations(updatedDiagram, delta.classId);
      updatedDiagram = cascadeDeleteRealizations(updatedDiagram, delta.classId);
      updatedDiagram = cascadeDeleteDependencies(updatedDiagram, delta.classId);
      updatedDiagram = cascadeDeleteNaryAssociations(updatedDiagram, delta.classId);
      return ok(updatedDiagram);
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown class op: ${_exhaustive}` });
    }
  }
}

