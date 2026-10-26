/**
 * Cliente tipado para el endpoint de voz (PR 8, tarea 8.2/8.3).
 *
 * El navegador graba una locución corta y la envía por POST (base64) a
 * /diagrams/:id/voice. El endpoint retorna la transcripción más la MISMA
 * forma de resultado de interpretación que la ruta de texto (voice:R2 — sin flujo privilegiado).
 */
import type { InterpretResponse } from './diagramApi';
import { bytesToBase64 } from './base64';

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Resultado de POST /diagrams/:id/voice: transcripción + resultado del intérprete o solo transcripción. */
export type VoiceResponse = (InterpretResponse | { status: 'ok' }) & { transcript: string };

/** POST /diagrams/:id/voice — bytes de audio → transcripción → resultado del intérprete o solo transcripción. */
export async function transcribeAudio(
  diagramId: string,
  audio: Uint8Array,
  mimeType: string,
  transcribeOnly?: boolean,
): Promise<VoiceResponse> {
  const payload: { audio: string; mimeType: string; transcribeOnly?: boolean } = {
    audio: bytesToBase64(audio),
    mimeType,
  };
  if (transcribeOnly !== undefined) {
    payload.transcribeOnly = transcribeOnly;
  }
  const response = await fetch(`${API_BASE_URL}/diagrams/${diagramId}/voice`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as
    | (VoiceResponse & { error?: string })
    | null;
  if (!response.ok) {
    // El cuerpo 502 ya transporta la indicación de fallback de voice:R1.
    throw new Error(body?.error ?? `API error ${response.status}`);
  }
  if (body === null) {
    throw new Error('API returned a non-JSON body');
  }
  return body;
}
