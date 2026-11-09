import type { VisionPort, BatchDelta } from '@app/core';
import { BatchDeltaSchema } from '@app/core';
import { VisionExtractionError, type OpenAiVisionConfig } from './types.js';
import { cleanAndExtractJson, normalizeBatchPayload, SYSTEM_PROMPT } from './payload-normalizer.js';

/**
 * Adaptador de visión multimodal compatible con OpenAI. Envía la imagen como
 * mensaje de usuario con la parte de contenido image_url y espera una respuesta JSON
 * analizable a un BatchDelta. Incluye canal de limpieza, resolución de referencias,
 * normalización de UUIDs y reintento con autorrecuperación.
 */
export class OpenAiVision implements VisionPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxAttempts: number;

  constructor(config: OpenAiVisionConfig) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').trim().replace(/[,/]+$/, '');
    this.model = config.model ?? 'gpt-4o-mini';
    this.maxAttempts = config.maxAttempts ?? 2;
  }

  static fromEnv(): OpenAiVision | null {
    const apiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAiVision({
      apiKey,
      baseUrl: process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL,
      model: process.env.VISION_MODEL,
    });
  }

  async extract(image: Uint8Array, mimeType: string): Promise<BatchDelta> {
    const dataUrl = `data:${mimeType};base64,${Buffer.from(image).toString('base64')}`;

    const messages: { role: string; content: unknown }[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all UML classes, members, and relationships from this diagram image.',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ];

    let lastError: Error | null = null;
    const targetUrl = `${this.baseUrl}/chat/completions`;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            response_format: { type: 'json_object' },
            messages,
          }),
        });
      } catch (error) {
        throw new VisionExtractionError(
          `Vision request failed (${targetUrl}): ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new VisionExtractionError(
          `Vision request failed (${targetUrl}) with status ${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`,
        );
      }

      const payload = (await response.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
      } | null;

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new VisionExtractionError('Vision response had no message content');
      }

      let parsed: unknown;
      try {
        const cleaned = cleanAndExtractJson(content);
        parsed = JSON.parse(cleaned);
      } catch {
        lastError = new VisionExtractionError('Vision returned non-JSON content');
        if (attempt < this.maxAttempts) {
          messages.push(
            { role: 'assistant', content },
            {
              role: 'user',
              content:
                'Your previous response was not valid JSON. Return ONLY a valid JSON object matching the BatchDelta schema.',
            },
          );
          continue;
        }
        throw lastError;
      }

      // Normaliza identificadores, referencias de nombres y coordenadas
      const normalized = normalizeBatchPayload(parsed);

      // Valida contra el esquema canónico BatchDelta (compuerta photo:R1)
      const result = BatchDeltaSchema.safeParse(normalized);
      if (result.success) {
        return result.data;
      }

      const issuesDigest = result.error.issues
        .map((i) => `${i.path.length > 0 ? i.path.join('.') : '/'}: ${i.message}`)
        .join('; ');
      lastError = new VisionExtractionError(`Vision response is not a valid extraction: ${issuesDigest}`);

      if (attempt < this.maxAttempts) {
        messages.push(
          { role: 'assistant', content },
          {
            role: 'user',
            content: `Your previous extraction had schema validation issues: ${issuesDigest}. Return ONLY the corrected JSON object matching the BatchDelta schema.`,
          },
        );
        continue;
      }
    }

    throw lastError ?? new VisionExtractionError('Vision extraction failed');
  }
}
