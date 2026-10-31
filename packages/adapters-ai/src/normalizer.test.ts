import { describe, it, expect } from 'vitest';
import {
  normalizeUmlUtterance,
  sanitizeUmlType,
  inferAttributeType,
  splitCompoundUtterance,
  detectContradiction,
  extractExclusionClasses,
  findClosestSlashCommand,
} from './normalizer.js';

describe('normalizer module', () => {
  describe('normalizeUmlUtterance', () => {
    it('normalizes typos and accented verbs into canonical forms', () => {
      const input = 'agrg una clse Empleado cn los atrbutos nbre, sueldo y feha de ingreso';
      const normalized = normalizeUmlUtterance(input);
      expect(normalized).toContain('agrega');
      expect(normalized).toContain('clase');
      expect(normalized).toContain('Empleado');
      expect(normalized).toContain('con');
      expect(normalized).toContain('atributos');
      expect(normalized).toContain('nombre');
      expect(normalized).toContain('fecha');
    });

    it('normalizes accented imperative verbs without breaking word boundaries', () => {
      expect(normalizeUmlUtterance('creá una clase Factura')).toContain('crea una clase Factura');
      expect(normalizeUmlUtterance('borrá la clase Usuario')).toContain('borra la clase Usuario');
      expect(normalizeUmlUtterance('renombrá la clase Estudiante a Alumno')).toContain('renombra la clase Estudiante a Alumno');
      expect(normalizeUmlUtterance('eliminá la clase Deposito')).toContain('elimina la clase Deposito');
    });

    it('normalizes common typos in entities and attributes', () => {
      expect(normalizeUmlUtterance('fctura con nimero y totl')).toContain('Factura con numero y total');
      expect(normalizeUmlUtterance('poducto con prcio y cdigo')).toContain('Producto con precio y codigo');
    });
  });

  describe('sanitizeUmlType', () => {
    it('preserves valid standard types', () => {
      expect(sanitizeUmlType('string', 'any')).toBe('string');
      expect(sanitizeUmlType('int', 'any')).toBe('int');
      expect(sanitizeUmlType('decimal', 'total')).toBe('decimal');
      expect(sanitizeUmlType('float', 'monto')).toBe('float');
      expect(sanitizeUmlType('boolean', 'activo')).toBe('boolean');
      expect(sanitizeUmlType('date', 'fecha')).toBe('date');
    });

    it('maps natural language aliases to canonical types', () => {
      expect(sanitizeUmlType('texto', 'descripcion')).toBe('string');
      expect(sanitizeUmlType('entero', 'cantidad')).toBe('int');
      expect(sanitizeUmlType('numero raro', 'monto')).toBe('int');
      expect(sanitizeUmlType('dinero', 'precio')).toBe('float');
      expect(sanitizeUmlType('logico', 'disponible')).toBe('boolean');
    });

    it('sanitizes invalid/garbage types by inferring from attribute name semantics (S2)', () => {
      expect(sanitizeUmlType('banana', 'fechaDeVenta')).toBe('date');
      expect(sanitizeUmlType('color', 'porcentaje')).toBe('float');
      expect(sanitizeUmlType('fruta', 'codigo')).toBe('int');
      expect(sanitizeUmlType('cosa', 'esAdmin')).toBe('boolean');
      expect(sanitizeUmlType('cosa', 'descripcion')).toBe('string');
    });
  });

  describe('splitCompoundUtterance', () => {
    it('splits compound requests separated by semicolons and trims conjunctions (S5)', () => {
      const input = 'creá una clase Factura con numero, total y fecha; renombrá la clase Estudiante a Alumno; y borrá la clase Usuario';
      const parts = splitCompoundUtterance(input);
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('creá una clase Factura con numero, total y fecha');
      expect(parts[1]).toBe('renombrá la clase Estudiante a Alumno');
      expect(parts[2]).toBe('borrá la clase Usuario');
    });

    it('returns single element if no semicolon present', () => {
      expect(splitCompoundUtterance('crea clase Factura')).toEqual(['crea clase Factura']);
    });
  });

  describe('detectContradiction', () => {
    it('detects create and delete of same class in single prompt (S4)', () => {
      const prompt = 'crea una clase Producto con codigo y precio, y al mismo tiempo elimina la clase Producto porque ya no la necesito';
      const result = detectContradiction(prompt);
      expect(result.contradictory).toBe(true);
      expect(result.className?.toLowerCase()).toBe('producto');
    });

    it('returns false when no contradiction exists', () => {
      const prompt = 'crea una clase Factura y elimina la clase Usuario';
      expect(detectContradiction(prompt).contradictory).toBe(false);
    });
  });

  describe('extractExclusionClasses', () => {
    it('extracts excluded classes from delete-all requests (S3)', () => {
      const prompt = 'borrá todas las clases del diagrama menos Libro y Autor';
      const excluded = extractExclusionClasses(prompt);
      expect(excluded).toContain('Libro');
      expect(excluded).toContain('Autor');
      expect(excluded).toHaveLength(2);
    });

    it('returns empty array when no exclusion clause exists', () => {
      expect(extractExclusionClasses('borra todas las clases')).toEqual([]);
    });
  });

  describe('findClosestSlashCommand', () => {
    it('detects typo in slash command and suggests correction (S7)', () => {
      expect(findClosestSlashCommand('/auditt')).toBe('/audit');
      expect(findClosestSlashCommand('/modle')).toBe('/model');
      expect(findClosestSlashCommand('/suget')).toBe('/suggest');
      expect(findClosestSlashCommand('/layot')).toBe('/layout');
    });

    it('returns null for completely unrelated command', () => {
      expect(findClosestSlashCommand('/xyz123abc')).toBeNull();
    });
  });
});
