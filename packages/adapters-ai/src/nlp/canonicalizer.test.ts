import { describe, it, expect, vi } from 'vitest';
import { canonicalizeUtteranceWithGroq } from './canonicalizer';

describe('canonicalizeUtteranceWithGroq', () => {
  it('returns null if no apiKey is provided', async () => {
    const res = await canonicalizeUtteranceWithGroq('crea clase Foo', { apiKey: '' });
    expect(res).toBeNull();
  });

  it('returns null if apiKey is invalid format', async () => {
    const res = await canonicalizeUtteranceWithGroq('crea clase Foo', { apiKey: 'invalid_key' });
    expect(res).toBeNull();
  });

  it('parses valid JSON response from Groq endpoint', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'crea clase Persona; agrega atributo nombre:string a Persona',
            },
          },
        ],
      }),
    }) as any;

    try {
      const res = await canonicalizeUtteranceWithGroq('haceme una persona con nombre string', {
        apiKey: 'gsk_test123456789',
      });
      expect(res).toBe('crea clase Persona; agrega atributo nombre:string a Persona');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles markdown fences in Groq output', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```text\ncrea clase Item\n```',
            },
          },
        ],
      }),
    }) as any;

    try {
      const res = await canonicalizeUtteranceWithGroq('crea item', {
        apiKey: 'gsk_test123456789',
      });
      expect(res).toBe('crea clase Item');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

