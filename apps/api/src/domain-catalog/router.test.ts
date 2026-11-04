import { describe, it, expect } from 'vitest';
import { matchCanonicalDomain, formatDomainGroundingPrompt } from './router.js';

describe('Domain Catalog In-Memory Router (RAG Tier 1)', () => {
  it('identifica correctamente el dominio de veterinaria en español', () => {
    const result = matchCanonicalDomain('necesito modelar un sistema para una veterinaria con mascotas y vacunas');
    expect(result).not.toBeNull();
    expect(result?.domain.id).toBe('veterinary_clinic');
    expect(result?.matchedKeywords).toContain('veterinaria');
  });

  it('identifica e-commerce tanto en español como en inglés', () => {
    const resEs = matchCanonicalDomain('crear diagrama de tienda online con carrito y pedidos');
    expect(resEs?.domain.id).toBe('ecommerce_store');

    const resEn = matchCanonicalDomain('build an ecommerce store with cart and checkout');
    expect(resEn?.domain.id).toBe('ecommerce_store');

    const resSingleM = matchCanonicalDomain('creame una base de datos de ecomerce de perfumes');
    expect(resSingleM?.domain.id).toBe('ecommerce_store');
  });

  it('identifica reservas de hotel y hospital', () => {
    const resHotel = matchCanonicalDomain('sistema de reservas de hotel con habitaciones');
    expect(resHotel?.domain.id).toBe('hotel_reservation');

    const resHosp = matchCanonicalDomain('gestion de hospital con medicos y citas');
    expect(resHosp?.domain.id).toBe('hospital_clinic');
  });

  it('retorna null cuando la consulta es genérica o irrelevante', () => {
    const result = matchCanonicalDomain('hola que tal como estas');
    expect(result).toBeNull();
  });

  it('ejecuta 1.000 búsquedas en menos de 500 milisegundos (< 0.5 ms por búsqueda)', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      matchCanonicalDomain('quiero diseñar una universidad con cursos y estudiantes');
    }
    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(500); // Promedio < 0.5ms por búsqueda (objetivo del plan: < 1ms)
  });

  it('formatea el prompt de grounding con clases, atributos y relaciones', () => {
    const match = matchCanonicalDomain('veterinaria');
    expect(match).not.toBeNull();
    if (!match) return;

    const promptEs = formatDomainGroundingPrompt(match.domain, false);
    expect(promptEs).toContain('ARQUITECTURA CANÓNICA EXPERTA');
    expect(promptEs).toContain('Mascota');
    expect(promptEs).toContain('ConsultaVeterinaria');
    expect(promptEs).toContain('fecha: date');
    expect(promptEs).toContain('Relaciones:');

    const promptEn = formatDomainGroundingPrompt(match.domain, true);
    expect(promptEn).toContain('EXPERT CANONICAL BLUEPRINT');
    expect(promptEn).toContain('Mascota');
  });

  it('evalua tolerancia a faltas ortograficas y typos en ingles y espanol', () => {
    // 1. Tildes, diacríticos y mayúsculas
    const resTildes = matchCanonicalDomain('CLÍNICA MÉDICA Y CIRUGÍA');
    expect(resTildes).not.toBeNull();
    expect(resTildes?.domain.id).toBe('hospital_clinic');

    // 2. Errores tipográficos en español (falta de letras / distancia de Levenshtein <= 2)
    const resTypoEs = matchCanonicalDomain('quiero diseñar una vetrinaria');
    expect(resTypoEs).not.toBeNull();
    expect(resTypoEs?.domain.id).toBe('veterinary_clinic');

    // 3. Errores tipográficos en inglés
    const resTypoEn = matchCanonicalDomain('build an ecommerce stor with chekout');
    expect(resTypoEn).not.toBeNull();
    expect(resTypoEn?.domain.id).toBe('ecommerce_store');
  });
});
