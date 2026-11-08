/**
 * Tipos e interfaces para los adaptadores de visión.
 */

/** Se lanza cuando el proveedor de visión es inalcanzable o retorna una salida inválida. */
export class VisionExtractionError extends Error {
  constructor(message = 'Vision extraction failed') {
    super(message);
    this.name = 'VisionExtractionError';
  }
}

export interface FakeVisionOptions {
  /** Si es true, extract() lanza VisionExtractionError (servicio inalcanzable). */
  forceInvalid?: boolean;
  /** Si es true, extract() retorna un lote vacío (extracción con cero elementos). */
  zeroElements?: boolean;
}

export interface OpenAiVisionConfig {
  apiKey: string;
  /** Por defecto: https://api.openai.com/v1 — sobreescribir para gateways compatibles. */
  baseUrl?: string | undefined;
  /** Por defecto: gpt-4o-mini. */
  model?: string | undefined;
  /** Intentos máximos en caso de error de esquema (por defecto 2). */
  maxAttempts?: number | undefined;
}
