import { normalizeUmlUtterance } from '@app/adapters-ai';

/**
 * Normaliza expresiones en español, modismos coloquiales y errores tipográficos comunes en UML.
 */
export function normalizeUmlSpanish(text: string): { cleanedText: string; normalized: string } {
  const cleanedText = normalizeUmlUtterance(text);
  const normalized = cleanedText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bcomposision\b/g, 'composicion')
    .replace(/\bgeneralizasion\b/g, 'generalizacion')
    .replace(/\bagregasion\b/g, 'agregacion')
    .replace(/\brealizasion\b/g, 'realizacion')
    .replace(/\brelasion\b/g, 'relacion')
    .replace(/\basosia\b/g, 'asocia')
    .replace(/\b(asisetncia|asistensia)\b/g, 'asistencia')
    .replace(/\balunmo\b/g, 'alumno')
    .replace(/\bnodo\s+de\s+relaci[oó]n\b/gi, 'relacion');

  return { cleanedText, normalized };
}
