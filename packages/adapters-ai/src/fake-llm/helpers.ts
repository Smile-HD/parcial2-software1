import type { Diagram, Delta } from '@app/core';
import { levenshtein } from '../normalizer.js';

export function classIdByName(diagram: Diagram, name: string): string | null {
  const target = name.toLowerCase();
  const exact = diagram.classes.find((cls) => cls.name.toLowerCase() === target);
  if (exact) return exact.id;

  let bestId: string | null = null;
  let bestDist = 3;
  for (const cls of diagram.classes) {
    const dist = levenshtein(cls.name.toLowerCase(), target);
    if (dist < bestDist && dist <= 2) {
      bestDist = dist;
      bestId = cls.id;
    }
  }
  return bestId;
}

export function parseMultiplicities(text: string): { source: string; target: string } | null {
  const norm = text.trim().toLowerCase();
  if (/^(?:muchos\s+(?:a|to)\s+muchos|muchos\s*:\s*muchos|[nm\*]\s+(?:a|to)\s+[nm\*]|[nm\*]\s*:\s*[nm\*]|[nm\*]\.\.[nm\*])$/.test(norm)) {
    return { source: '0..*', target: '0..*' };
  }
  if (/^(?:1\s+(?:a|to)\s+(?:muchos|[nm\*])|uno\s+(?:a|to)\s+muchos|1\s*:\s*(?:muchos|[nm\*])|1\.\.(?:muchos|[nm\*]))$/.test(norm)) {
    return { source: '1', target: '0..*' };
  }
  if (/^(?:(?:muchos|[nm\*])\s+(?:a|to)\s+1|muchos\s+(?:a|to)\s+uno|(?:muchos|[nm\*])\s*:\s*1|(?:muchos|[nm\*])\.\.1)$/.test(norm)) {
    return { source: '0..*', target: '1' };
  }
  if (/^(?:1\s+(?:a|to)\s+1|uno\s+(?:a|to)\s+uno|1\s*:\s*1|1\.\.1)$/.test(norm)) {
    return { source: '1', target: '1' };
  }
  if (/^(?:0\.\.1\s+(?:a|to)\s+1|0\.\.1\s*:\s*1|0\.\.1\.\.1)$/.test(norm)) {
    return { source: '0..1', target: '1' };
  }
  if (/^(?:0\.\.1\s+(?:a|to)\s+(?:0\.\.\*|[nm\*])|0\.\.1\s*:\s*(?:0\.\.\*|[nm\*]))$/.test(norm)) {
    return { source: '0..1', target: '0..*' };
  }
  const generic = /^([^\s:]+)\s*(?::|\s+(?:a|to)\s+)\s*([^\s:]+)$/.exec(norm);
  if (generic) {
    const mapOne = (val: string) => {
      if (val === 'muchos' || val === 'n' || val === 'm' || val === '*') return '0..*';
      if (val === 'uno') return '1';
      return val;
    };
    return { source: mapOne(generic[1]!), target: mapOne(generic[2]!) };
  }
  return null;
}

export function nextPosition(diagram: Diagram): { x: number; y: number } {
  const n = diagram.classes.length;
  return { x: 80 + n * 40, y: 80 + n * 40 };
}

export function deltaBase(diagram: Diagram): { id: string; diagramId: string; timestamp: string } {
  return {
    id: crypto.randomUUID(),
    diagramId: diagram.id,
    timestamp: new Date().toISOString(),
  };
}

export const WHOLE_DESIGN_REQUEST = /\b(generate|genera|generá|dise[ñn]a|dise[ñn]o)\b[\s\S]*\b(design|dise[ñn]o|full|completo|complete|system|sistema|library|biblioteca)\b/i;

export interface FakeLlmContext {
  rawUtterance: string;
  utterance: string;
  adornments: {
    visibility?: '-' | '#' | '~';
    isStatic?: boolean;
    isDerived?: boolean;
  };
  currentIr: Diagram;
}
