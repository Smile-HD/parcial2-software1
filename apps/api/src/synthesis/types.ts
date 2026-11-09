/**
 * Tipos e interfaces semánticas para el metamodelo de síntesis UML.
 */
export interface SemanticAttribute {
  name: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
}

export interface SemanticMethod {
  name: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticClass {
  name: string;
  isInterface?: boolean;
  isAbstract?: boolean;
  attributes?: SemanticAttribute[];
  methods?: SemanticMethod[];
}

export interface SemanticAssociation {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  associationClass?: string | null;
  directed?: boolean;
  sourceRole?: string;
  targetRole?: string;
}

export interface SemanticGeneralization {
  subclass: string;
  superclass: string;
  name?: string;
}

export interface SemanticRealization {
  clientClass: string;
  supplierInterface: string;
  name?: string;
}

export interface SemanticDependency {
  client: string;
  supplier: string;
  name?: string;
}

export interface SemanticNaryAssociation {
  name?: string;
  members: Array<{
    class: string;
    multiplicity?: string;
    role?: string;
  }>;
}

export interface SemanticRenames {
  classes?: Array<{ from: string; to: string }>;
  attributes?: Array<{ class: string; from: string; to: string }>;
  methods?: Array<{ class: string; from: string; to: string }>;
}

export interface SemanticClassUpdate {
  name: string;
  classKind?: 'class' | 'interface';
  isAbstract?: boolean;
}

export interface SemanticAttributeUpdate {
  class: string;
  name: string;
  newName?: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
  multiplicity?: string;
}

export interface SemanticMethodUpdate {
  class: string;
  name: string;
  newName?: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticAssociationUpdate {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  sourceRole?: string;
  targetRole?: string;
  associationClass?: string | null;
}

export interface SemanticGeneralizationUpdate {
  subclass: string;
  superclass: string;
  name: string;
}

export interface SemanticRealizationUpdate {
  clientClass: string;
  supplierInterface: string;
  name: string;
}

export interface SemanticDependencyUpdate {
  client: string;
  supplier: string;
  name: string;
}

export interface SemanticNaryAssociationUpdate {
  name?: string;
  naryAssociationId?: string;
  memberEnds?: Array<{ class: string; multiplicity?: string; role?: string }>;
}

export interface SemanticReposition {
  class: string;
  x: number;
  y: number;
}

export interface SemanticUpdates {
  classes?: SemanticClassUpdate[];
  attributes?: SemanticAttributeUpdate[];
  methods?: SemanticMethodUpdate[];
  associations?: SemanticAssociationUpdate[];
  generalizations?: SemanticGeneralizationUpdate[];
  realizations?: SemanticRealizationUpdate[];
  dependencies?: SemanticDependencyUpdate[];
  naryAssociations?: SemanticNaryAssociationUpdate[];
  positions?: SemanticReposition[];
}

export interface SemanticDeletions {
  classes?: string[];
  attributes?: Array<{ class: string; attribute: string }>;
  methods?: Array<{ class: string; method: string }>;
  associations?: Array<{ source: string; target: string }>;
  generalizations?: Array<{ subclass: string; superclass: string }>;
  realizations?: Array<{ clientClass: string; supplierInterface: string }>;
  dependencies?: Array<{ client: string; supplier: string }>;
  naryAssociations?: string[];
}

export interface SemanticDomainModel {
  action?: 'create' | 'modify' | 'delete';
  classes?: SemanticClass[];
  associations?: SemanticAssociation[];
  generalizations?: SemanticGeneralization[];
  realizations?: SemanticRealization[];
  dependencies?: SemanticDependency[];
  naryAssociations?: SemanticNaryAssociation[];
  renames?: SemanticRenames;
  updates?: SemanticUpdates;
  deletions?: SemanticDeletions;
}
