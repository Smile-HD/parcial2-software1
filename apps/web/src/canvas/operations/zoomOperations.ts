/**
 * Calcula el siguiente nivel de zoom garantizando cotas entre 0.2 y 4.
 */
export function computeNextZoom(currentZoom: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    return Math.min(Number((currentZoom * 1.25).toFixed(2)), 4);
  }
  return Math.max(Number((currentZoom / 1.25).toFixed(2)), 0.2);
}
