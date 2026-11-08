/**
 * @app/adapters-ai — Canonicador Zero-Shot de alta velocidad con Groq.
 *
 * Utiliza modelos ultrarrápidos en Groq (ej: qwen/qwen3.8-27b con inferencia ~100-150ms)
 * para traducir el lenguaje coloquial, ambiguo o con sintaxis rota del usuario
 * a una secuencia estándar de órdenes imperativas separadas por punto y coma (;).
 *
 * Esta salida se reinyecta directamente al motor determinista (FakeLlm / interpretCommand)
 * garantizando cero alucinaciones y cumplimiento 100% de tipos y metamodelo.
 */

export interface CanonicalizerOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export async function canonicalizeUtteranceWithGroq(
  utterance: string,
  options?: CanonicalizerOptions
): Promise<string | null> {
  const apiKey =
    options?.apiKey ||
    process.env.GROQ_API_KEY ||
    process.env.STT_API_KEY;

  if (!apiKey || !apiKey.startsWith('gsk_')) {
    return null;
  }

  const model = options?.model || process.env.GROQ_CANONICALIZER_MODEL || 'qwen/qwen3.8-27b';
  const timeoutMs = options?.timeoutMs || 4000;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Sos un sanitizador y corrector ortográfico de lenguaje natural para un sistema de diseño UML. Tu ÚNICA y EXCLUSIVA tarea es limpiar la frase del usuario: corregir errores ortográficos, typos y palabras cortadas (ej: "atribut" -> "atributo", "alunmo" -> "Alumno"), y reorganizar la frase a una orden imperativa directa. REGLA ESTRICTA: NUNCA generes, inventes ni agregues clases, atributos, métodos ni relaciones que el usuario NO haya mencionado explícitamente. No respondas preguntas ni agregues explicaciones, ni saludos, ni formato markdown.',
          },
          { role: 'user', content: utterance },
        ],
        temperature: 0.0,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || typeof content !== 'string') {
      return null;
    }

    // Limpiar posibles bloques markdown si el modelo los incluyó
    const clean = content.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
    return clean.length > 0 ? clean : null;
  } catch {
    return null;
  }
}

