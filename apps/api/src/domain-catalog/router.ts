import { getDomainIndex, getDomainSchema } from './loader.js';
import type { CanonicalDomainModel, DomainMatchResult } from './types.js';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Enrutador léxico en memoria (< 1 ms).
 * Evalúa tokens y sinónimos en español e inglés contra el catálogo canónico (usando lazy loading).
 */
export function matchCanonicalDomain(query: string, threshold = 0.35): DomainMatchResult | null {
  if (!query || query.trim().length === 0) {
    return null;
  }

  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery
    .split(/[\s,.;:!?¿¡\/\-_()]+/)
    .filter((t) => t.length > 2);

  if (queryTokens.length === 0) {
    return null;
  }

  const index = getDomainIndex();
  let bestMatch: { id: string; score: number; matchedKeywords: string[] } | null = null;
  let highestScore = 0;

  for (const item of index) {
    const allKeywords = [
      ...item.keywords.es.map(normalize),
      ...item.keywords.en.map(normalize),
    ];
    let score = 0;
    const matched: string[] = [];

    // 1. Coincidencia de frases completas en la query
    for (const kw of allKeywords) {
      if (normalizedQuery.includes(kw)) {
        score += kw.includes(' ') ? 1.5 : 1.0;
        matched.push(kw);
      }
    }

    // 2. Coincidencia token a token con prefijo o raíz
    for (const token of queryTokens) {
      for (const kw of allKeywords) {
        if (!matched.includes(kw)) {
          if (kw === token) {
            score += 1.0;
            matched.push(kw);
          } else if (kw.length >= 4 && token.length >= 4) {
            if (kw.startsWith(token) || token.startsWith(kw)) {
              score += 0.6;
              matched.push(kw);
            }
          }
        }
      }
    }

    // Normalizar score por relevancia
    const normalizedScore = score > 0 ? Math.min(score / 2.0, 1.0) : 0;

    if (normalizedScore >= threshold && normalizedScore > highestScore) {
      highestScore = normalizedScore;
      bestMatch = {
        id: item.id,
        score: normalizedScore,
        matchedKeywords: Array.from(new Set(matched)),
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  const domain = getDomainSchema(bestMatch.id);
  if (!domain) {
    return null;
  }

  return {
    domain,
    score: bestMatch.score,
    matchedKeywords: bestMatch.matchedKeywords,
  };
}

/**
 * Formatea el esquema canónico recuperado en un bloque conciso (~200 tokens)
 * para inyección directa en el prompt del LLM (Targeted Grounding).
 */
export function formatDomainGroundingPrompt(domain: CanonicalDomainModel, isEn: boolean): string {
  const classesSummary = domain.classes
    .map((c) => {
      const attrs = c.attributes.map((a) => `${a.name}: ${a.type}`).join(', ');
      return `  - ${c.name} (attributes: [${attrs}])`;
    })
    .join('\n');

  const relsSummary = domain.relationships
    .map((r) => {
      const mult = r.sourceMultiplicity && r.targetMultiplicity
        ? ` (${r.sourceMultiplicity}) <-> (${r.targetMultiplicity})`
        : '';
      const typeStr = r.type === 'composition' ? '◆ Composition' : r.type === 'aggregation' ? '◇ Aggregation' : 'Association';
      return `  - ${typeStr}: ${r.source}${mult} ${r.target}`;
    })
    .join('\n');

  if (isEn) {
    return [
      `EXPERT CANONICAL BLUEPRINT FOR "${domain.title}":`,
      'Use the following domain architecture as your structural reference:',
      'Classes & Attributes:',
      classesSummary,
      'Relationships:',
      relsSummary,
      'Adapt this blueprint strictly to satisfy any specific user constraints without hallucinating orphan classes or duplicate links.',
    ].join('\n');
  }

  return [
    `ARQUITECTURA CANÓNICA EXPERTA PARA "${domain.title}":`,
    'Usá la siguiente arquitectura de dominio como base estructural de referencia:',
    'Clases y Atributos:',
    classesSummary,
    'Relaciones:',
    relsSummary,
    'Adaptá este esquema canónico a los requerimientos específicos del usuario, manteniendo coherencia, atributos con tipos y sin clases huérfanas.',
  ].join('\n');
}
