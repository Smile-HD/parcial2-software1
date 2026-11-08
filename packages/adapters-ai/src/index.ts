/**
 * @app/adapters-ai — Adaptadores LLM para el intérprete de texto (PR 7, tarea 7.3).
 *
 * - `FakeLlm` — comparador de patrones determinista usado por pruebas y desarrollo
 *   offline (sin red). Entiende el vocabulario acotado de comandos y rechaza
 *   solicitudes de generación de diseño completo (interpreter:R3).
 * - `OpenAiLlm` — adaptador de chat-completions compatible con OpenAI con salida
 *   estructurada en JSON. El delta retornado SIEMPRE es validado por Zod por el
 *   invocador (interpreter:R1) — el texto del modelo nunca toca el metamodelo directamente.
 */

export const PACKAGE_NAME = '@app/adapters-ai' as const;

export * from './stt.js';
export * from './retry-repairing-llm.js';
export * from './vision.js';
export * from './repair.js';
export * from './normalizer.js';
export * from './canonicalizer.js';
export { FakeLlm } from './fake-llm.js';
export { OpenAiLlm, type OpenAiLlmConfig } from './openai-llm.js';
