import { describe, it, expect } from 'vitest';
import {
  normalizeChatInput,
  classifyTurnIntent,
  buildActionPrompt,
  buildConversationalPrompt,
  buildKaggleArchitectPrompt,
  resolveSystemPrompt,
} from './prompt-builder.js';

describe('prompt-builder & normalizer module', () => {
  describe('normalizeChatInput', () => {
    it('normalizes diacritics and imperative verbs', () => {
      const res = normalizeChatInput('creá una clase Factura con total');
      expect(res.cleanContent).toContain('crea una clase Factura');
      expect(res.normalized).toContain('crea una clase factura');
    });

    it('normalizes cardinalities like uno a muchos to 1 a N', () => {
      const res = normalizeChatInput('conecta Usuario con Pedido uno a muchos');
      expect(res.cleanContent).toContain('1 a N');
      expect(res.normalized).toContain('1 a n');
    });
  });

  describe('classifyTurnIntent', () => {
    it('classifies presence queries', () => {
      const { normalized } = normalizeChatInput('¿Quiénes están en la sala?');
      const intent = classifyTurnIntent('¿Quiénes están en la sala?', normalized);
      expect(intent.isPresenceQuery).toBe(true);
    });

    it('classifies ambiguous modeling requests', () => {
      const { normalized } = normalizeChatInput('crea algo');
      const intent = classifyTurnIntent('crea algo', normalized);
      expect(intent.isAmbiguous).toBe(true);
    });

    it('classifies modeling action intents as isAction', () => {
      const { normalized } = normalizeChatInput('crea la clase Producto con precio y stock');
      const intent = classifyTurnIntent('crea la clase Producto con precio y stock', normalized);
      expect(intent.isAction).toBe(true);
      expect(intent.isToolQuery).toBe(false);
    });

    it('classifies theoretical or tool questions as not isAction', () => {
      const { normalized } = normalizeChatInput('¿Cómo se exporta a Spring Boot?');
      const intent = classifyTurnIntent('¿Cómo se exporta a Spring Boot?', normalized);
      expect(intent.isToolQuery).toBe(true);
      expect(intent.isAction).toBe(false);
    });
  });

  describe('buildActionPrompt', () => {
    it('generates a concise prompt without UI marketing or slash commands', () => {
      const prompt = buildActionPrompt({
        senderName: 'Carlos',
        language: 'es',
        diagramContext: 'Diagrama con 2 clases: Cliente, Pedido',
      });

      // Must contain essential action directives
      expect(prompt).toContain('```json');
      expect(prompt).toContain('LÍMITE ESTRICTO: Generá como MÁXIMO 5 clases');
      expect(prompt).toContain('Diagrama con 2 clases: Cliente, Pedido');

      // Must NOT contain UI feature marketing
      expect(prompt).not.toContain('Exportar Spring Boot');
      expect(prompt).not.toContain('XMI 2.1');
      expect(prompt).not.toContain('Groq Whisper');
      expect(prompt).not.toContain('/help: guía interactiva');

      // Words count should be compact (< 400 words)
      const wordCount = prompt.split(/\s+/).length;
      expect(wordCount).toBeLessThan(400);
    });

    it('generates English action prompt when language is en', () => {
      const prompt = buildActionPrompt({
        senderName: 'Alice',
        language: 'en',
        diagramContext: 'Empty canvas',
      });

      expect(prompt).toContain('```json');
      expect(prompt).toContain('STRICT LIMIT: Generate AT MOST 5 classes');
      expect(prompt).not.toContain('Export Spring Boot');
    });
  });

  describe('buildConversationalPrompt', () => {
    it('generates conversational prompt with tool knowledge but without JSON schemas', () => {
      const prompt = buildConversationalPrompt({
        senderName: 'Carlos',
        language: 'es',
        diagramContext: 'Empty canvas',
        activePeersSummary: 'Carlos, Ana',
      });

      expect(prompt).toContain('Carlos, Ana');
      expect(prompt).toContain('Exportar Spring Boot');
      expect(prompt).toContain('/help');
      expect(prompt).not.toContain('"action": "modify"');
      expect(prompt).not.toContain('"codigoIATA"');
    });
  });

  describe('resolveSystemPrompt', () => {
    it('routes to action prompt when isAction is true', () => {
      const prompt = resolveSystemPrompt({
        senderName: 'Carlos',
        language: 'es',
        diagramContext: 'ctx',
        isAction: true,
      });
      expect(prompt).toContain('```json');
      expect(prompt).not.toContain('/help');
    });

    it('routes to conversational prompt when isAction is false', () => {
      const prompt = resolveSystemPrompt({
        senderName: 'Carlos',
        language: 'es',
        diagramContext: 'ctx',
        isAction: false,
      });
      expect(prompt).toContain('/help');
      expect(prompt).not.toContain('"action": "modify"');
    });
  });

  describe('buildKaggleArchitectPrompt', () => {
    it('generates unified architect prompt with ambiguity guidance and slash commands (es)', () => {
      const prompt = buildKaggleArchitectPrompt({
        senderName: 'Erick',
        language: 'es',
        diagramContext: 'Clase Usuario con id',
        activePeersSummary: 'Erick, Maria',
      });

      expect(prompt).toContain('Sos Amongus, arquitecto senior de software');
      expect(prompt).toContain('Erick, Maria');
      expect(prompt).toContain('RESOLUCIÓN DE AMBIGÜEDAD (MUTACIONES FLEXIBLES)');
      expect(prompt).toContain('/model');
      expect(prompt).toContain('/suggest');
      expect(prompt).toContain('/audit');
      expect(prompt).toContain('```json');
      expect(prompt).toContain('"action": "modify"');
      expect(prompt).toContain('Clase Usuario con id');
      expect(prompt).toContain('PROHIBIDO DIVIDIR EN MÚLTIPLES BLOQUES');
    });

    it('generates unified architect prompt in English (en)', () => {
      const prompt = buildKaggleArchitectPrompt({
        senderName: 'Alice',
        language: 'en',
        diagramContext: 'Class Order with total',
        activePeersSummary: 'Alice',
      });

      expect(prompt).toContain('You are Amongus, a senior software architect');
      expect(prompt).toContain('FORBIDDEN TO SPLIT JSON');
      expect(prompt).toContain('DIALOGUE & AMBIGUITY RESOLUTION');
      expect(prompt).toContain('/model');
      expect(prompt).toContain('/suggest');
      expect(prompt).toContain('/audit');
      expect(prompt).toContain('```json');
    });
  });
});

