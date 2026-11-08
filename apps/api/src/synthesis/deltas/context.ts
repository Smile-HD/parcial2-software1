/**
 * Contexto de ejecución para la generación y acumulación de deltas UML.
 * Agrupa las tablas de símbolos en memoria y estructuras auxiliares para la resolución determinista de IDs.
 */
import type { SemanticDomainModel } from '../types.js';

export interface DeltaExpansionContext {
  diagramId: string;
  timestamp: string;
  deltas: any[];
  classIdMap: Map<string, string>;
  existingClassesMap: Map<string, any>;
  seenConnectedPairs: Set<string>;
  resolveClassId: (name: string) => string | undefined;
  getPairKey: (idA: string, idB: string) => string;
  currentDiagram?: any;
  originText?: string;
}
