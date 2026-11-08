import type { Attribute, Class } from '@app/core';
import { normalizeJavaIdentifier } from '../sanitize.js';
import type {
  CodegenWarning,
  EntityFieldModel,
  EntityMethodModel,
  InterfaceMethodModel,
} from '../types.js';
import {
  defaultReturnValue,
  extractAttributeNameAndType,
  fieldModifierFor,
  mapAttributeType,
  classifyMultiplicity,
} from '../type-mapper.js';

/** Mapea los atributos de una clase a campos de entidad Java, resolviendo nombres duplicados y normalizando. */
export function mapFieldsForClass(
  cls: Class,
  warnings: CodegenWarning[],
): EntityFieldModel[] {
  const usedFieldNames = new Set<string>(['id']);
  const fields: EntityFieldModel[] = [];
  for (const a of cls.attributes) {
    const { name: parsedName } = extractAttributeNameAndType(a.name, a.type);
    const candidateName = normalizeJavaIdentifier(parsedName, 'camel');
    if (candidateName === 'id') {
      warnings.push({
        code: 'id-attribute-primary-key',
        message: `Attribute "${a.name}" on ${cls.name} coincides with the synthetic JPA primary key; mapped to @Id Long id`,
        element: `${cls.name}.${a.name}`,
      });
      continue;
    }
    fields.push(mapField(cls, a, warnings, usedFieldNames));
  }
  return fields;
}

export function mapField(
  cls: Class,
  attribute: Attribute,
  warnings: CodegenWarning[],
  usedFieldNames?: Set<string>,
): EntityFieldModel {
  const { name: parsedName, type: effectiveType } = extractAttributeNameAndType(attribute.name, attribute.type);
  let name = normalizeJavaIdentifier(parsedName, 'camel');
  if (name !== attribute.name) {
    warnings.push({
      code: 'normalized-identifier',
      message: `Attribute name "${attribute.name}" on ${cls.name} was normalized to "${name}"`,
      element: `${cls.name}.${attribute.name}`,
    });
  }
  if (usedFieldNames) {
    if (usedFieldNames.has(name)) {
      let suffix = 2;
      while (usedFieldNames.has(`${name}${suffix}`)) {
        suffix++;
      }
      name = `${name}${suffix}`;
      warnings.push({
        code: 'duplicate-identifier-disambiguated',
        message: `Attribute name "${attribute.name}" on ${cls.name} disambiguated to "${name}"`,
        element: `${cls.name}.${attribute.name}`,
      });
    }
    usedFieldNames.add(name);
  }
  const { javaType, mapped } = mapAttributeType(effectiveType || attribute.type);
  if (!mapped) {
    warnings.push({
      code: 'unmapped-type',
      message: `Attribute type "${effectiveType || attribute.type}" on ${cls.name}.${attribute.name} has no mapping; falling back to String`,
      element: `${cls.name}.${attribute.name}`,
    });
  }
  return {
    name,
    javaType,
    declaredType: effectiveType || attribute.type,
    visibility: attribute.visibility,
    isStatic: attribute.isStatic,
    isDerived: attribute.isDerived,
    multiplicity: attribute.multiplicity ?? null,
    fieldModifier: fieldModifierFor(attribute.visibility),
    isCollection: classifyMultiplicity(attribute.multiplicity) === 'many',
  };
}

/** Mapea una operación de interfaz a la firma de un método Java. */
export function mapInterfaceMethod(
  cls: Class,
  method: Class['methods'][number],
  warnings: CodegenWarning[],
): InterfaceMethodModel {
  const ret = mapAttributeType(method.returnType);
  if (!ret.mapped) {
    warnings.push({
      code: 'unmapped-type',
      message: `Return type "${method.returnType}" on ${cls.name}.${method.name}() has no mapping; falling back to String`,
      element: `${cls.name}.${method.name}()`,
    });
  }
  const methodName = normalizeJavaIdentifier(method.name, 'camel');
  if (methodName !== method.name) {
    warnings.push({
      code: 'normalized-identifier',
      message: `Method name "${method.name}" on ${cls.name} was normalized to "${methodName}"`,
      element: `${cls.name}.${method.name}()`,
    });
  }
  const parameters = method.parameters.map((p) => {
    const mapped = mapAttributeType(p.type);
    if (!mapped.mapped) {
      warnings.push({
        code: 'unmapped-type',
        message: `Parameter type "${p.type}" on ${cls.name}.${method.name}(${p.name}) has no mapping; falling back to String`,
        element: `${cls.name}.${method.name}(${p.name})`,
      });
    }
    const paramName = normalizeJavaIdentifier(p.name, 'camel');
    if (paramName !== p.name) {
      warnings.push({
        code: 'normalized-identifier',
        message: `Parameter name "${p.name}" on ${cls.name}.${method.name} was normalized to "${paramName}"`,
        element: `${cls.name}.${method.name}(${p.name})`,
      });
    }
    return { name: paramName, type: mapped.javaType };
  });
  return {
    name: methodName,
    returnType: ret.javaType,
    parameters,
  };
}

/** Mapea una operación UML a un método Java de entidad con cuerpo stub y anotación @Override si procede. */
export function mapEntityMethod(
  cls: Class,
  method: Class['methods'][number],
  warnings: CodegenWarning[],
  isOverride = false,
): EntityMethodModel {
  const ifaceMethod = mapInterfaceMethod(cls, method, warnings);
  return {
    ...ifaceMethod,
    isOverride,
    defaultReturnValue: defaultReturnValue(ifaceMethod.returnType),
  };
}
