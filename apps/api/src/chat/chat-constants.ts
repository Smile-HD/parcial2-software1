/**
 * Constantes de configuración de inferencia y límites de tokens para el subsistema de chat.
 */
export const DEFAULT_LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 2000;
export const DEFAULT_LLM_TIMEOUT_MS = Math.max(120000, Number(process.env.LLM_TIMEOUT_MS) || 180000);
