import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CanonicalDomainModel } from './types.js';
import { CANONICAL_DOMAINS } from './domains.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SCHEMAS_FILE = path.join(DATA_DIR, 'schemas.json');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

export interface DomainIndexItem {
  id: string;
  title: string;
  category: string;
  keywords: {
    es: string[];
    en: string[];
  };
  normalizedKeywords: string[];
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function attachNormalizedKeywords(items: any[]): DomainIndexItem[] {
  return items.map((item) => ({
    ...item,
    normalizedKeywords: [
      ...(item.keywords?.es || []).map(normalize),
      ...(item.keywords?.en || []).map(normalize),
    ],
  }));
}

let cachedIndex: DomainIndexItem[] | null = null;
const schemaCache = new Map<string, CanonicalDomainModel>();

/**
 * Retorna el índice liviano para búsqueda rápida (< 150 KB en RAM).
 * Si existe index.json en disco lo usa; si no, cae al catálogo base de domains.ts.
 */
export function getDomainIndex(): DomainIndexItem[] {
  if (cachedIndex) {
    return cachedIndex;
  }

  try {
    if (fs.existsSync(INDEX_FILE)) {
      const content = fs.readFileSync(INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      cachedIndex = attachNormalizedKeywords(parsed);
      return cachedIndex;
    }
  } catch (err) {
    console.warn('[DomainCatalog] No se pudo leer index.json, usando dominios base en memoria:', err);
  }

  const baseItems = CANONICAL_DOMAINS.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    keywords: d.keywords,
  }));
  cachedIndex = attachNormalizedKeywords(baseItems);
  return cachedIndex;
}

export interface InvertedIndexEntry {
  id: string;
  weight: number;
  originalKeyword: string;
}

export interface InvertedIndex {
  exactTokenMap: Map<string, InvertedIndexEntry[]>;
  phraseMap: Map<string, InvertedIndexEntry[]>;
  prefixMap: Map<string, InvertedIndexEntry[]>;
}

let cachedInvertedIndex: InvertedIndex | null = null;

/**
 * Genera y almacena en caché un índice invertido para búsquedas de latencia ultra-baja (sub-milisegundo).
 * Permite buscar entre más de 1.500 modelos canónicos en O(1) por token y n-gramas.
 */
export function getInvertedIndex(): InvertedIndex {
  if (cachedInvertedIndex) {
    return cachedInvertedIndex;
  }

  const index = getDomainIndex();
  const exactTokenMap = new Map<string, InvertedIndexEntry[]>();
  const phraseMap = new Map<string, InvertedIndexEntry[]>();
  const prefixMap = new Map<string, InvertedIndexEntry[]>();

  for (const item of index) {
    for (const kw of item.normalizedKeywords) {
      if (kw.includes(' ')) {
        // Frase compuesta indexada por hash para búsqueda de n-gramas O(1)
        let phraseArr = phraseMap.get(kw);
        if (!phraseArr) {
          phraseArr = [];
          phraseMap.set(kw, phraseArr);
        }
        phraseArr.push({ id: item.id, weight: 1.5, originalKeyword: kw });
      } else {
        // Coincidencia exacta de token
        let exactArr = exactTokenMap.get(kw);
        if (!exactArr) {
          exactArr = [];
          exactTokenMap.set(kw, exactArr);
        }
        exactArr.push({ id: item.id, weight: 1.0, originalKeyword: kw });

        // Coincidencia por prefijo/raíz léxica (tokens >= 4 caracteres)
        if (kw.length >= 4) {
          const pfx = kw.slice(0, 4);
          let pfxArr = prefixMap.get(pfx);
          if (!pfxArr) {
            pfxArr = [];
            prefixMap.set(pfx, pfxArr);
          }
          pfxArr.push({ id: item.id, weight: 0.6, originalKeyword: kw });
        }
      }
    }
  }

  cachedInvertedIndex = { exactTokenMap, phraseMap, prefixMap };
  return cachedInvertedIndex;
}

/**
 * Carga bajo demanda (Lazy-Loading) el esquema completo de un dominio por ID.
 * En la primera lectura de disco puebla la memoria para que todas las consultas subsiguientes tomen 0 ms.
 */
export function getDomainSchema(id: string): CanonicalDomainModel | null {
  if (schemaCache.has(id)) {
    return schemaCache.get(id)!;
  }

  // 1. Probar desde el catálogo base en memoria
  const baseMatch = CANONICAL_DOMAINS.find((d) => d.id === id);
  if (baseMatch) {
    schemaCache.set(id, baseMatch);
    return baseMatch;
  }

  // 2. Probar desde schemas.json en disco con carga diferida completa
  try {
    if (fs.existsSync(SCHEMAS_FILE)) {
      const raw = fs.readFileSync(SCHEMAS_FILE, 'utf-8');
      const allSchemas: Record<string, CanonicalDomainModel> = JSON.parse(raw);
      for (const [key, val] of Object.entries(allSchemas)) {
        schemaCache.set(key, val);
      }
      return schemaCache.get(id) || null;
    }
  } catch (err) {
    console.warn(`[DomainCatalog] No se pudo cargar bajo demanda el esquema para "${id}":`, err);
  }

  return null;
}
