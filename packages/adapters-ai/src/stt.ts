/**
 * Adaptadores STT (PR 8, tarea 8.1).
 *
 * voice:R1 — la transcripción utiliza una API STT EXISTENTE (OpenAI Whisper); este
 * paquete no implementa ningún modelo acústico. Las fallas de transporte/configuración
 * se exponen como `SttUnavailableError` para que los invocadores puedan distinguir
 * "el usuario debe usar entrada de texto" de un rechazo de interpretación.
 *
 * - `FakeStt` — determinista, sin red: retorna una transcripción configurada
 *   (por defecto: la elocución canónica de demostración) o lanza un error configurado
 *   para probar rutas de caída fuera de línea.
 * - `WhisperStt` — adaptador de `/audio/transcriptions` compatible con OpenAI.
 */
import type { SttPort } from '@app/core';

/** Se lanza cuando el proveedor STT es inalcanzable o está mal configurado (voice:R1). */
export class SttUnavailableError extends Error {
  constructor(message = 'Speech-to-text service is unavailable') {
    super(message);
    this.name = 'SttUnavailableError';
  }
}

export interface FakeSttOptions {
  /** Transcripción retornada en cada llamada. Por defecto: elocución canónica de demo. */
  transcript?: string | undefined;
  /** Si se define, transcribe() rechaza con este error (simulación de interrupción de servicio). */
  error?: Error | undefined;
}

export class FakeStt implements SttPort {
  private readonly transcript: string;
  private readonly error: Error | undefined;

  constructor(options: FakeSttOptions = {}) {
    this.transcript = options.transcript ?? 'add a class Invoice';
    this.error = options.error;
  }

  async transcribe(_audio: Uint8Array, _mimeType: string): Promise<string> {
    if (this.error) {
      throw this.error;
    }
    return this.transcript;
  }
}

export interface WhisperSttConfig {
  apiKey: string;
  /** Por defecto: https://api.openai.com/v1 — sobreescribir para gateways compatibles. */
  baseUrl?: string | undefined;
  /** Por defecto: whisper-1. */
  model?: string | undefined;
}

export class WhisperStt implements SttPort {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;

  constructor(config: WhisperSttConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    const isGroq = /groq\.com/i.test(this.baseUrl) || config.apiKey.startsWith('gsk_');
    this.model = config.model && config.model !== 'whisper-1'
      ? config.model
      : (isGroq ? 'whisper-large-v3-turbo' : (config.model ?? 'whisper-1'));
  }

  static fromEnv(): WhisperStt | null {
    const apiKey = process.env.STT_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const isGroq =
      apiKey.startsWith('gsk_') ||
      Boolean(process.env.GROQ_API_KEY && apiKey === process.env.GROQ_API_KEY) ||
      Boolean((process.env.STT_BASE_URL || process.env.OPENAI_BASE_URL) && /groq\.com/i.test(process.env.STT_BASE_URL || process.env.OPENAI_BASE_URL || ''));
    const baseUrl = process.env.STT_BASE_URL || (isGroq ? 'https://api.groq.com/openai/v1' : process.env.OPENAI_BASE_URL);
    // Los endpoints de Ollama (ej. puerto 11434) no tienen endpoint de transcripción Whisper STT
    if (!process.env.STT_BASE_URL && baseUrl && /:11434/i.test(baseUrl)) {
      return null;
    }
    const envModel = process.env.WHISPER_MODEL;
    const model = (envModel && (!isGroq || envModel !== 'whisper-1'))
      ? envModel
      : (isGroq ? 'whisper-large-v3-turbo' : 'whisper-1');

    return new WhisperStt({
      apiKey,
      baseUrl,
      model,
    });
  }

  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    if (!audio || audio.byteLength === 0) {
      throw new SttUnavailableError('Audio recording is empty or not received. Please record again.');
    }
    let extension = mimeType.toLowerCase().split('/')[1]?.split(';')[0]?.trim() ?? 'webm';
    if (extension === 'x-matroska' || extension === 'matroska') extension = 'mkv';
    if (extension === 'octet-stream') extension = 'webm';
    const form = new FormData();
    form.set('file', new File([new Uint8Array(audio)], `audio.${extension}`, { type: mimeType }));
    form.set('model', this.model);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
    } catch (error) {
      throw new SttUnavailableError(
        `Speech-to-text request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new SttUnavailableError(`Speech-to-text request failed with status ${response.status}: ${errBody}`);
    }

    const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
    if (payload === null || typeof payload.text !== 'string') {
      throw new SttUnavailableError('Speech-to-text response had no transcript');
    }
    return payload.text;
  }
}
