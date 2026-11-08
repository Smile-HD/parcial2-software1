import type { Association, Diagram } from '@app/core';
import type {
  ClassInfo,
  CodegenWarning,
  EntityModel,
  RelationshipKind,
} from '../types.js';
import { inverseKind, resolvePair } from '../type-mapper.js';
import { mapEntityMethod } from './members.js';

/** Determina si un método ya está cubierto por los accessors generados automáticamente (getId/setId, campos o relaciones). */
export function isAccessorAlreadyGenerated(
  entity: EntityModel,
  methodName: string,
  parameters: { name: string; type: string }[],
): boolean {
  const normMethod = methodName.toLowerCase();

  // 1. Acceso a clave primaria sintética getId / setId (siempre generados en la raíz)
  if (normMethod === 'getid' && parameters.length === 0) return true;
  if (
    normMethod === 'setid' &&
    parameters.length === 1 &&
    (parameters[0].type === 'Long' ||
      parameters[0].type === 'long' ||
      parameters[0].type === 'Integer' ||
      parameters[0].type === 'int')
  ) {
    return true;
  }

  // 2. Getters / Setters generados para campos básicos
  for (const field of entity.fields) {
    const normField = field.name.toLowerCase();
    if (parameters.length === 0) {
      if (normMethod === `get${normField}`) return true;
      if (field.javaType === 'Boolean' && normMethod === `is${normField}`) return true;
    }
    if (parameters.length === 1) {
      if (normMethod === `set${normField}`) return true;
    }
  }

  // 3. Getters / Setters generados para relaciones
  for (const rel of entity.relationships) {
    const singular = rel.targetEntity.toLowerCase();
    const plural = (rel.targetEntity + 's').toLowerCase();
    if (parameters.length === 0) {
      if (normMethod === `get${singular}` || normMethod === `get${plural}`) return true;
    }
    if (parameters.length === 1) {
      if (normMethod === `set${singular}` || normMethod === `set${plural}`) return true;
    }
  }

  return false;
}

