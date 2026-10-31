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
      const input = 'agrg una clse Empleado cn los atrbutos nombre, sueldo y fecha';
      const normalized = normalizeUmlUtterance(input);
      expect(normalized).toContain('agrega');
      expect(normalized).toContain('clase');
      expect(normalized).toContain('Empleado');
      expect(normalized).toContain('con');
      expect(normalized).toContain('atributos');
    });

    it('normalizes Spanish action verbs across all accents, regional dialects and enclitics', () => {
      // Voseo (Rioplatense / Centroamérica)
      expect(normalizeUmlUtterance('creá una clase Factura')).toContain('crea una clase Factura');
      expect(normalizeUmlUtterance('borrá la clase Usuario')).toContain('borra la clase Usuario');
      expect(normalizeUmlUtterance('renombrá la clase Estudiante a Alumno')).toContain('renombra la clase Estudiante a Alumno');
      expect(normalizeUmlUtterance('sacá la clase Deposito')).toContain('borra la clase Deposito');
      expect(normalizeUmlUtterance('ponele atributos x e y')).toContain('agrega atributos x e y');

      // Tuteo / Infinitivo / Sinónimos
      expect(normalizeUmlUtterance('construir una clase Pedido')).toContain('crea una clase Pedido');
      expect(normalizeUmlUtterance('diseñá la entidad Cuenta')).toContain('crea la entidad Cuenta');
      expect(normalizeUmlUtterance('añade atributos a la clase Producto')).toContain('agrega atributos a la clase Producto');
      expect(normalizeUmlUtterance('suprimir la clase Registro')).toContain('borra la clase Registro');
      expect(normalizeUmlUtterance('vinculá la clase Orden con Detalle')).toContain('conecta la clase Orden con Detalle');

      // Enclíticos
      expect(normalizeUmlUtterance('creala como clase')).toContain('crea como clase');
      expect(normalizeUmlUtterance('agregale atributos')).toContain('agrega atributos');
      expect(normalizeUmlUtterance('borralo')).toContain('borra');

      // Formas sin tilde y teclados sin ñ
      expect(normalizeUmlUtterance('construi una clase Pedido')).toContain('crea una clase Pedido');
      expect(normalizeUmlUtterance('disena la clase Cuenta')).toContain('crea la clase Cuenta');
      expect(normalizeUmlUtterance('disenar la clase Usuario')).toContain('crea la clase Usuario');
      expect(normalizeUmlUtterance('anade atributos x e y')).toContain('agrega atributos x e y');
      expect(normalizeUmlUtterance('anadir metodo calcular')).toContain('agrega metodos calcular');
      expect(normalizeUmlUtterance('uni la clase A con B')).toContain('conecta la clase A con B');
      expect(normalizeUmlUtterance('defini la clase Item')).toContain('crea la clase Item');
      expect(normalizeUmlUtterance('suprimi la clase Item')).toContain('borra la clase Item');
    });

    it('is strictly domain-agnostic and preserves arbitrary class and attribute names', () => {
      // Classes can have any name, including Dinero, Fecha, or domain-specific names
      expect(normalizeUmlUtterance('creá una clase Dinero con valor')).toContain('crea una clase Dinero con valor');
      expect(normalizeUmlUtterance('crea una clase Fecha con timestamp')).toContain('crea una clase Fecha con timestamp');
      expect(normalizeUmlUtterance('armá la clase QuantumGate con spin')).toContain('crea la clase QuantumGate con spin');
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
      expect(sanitizeUmlType('real', 'saldo')).toBe('float');
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
