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
      cachedIndex = JSON.parse(content);
      return cachedIndex!;
    }
  } catch (err) {
    console.warn('[DomainCatalog] Could not read index.json, falling back to base domains:', err);
  }

  cachedIndex = CANONICAL_DOMAINS.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    keywords: d.keywords,
  }));
  return cachedIndex;
}

/**
 * Carga bajo demanda (Lazy-Loading) el esquema completo de un dominio por ID.
 * Utiliza una caché en memoria para que consultas repetidas tomen 0 ms.
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

  // 2. Probar desde schemas.json en disco
  try {
    if (fs.existsSync(SCHEMAS_FILE)) {
      const raw = fs.readFileSync(SCHEMAS_FILE, 'utf-8');
      const allSchemas: Record<string, CanonicalDomainModel> = JSON.parse(raw);
      if (allSchemas[id]) {
        schemaCache.set(id, allSchemas[id]);
        return allSchemas[id];
      }
    }
  } catch (err) {
    console.warn(`[DomainCatalog] Failed to lazy-load schema for "${id}":`, err);
  }

  return null;
}