export function attachRelationship(
  assoc: Association,
  classInfo: Map<string, ClassInfo>,
  entities: Map<string, EntityModel>,
  warnings: CodegenWarning[],
): void {
  const source = classInfo.get(assoc.sourceClassId);
  const target = classInfo.get(assoc.targetClassId);

  if (!source || !target) {
    const missingId = !source ? assoc.sourceClassId : assoc.targetClassId;
    warnings.push({
      code: 'missing-endpoint',
      message: `Association ${assoc.id} references class ${missingId} which is absent from the model; skipped`,
      element: assoc.id,
    });
    return;
  }

  if (!source.isEntity || !target.isEntity) {
    const iface = !source.isEntity ? source : target;
    warnings.push({
      code: 'interface-endpoint-skipped',
      message: `Association ${assoc.id} touches interface ${iface.javaName}; JPA relationships to interfaces are not generated; skipped`,
      element: assoc.id,
    });
    return;
  }

  const pair = resolvePair(assoc.sourceMultiplicity, assoc.targetMultiplicity);
  if (!pair) {
    warnings.push({
      code: 'unmapped-multiplicity',
      message: `Association ${assoc.id} multiplicities (${assoc.sourceMultiplicity ?? 'unset'}..${assoc.targetMultiplicity ?? 'unset'}) have no JPA mapping; skipped`,
      element: assoc.id,
    });
    return;
  }

  const sourceEntity = entities.get(source.javaName);
  const targetEntity = entities.get(target.javaName);
  if (!sourceEntity || !targetEntity) return;

  const isComposite = assoc.aggregation === 'composite';
  const sourceIsContainer = isComposite && assoc.aggregationEnd === 'source';
  const targetIsContainer = isComposite && assoc.aggregationEnd === 'target';

  // Soporte para Clase de Asociación: si la asociación está vinculada a una clase de asociación,
  // la entidad intermedia posee dos @ManyToOne (hacia source y target), y los extremos poseen @OneToMany hacia ella.
  if (assoc.associationClassId) {
    const assocClassInfo = classInfo.get(assoc.associationClassId);
    if (assocClassInfo && assocClassInfo.isEntity) {
      const assocEntity = entities.get(assocClassInfo.javaName);
      if (assocEntity) {
        assocEntity.relationships.push({
          associationId: `${assoc.id}-src`,
          targetEntity: source.javaName,
          kind: 'ManyToOne',
          owningSide: 'target',
          thisSideIsOwning: true,
          sourceMultiplicity: null,
          targetMultiplicity: '1',
          cascade: false,
          orphanRemoval: false,
        });
        assocEntity.relationships.push({
          associationId: `${assoc.id}-tgt`,
          targetEntity: target.javaName,
          kind: 'ManyToOne',
          owningSide: 'target',
          thisSideIsOwning: true,
          sourceMultiplicity: null,
          targetMultiplicity: '1',
          cascade: false,
          orphanRemoval: false,
        });

        sourceEntity.relationships.push({
          associationId: `${assoc.id}-src`,
          targetEntity: assocClassInfo.javaName,
          kind: 'OneToMany',
          owningSide: 'target',
          thisSideIsOwning: false,
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
          cascade: sourceIsContainer,
          orphanRemoval: sourceIsContainer,
        });

        targetEntity.relationships.push({
          associationId: `${assoc.id}-tgt`,
          targetEntity: assocClassInfo.javaName,
          kind: 'OneToMany',
          owningSide: 'target',
          thisSideIsOwning: false,
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
          cascade: targetIsContainer,
          orphanRemoval: targetIsContainer,
        });

        return;
      }
    }
  }

  let sourceKind = pair.kind;
  let targetKind = inverseKind(pair.kind);

  if (isComposite) {
    if (sourceIsContainer && sourceKind === 'ManyToMany') {
      sourceKind = 'OneToMany';
      targetKind = 'ManyToOne';
    } else if (targetIsContainer && targetKind === 'ManyToMany') {
      targetKind = 'OneToMany';
      sourceKind = 'ManyToOne';
    }
  }

  const sourceOrphanRemoval = (sourceKind === 'OneToMany' || sourceKind === 'OneToOne') && sourceIsContainer;
  const targetOrphanRemoval = (targetKind === 'OneToMany' || targetKind === 'OneToOne') && targetIsContainer;

  sourceEntity.relationships.push({
    associationId: assoc.id,
    targetEntity: target.javaName,
    kind: sourceKind,
    owningSide: sourceKind === 'OneToMany' ? 'target' : (sourceKind === 'ManyToOne' ? 'source' : pair.owningSide),
    thisSideIsOwning: sourceKind === 'ManyToOne' || (sourceKind === 'OneToOne' && pair.sourceOwning),
    sourceMultiplicity: assoc.sourceMultiplicity ?? null,
    targetMultiplicity: assoc.targetMultiplicity ?? null,
    cascade: sourceIsContainer,
    orphanRemoval: sourceOrphanRemoval,
  });
  targetEntity.relationships.push({
    associationId: assoc.id,
    targetEntity: source.javaName,
    kind: targetKind,
    owningSide: targetKind === 'OneToMany' ? 'target' : (targetKind === 'ManyToOne' ? 'source' : pair.owningSide),
    thisSideIsOwning: targetKind === 'ManyToOne' || (targetKind === 'OneToOne' && pair.targetOwning),
    sourceMultiplicity: assoc.sourceMultiplicity ?? null,
    targetMultiplicity: assoc.targetMultiplicity ?? null,
    cascade: targetIsContainer,
    orphanRemoval: targetOrphanRemoval,
  });
}

export function applyGeneralizations(
  diagram: Diagram,
  classInfo: Map<string, ClassInfo>,
  entities: Map<string, EntityModel>,
  warnings: CodegenWarning[],
): void {
  const superIds = new Set<string>();
  for (const gen of diagram.generalizations) {
    const sub = classInfo.get(gen.subClassId);
    const sup = classInfo.get(gen.superClassId);
    if (!sub || !sup) {
      warnings.push({
        code: 'missing-endpoint',
        message: `Generalization ${gen.id} references an absent class; skipped`,
        element: gen.id,
      });
      continue;
    }
    if (sup.isInterface) {
      warnings.push({
        code: 'generalization-to-interface',
        message: `Generalization ${gen.id}: ${sub.javaName} cannot extend interface ${sup.javaName} (use realization); skipped`,
        element: gen.id,
      });
      continue;
    }
    const subEntity = entities.get(sub.javaName);
    const supEntity = entities.get(sup.javaName);
    if (!subEntity || !supEntity) continue;
    if (subEntity.extendsClass !== null) {
      warnings.push({
        code: 'multiple-generalization',
        message: `Class ${sub.javaName} already extends ${subEntity.extendsClass}; generalization ${gen.id} (second superclass) is unmappable in Java; skipped`,
        element: gen.id,
      });
      continue;
    }
    subEntity.extendsClass = sup.javaName;
    superIds.add(sup.javaName);
  }
  for (const name of superIds) {
    const entity = entities.get(name);
    if (!entity) continue;
    if (entity.extendsClass === null) entity.inheritanceRoot = true;
    if (entity.isAbstract && entity.inheritanceRoot) {
      warnings.push({
        code: 'abstract-inheritance-root-table',
        message: `Abstract class ${name} is an inheritance root; the SINGLE_TABLE strategy needs a table for it (generated as @Entity abstract root)`,
        element: name,
      });
    }
  }
}

