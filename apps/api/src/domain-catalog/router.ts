import { getInvertedIndex, getDomainSchema } from './loader.js';
import type { CanonicalDomainModel, DomainMatchResult } from './types.js';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[b.length];
}

/**
 * Enrutador léxico en memoria de latencia ultra-baja (< 0.1 ms).
 * Utiliza un índice invertido O(1) con tolerancia a faltas ortográficas (fuzzy matching)
 * para emparejar consultas en español e inglés con el catálogo de más de 1.500 modelos canónicos.
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

  const { exactTokenMap, phraseMap, prefixMap } = getInvertedIndex();
  const scores = new Map<string, { score: number; matchedKeywords: Set<string> }>();

  // 1. Coincidencia de frases compuestas mediante n-gramas de la consulta (O(1) por n-grama)
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= queryTokens.length - n; i++) {
      const gram = queryTokens.slice(i, i + n).join(' ');
      const phraseHits = phraseMap.get(gram);
      if (phraseHits) {
        for (const hit of phraseHits) {
          let entry = scores.get(hit.id);
          if (!entry) {
            entry = { score: 0, matchedKeywords: new Set() };
            scores.set(hit.id, entry);
          }
          if (!entry.matchedKeywords.has(hit.originalKeyword)) {
            entry.score += hit.weight;
            entry.matchedKeywords.add(hit.originalKeyword);
          }
        }
      }
    }
  }

  // 2. Coincidencia token a token mediante mapa hash O(1)
  for (const token of queryTokens) {
    const exactHits = exactTokenMap.get(token);
    if (exactHits) {
      for (const hit of exactHits) {
        let entry = scores.get(hit.id);
        if (!entry) {
          entry = { score: 0, matchedKeywords: new Set() };
          scores.set(hit.id, entry);
        }
        if (!entry.matchedKeywords.has(hit.originalKeyword)) {
          entry.score += hit.weight;
          entry.matchedKeywords.add(hit.originalKeyword);
        }
      }
    } else if (token.length >= 4) {
      // 2b. Respaldo por prefijo solo si el token no tuvo coincidencia exacta
      const pfx = token.slice(0, 4);
      const prefixHits = prefixMap.get(pfx);
      if (prefixHits) {
        for (const hit of prefixHits) {
          let entry = scores.get(hit.id);
          if (!entry) {
            entry = { score: 0, matchedKeywords: new Set() };
            scores.set(hit.id, entry);
          }
          if (!entry.matchedKeywords.has(hit.originalKeyword)) {
            if (hit.originalKeyword.startsWith(token) || token.startsWith(hit.originalKeyword)) {
              entry.score += hit.weight;
              entry.matchedKeywords.add(hit.originalKeyword);
            }
          }
        }
      }
    }
  }

  // 3. Tolerancia a faltas ortográficas (Fuzzy Matching Levenshtein)
  // Solo se activa como respaldo si no hubo coincidencia exacta ni de n-gramas
  if (scores.size === 0) {
    for (const token of queryTokens) {
      if (token.length < 5) continue;
      const maxAllowedDist = token.length >= 7 ? 2 : 1;

      for (const [kw, entries] of exactTokenMap.entries()) {
        if (Math.abs(kw.length - token.length) > maxAllowedDist) continue;

        const dist = levenshtein(token, kw);
        if (dist <= maxAllowedDist) {
          const weight = dist === 1 ? 0.9 : 0.7;
          for (const hit of entries) {
            let entry = scores.get(hit.id);
            if (!entry) {
              entry = { score: 0, matchedKeywords: new Set() };
              scores.set(hit.id, entry);
            }
            if (!entry.matchedKeywords.has(hit.originalKeyword)) {
              entry.score += weight;
              entry.matchedKeywords.add(hit.originalKeyword);
            }
          }
        }
      }
    }
  }

  if (scores.size === 0) {
    return null;
  }

  let bestMatch: { id: string; score: number; matchedKeywords: string[] } | null = null;
  let highestScore = 0;

  for (const [id, data] of scores.entries()) {
    // Normalizar score por relevancia
    const normalizedScore = data.score > 0 ? Math.min(data.score / 2.0, 1.0) : 0;
    if (normalizedScore >= threshold && normalizedScore > highestScore) {
      highestScore = normalizedScore;
      bestMatch = {
        id,
        score: normalizedScore,
        matchedKeywords: Array.from(data.matchedKeywords),
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
  const topClasses = (domain.classes || []).slice(0, 5);
  const classNames = new Set(topClasses.map((c) => c.name));

  const classesSummary = topClasses
    .map((c) => {
      const attrs = c.attributes.map((a) => `${a.name}: ${a.type}`).join(', ');
      return `  - ${c.name} (attributes: [${attrs}])`;
    })
    .join('\n');

  const relsSummary = (domain.relationships || [])
    .filter((r) => classNames.has(r.source) && classNames.has(r.target))
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
