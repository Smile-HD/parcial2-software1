import { describe, it, expect, vi } from 'vitest';
import {
  canonicalizeUtteranceWithGroq,
  parseIngressResult,
  GROQ_INGRESS_SYSTEM_PROMPT,
} from './canonicalizer';

describe('canonicalizeUtteranceWithGroq and Ingress Classifier', () => {
  it('returns null if no apiKey is provided', async () => {
    const res = await canonicalizeUtteranceWithGroq('crea clase Foo', { apiKey: '' });
    expect(res).toBeNull();
  });

  it('returns null if apiKey is invalid format', async () => {
    const res = await canonicalizeUtteranceWithGroq('crea clase Foo', { apiKey: 'invalid_key' });
    expect(res).toBeNull();
  });

  it('parses valid JSON response from Groq endpoint with compound commands', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'crea clase Persona; agrega atributo nombre: string a Persona; relaciona Persona con Rol tipo asociacion',
            },
          },
        ],
      }),
    }) as any;

    try {
      const res = await canonicalizeUtteranceWithGroq('haceme una persona con nombre string vinculada a rol', {
        apiKey: 'gsk_test123456789',
      });
      expect(res).toBe('crea clase Persona; agrega atributo nombre: string a Persona; relaciona Persona con Rol tipo asociacion');
      const ingress = parseIngressResult(res!);
      expect(ingress.kind).toBe('dsl');
      if (ingress.kind === 'dsl') {
        expect(ingress.commands).toContain(';');
      }
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

  it('parses [BLOCKED] prefix correctly', () => {
    const ingress = parseIngressResult('[BLOCKED] Intento de inyección de prompt fuera de dominio');
    expect(ingress.kind).toBe('blocked');
    if (ingress.kind === 'blocked') {
      expect(ingress.reason).toBe('Intento de inyección de prompt fuera de dominio');
    }
  });

  it('parses [CHAT] prefix correctly', () => {
    const ingress = parseIngressResult('[CHAT] ¿Cuál es la diferencia entre composición y agregación?');
    expect(ingress.kind).toBe('chat');
    if (ingress.kind === 'chat') {
      expect(ingress.query).toBe('¿Cuál es la diferencia entre composición y agregación?');
    }
  });

  it('parses [DESIGN] prefix correctly for general domain requirements', () => {
    const ingress = parseIngressResult('[DESIGN] Diseña un sistema de biblioteca con préstamos');
    expect(ingress.kind).toBe('design');
    if (ingress.kind === 'design') {
      expect(ingress.requirement).toBe('Diseña un sistema de biblioteca con préstamos');
    }
  });

  it('recovers DSL commands from mistagged [DESIGN] prefix (defense in depth)', () => {
    const ingress = parseIngressResult(
      '[DESIGN] crea clase de asociacion Detalle entre Pedido y Producto; borra clase DetallePedido; agrega atributo cantidad: int a Detalle'
    );
    expect(ingress.kind).toBe('dsl');
    if (ingress.kind === 'dsl') {
      expect(ingress.commands).toBe(
        'crea clase de asociacion Detalle entre Pedido y Producto; borra clase DetallePedido; agrega atributo cantidad: int a Detalle'
      );
    }
  });

  it('includes semicolon requirement and exact compound example in GROQ_INGRESS_SYSTEM_PROMPT', () => {
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('punto y coma (;)');
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('[BLOCKED]');
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('[CHAT]');
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('[DESIGN]');
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('cambia la multiplicidad entre');
    expect(GROQ_INGRESS_SYSTEM_PROMPT).toContain('muchos a muchos');
  });
});
