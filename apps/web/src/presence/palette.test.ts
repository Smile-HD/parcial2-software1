import { describe, expect, it } from 'vitest';
import { USER_PALETTE, pickUserColor } from './palette';

describe('Paleta de colores de usuario (realtime:R5)', () => {
  it('contiene colores válidos en formato hexadecimal con alto contraste', () => {
    expect(USER_PALETTE.length).toBeGreaterThanOrEqual(6);
    for (const color of USER_PALETTE) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('asigna un color determinista para el mismo nombre de usuario', () => {
    const color1 = pickUserColor('Ana');
    const color2 = pickUserColor('Ana');
    expect(color1).toBe(color2);
    expect(USER_PALETTE).toContain(color1);
  });

  it('soporta cadenas vacías o espacios sin lanzar excepciones', () => {
    const fallbackColor = pickUserColor('');
    expect(USER_PALETTE).toContain(fallbackColor);
    expect(pickUserColor('   ')).toBe(fallbackColor);
  });

  it('distribuye nombres distintos en colores de la paleta', () => {
    const nombres = ['Ana', 'Bernardo', 'Carlos', 'Diana', 'Elena', 'Fernando'];
    const colores = new Set(nombres.map(pickUserColor));
    expect(colores.size).toBeGreaterThan(1);
  });
});
