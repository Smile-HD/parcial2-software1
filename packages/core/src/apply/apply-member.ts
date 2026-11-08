import { type Diagram, AttributeSchema, MethodSchema } from '../ir.js';
import { type MemberDelta } from '../delta.js';
import { type ApplyResult, ok, err } from './types.js';
import { isDuplicateMemberName } from './cascade.js';

/**
 * Aplica un único delta de miembro (atributo o método).
 */
export function applyMemberDelta(diagram: Diagram, delta: MemberDelta): ApplyResult<Diagram> {
  const classIndex = diagram.classes.findIndex(c => c.id === delta.classId);
  if (classIndex === -1) {
    return err({ kind: 'ClassNotFoundError', classId: delta.classId });
  }
  const classObj = diagram.classes[classIndex];

  switch (delta.op) {
    case 'addAttribute': {
      if (!delta.name || !delta.type) {
        return err({ kind: 'InvalidOperationError', reason: 'Add attribute requires name and type' });
      }
      if (isDuplicateMemberName(classObj, delta.name)) {
        return err({ kind: 'DuplicateMemberError', memberName: delta.name, classId: delta.classId });
      }
      const newAttribute = AttributeSchema.parse({
        id: delta.memberId,
        name: delta.name,
        type: delta.type,
        ...(delta.visibility !== undefined ? { visibility: delta.visibility } : {}),
        ...(delta.isStatic !== undefined ? { isStatic: delta.isStatic } : {}),
        ...(delta.isDerived !== undefined ? { isDerived: delta.isDerived } : {}),
        ...(delta.multiplicity !== undefined ? { multiplicity: delta.multiplicity } : {}),
      });
      const updatedClass = {
        ...classObj,
        attributes: [...classObj.attributes, newAttribute],
      };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'editAttribute': {
      if (!delta.name || !delta.type) {
        return err({ kind: 'InvalidOperationError', reason: 'Edit attribute requires name and type' });
      }
      const attrIndex = classObj.attributes.findIndex(a => a.id === delta.memberId);
      if (attrIndex === -1) {
        return err({ kind: 'MemberNotFoundError', memberId: delta.memberId, classId: delta.classId });
      }
      if (isDuplicateMemberName(classObj, delta.name, delta.memberId)) {
        return err({ kind: 'DuplicateMemberError', memberName: delta.name, classId: delta.classId });
      }
      const updatedAttributes = [...classObj.attributes];
      updatedAttributes[attrIndex] = AttributeSchema.parse({
        ...updatedAttributes[attrIndex],
        name: delta.name,
        type: delta.type,
        ...(delta.visibility !== undefined ? { visibility: delta.visibility } : {}),
        ...(delta.isStatic !== undefined ? { isStatic: delta.isStatic } : {}),
        ...(delta.isDerived !== undefined ? { isDerived: delta.isDerived } : {}),
        ...(delta.multiplicity !== undefined ? { multiplicity: delta.multiplicity } : {}),
      });
      const updatedClass = { ...classObj, attributes: updatedAttributes };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'deleteAttribute': {
      const attrIndex = classObj.attributes.findIndex(a => a.id === delta.memberId);
      if (attrIndex === -1) {
        return err({ kind: 'MemberNotFoundError', memberId: delta.memberId, classId: delta.classId });
      }
      const updatedAttributes = classObj.attributes.filter(a => a.id !== delta.memberId);
      const updatedClass = { ...classObj, attributes: updatedAttributes };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'addMethod': {
      if (!delta.name || !delta.returnType || delta.parameters === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Add method requires name, returnType, and parameters' });
      }
      if (isDuplicateMemberName(classObj, delta.name)) {
        return err({ kind: 'DuplicateMemberError', memberName: delta.name, classId: delta.classId });
      }
      const newMethod = MethodSchema.parse({
        id: delta.memberId,
        name: delta.name,
        returnType: delta.returnType,
        parameters: delta.parameters,
        ...(delta.visibility !== undefined ? { visibility: delta.visibility } : {}),
        ...(delta.isStatic !== undefined ? { isStatic: delta.isStatic } : {}),
      });
      const updatedClass = {
        ...classObj,
        methods: [...classObj.methods, newMethod],
      };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'editMethod': {
      if (!delta.name || !delta.returnType || delta.parameters === undefined) {
        return err({ kind: 'InvalidOperationError', reason: 'Edit method requires name, returnType, and parameters' });
      }
      const methodIndex = classObj.methods.findIndex(m => m.id === delta.memberId);
      if (methodIndex === -1) {
        return err({ kind: 'MemberNotFoundError', memberId: delta.memberId, classId: delta.classId });
      }
      if (isDuplicateMemberName(classObj, delta.name, delta.memberId)) {
        return err({ kind: 'DuplicateMemberError', memberName: delta.name, classId: delta.classId });
      }
      const updatedMethods = [...classObj.methods];
      updatedMethods[methodIndex] = MethodSchema.parse({
        ...updatedMethods[methodIndex],
        name: delta.name,
        returnType: delta.returnType,
        parameters: delta.parameters,
        ...(delta.visibility !== undefined ? { visibility: delta.visibility } : {}),
        ...(delta.isStatic !== undefined ? { isStatic: delta.isStatic } : {}),
      });
      const updatedClass = { ...classObj, methods: updatedMethods };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    case 'deleteMethod': {
      const methodIndex = classObj.methods.findIndex(m => m.id === delta.memberId);
      if (methodIndex === -1) {
        return err({ kind: 'MemberNotFoundError', memberId: delta.memberId, classId: delta.classId });
      }
      const updatedMethods = classObj.methods.filter(m => m.id !== delta.memberId);
      const updatedClass = { ...classObj, methods: updatedMethods };
      const updatedClasses = [...diagram.classes];
      updatedClasses[classIndex] = updatedClass;
      return ok({ ...diagram, classes: updatedClasses });
    }

    default: {
      const _exhaustive: never = delta.op;
      return err({ kind: 'InvalidOperationError', reason: `Unknown member op: ${_exhaustive}` });
    }
  }
}

