export interface DomainAttribute {
  name: string;
  type: string;
  description?: string;
}

export interface DomainClass {
  name: string;
  isInterface?: boolean;
  isAbstract?: boolean;
  attributes: DomainAttribute[];
  methods?: Array<{ name: string; returnType: string }>;
}

export interface DomainRelationship {
  source: string;
  target: string;
  type: 'association' | 'composition' | 'aggregation' | 'generalization';
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  associationClass?: string;
  label?: string;
}

export interface CanonicalDomainModel {
  id: string;
  title: string;
  category: string;
  keywords: {
    es: string[];
    en: string[];
  };
  classes: DomainClass[];
  relationships: DomainRelationship[];
}

export interface DomainMatchResult {
  domain: CanonicalDomainModel;
  score: number;
  matchedKeywords: string[];
}