export function applyRealizations(
  diagram: Diagram,
  classInfo: Map<string, ClassInfo>,
  entities: Map<string, EntityModel>,
  warnings: CodegenWarning[],
): void {
  for (const real of diagram.realizations) {
    const client = classInfo.get(real.clientClassId);
    const supplier = classInfo.get(real.supplierInterfaceId);
    if (!client || !supplier) {
      warnings.push({
        code: 'missing-endpoint',
        message: `Realization ${real.id} references an absent classifier; skipped`,
        element: real.id,
      });
      continue;
    }
    if (!supplier.isInterface) {
      warnings.push({
        code: 'realization-supplier-not-interface',
        message: `Realization ${real.id}: supplier ${supplier.javaName} is not an interface; skipped`,
        element: real.id,
      });
      continue;
    }
    if (!client.isEntity) {
      warnings.push({
        code: 'realization-client-not-class',
        message: `Realization ${real.id}: client ${client.javaName} is an interface (use generalization/extends); skipped`,
        element: real.id,
      });
      continue;
    }
    const entity = entities.get(client.javaName);
    if (!entity) continue;
    if (!entity.implementsInterfaces.includes(supplier.javaName)) {
      entity.implementsInterfaces.push(supplier.javaName);
    }

    const ifaceCls = diagram.classes.find((c) => c.id === real.supplierInterfaceId);
    if (ifaceCls && ifaceCls.methods.length > 0) {
      for (const m of ifaceCls.methods) {
        const mappedMethod = mapEntityMethod(ifaceCls, m, warnings, true);

        if (isAccessorAlreadyGenerated(entity, mappedMethod.name, mappedMethod.parameters)) {
          continue;
        }

        const existingMethod = entity.methods.find(
          (em) =>
            em.name.toLowerCase() === mappedMethod.name.toLowerCase() &&
            em.parameters.length === mappedMethod.parameters.length &&
            em.parameters.every((p, idx) => p.type.toLowerCase() === mappedMethod.parameters[idx].type.toLowerCase())
        );

        if (existingMethod) {
          existingMethod.isOverride = true;
        } else {
          entity.methods.push(mappedMethod);
        }
      }
    }
  }
}

export function buildNaryJoinEntities(
  diagram: Diagram,
  classInfo: Map<string, ClassInfo>,
  entities: Map<string, EntityModel>,
  warnings: CodegenWarning[],
  basePackage: string,
): void {
  for (const nary of diagram.naryAssociations) {
    if (nary.memberEnds.length < 3) {
      warnings.push({
        code: 'nary-insufficient-ends',
        message: `N-ary association ${nary.id} has ${nary.memberEnds.length} ends (needs ≥3); skipped`,
        element: nary.id,
      });
      continue;
    }

    const members: { info: ClassInfo; multiplicity: string }[] = [];
    let blocked = false;
    for (const end of nary.memberEnds) {
      const info = classInfo.get(end.classId);
      if (!info) {
        warnings.push({
          code: 'missing-endpoint',
          message: `N-ary association ${nary.id} references absent class ${end.classId}; skipped`,
          element: nary.id,
        });
        blocked = true;
        break;
      }
      if (info.isInterface) {
        warnings.push({
          code: 'nary-interface-member',
          message: `N-ary association ${nary.id} has interface member ${info.javaName}; @ManyToOne to an interface is unmappable; skipped`,
          element: nary.id,
        });
        blocked = true;
        break;
      }
      members.push({ info, multiplicity: end.multiplicity });
    }
    if (blocked) continue;

    const names = members.map((m) => m.info.javaName);
    if (new Set(names).size !== names.length) {
      warnings.push({
        code: 'nary-duplicate-member',
        message: `N-ary association ${nary.id} repeats a member class; a join entity with duplicate fields is unmappable; skipped`,
        element: nary.id,
      });
      continue;
    }

    const joinName = [...names].sort().join('') + 'Link';
    if (entities.has(joinName)) {
      warnings.push({
        code: 'nary-join-name-collision',
        message: `N-ary join entity name ${joinName} collides with an existing class; skipped (rename a member or the association)`,
        element: nary.id,
      });
      continue;
    }

    const join: EntityModel = {
      className: joinName,
      packageName: basePackage,
      fields: [],
      relationships: [...names].sort().map((targetEntity) => ({
        associationId: nary.id,
        targetEntity,
        kind: 'ManyToOne' as RelationshipKind,
        owningSide: 'source' as const,
        thisSideIsOwning: true,
        sourceMultiplicity: '0..*' as string | null,
        targetMultiplicity: '1' as string | null,
        cascade: false,
        orphanRemoval: false,
      })),
      isAbstract: false,
      extendsClass: null,
      inheritanceRoot: false,
      implementsInterfaces: [],
      methods: [],
    };
    entities.set(joinName, join);
  }
}
