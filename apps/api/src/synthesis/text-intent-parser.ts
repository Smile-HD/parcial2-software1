import type { SemanticDomainModel } from './delta-generator.js';
import {
  normalizeUmlSpanish,
  parseCreateClassCommand,
  parseClassRenameCommand,
  parseClassKindOrAbstractCommand,
  parseDeleteCommands,
  parseFastMemberCommands,
  parseFullMemberCommands,
  parseMultiplicityOrRoleCommands,
  parseAssociationClassCommands,
  parseNaryAssociationCommands,
  parseRelationInvertCommands,
  parseRelationChangeCommands,
} from './parser/index.js';

export * from './parser/index.js';

/**
 * Extrae mutaciones explícitas de relaciones y clases solicitadas por el usuario o formuladas en el chat.
 * Orquesta sub-parsers especializados para comandos de clases, miembros, relaciones y eliminaciones.
 */
export function extractExplicitModelMutations(text: string, currentDiagram?: any): SemanticDomainModel | null {
  if (!text || !currentDiagram) return null;

  const { cleanedText, normalized } = normalizeUmlSpanish(text);
  const classes: Array<{ id: string; name: string }> = currentDiagram.classes || [];
  const associations: Array<any> = currentDiagram.associations || [];

  // 0. Creación de nueva clase con atributos/asociación
  const createdClass = parseCreateClassCommand(cleanedText, text, normalized);
  if (createdClass) return createdClass;

  // 0b - 0e. Comandos rápidos de miembros (agregar atributo, cambiar tipo, renombrar, agregar método)
  const fastMember = parseFastMemberCommands(cleanedText, text, currentDiagram, classes);
  if (fastMember) return fastMember;

  // 1. Borrado determinista (clases, relaciones, atributos, métodos, desvinculación)
  const deletion = parseDeleteCommands(cleanedText, text, normalized, currentDiagram, classes, associations);
  if (deletion) return deletion;

  // 2. Renombrado de clase
  const renameClass = parseClassRenameCommand(text, classes);
  if (renameClass) return renameClass;

  // 3. Mutación de clase a abstracta o interfaz
  const classMod = parseClassKindOrAbstractCommand(text, normalized, classes);
  if (classMod) return classMod;

  // 3a y 3b. Modificación o agregado completo de métodos y atributos
  const fullMember = parseFullMemberCommands(text, normalized, currentDiagram, classes);
  if (fullMember) return fullMember;

  // 3c. Mutación de multiplicidades y roles en relaciones
  const multOrRole = parseMultiplicityOrRoleCommands(text, normalized, classes, associations);
  if (multOrRole) return multOrRole;

  // 3d. Clase de asociación / tabla intermedia
  const assocClass = parseAssociationClassCommands(text, normalized, classes, associations);
  if (assocClass) return assocClass;

  // 3e. Asociación N-aria
  const nary = parseNaryAssociationCommands(text, normalized, classes);
  if (nary) return nary;

  // 3d / inversión. Inversión de rombo, dirección o multiplicidad
  const invert = parseRelationInvertCommands(normalized, currentDiagram, classes, associations);
  if (invert) return invert;

  // 4. Mutación general de tipo de relación (asociación, agregación, composición, herencia, etc.)
  const relationChange = parseRelationChangeCommands(text, normalized, currentDiagram, classes, associations);
  if (relationChange) return relationChange;

  return null;
}
