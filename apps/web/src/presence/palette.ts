/**
 * Paleta de colores para presencia y colaboración en tiempo real (realtime:R5).
 * Colores modernos y contrastados estilo Figma / Excalidraw.
 */
export const USER_PALETTE = [
  '#0284c7', // Cielo
  '#059669', // Esmeralda
  '#7c3aed', // Púrpura
  '#ea580c', // Coral / Naranja
  '#e11d48', // Rosa
  '#d97706', // Ámbar
  '#0d9488', // Turquesa
  '#4f46e5', // Índigo
] as const;

/**
 * Calcula un hash numérico determinista a partir de una cadena y devuelve
 * un color consistente dentro de la paleta.
 */
export function pickUserColor(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return USER_PALETTE[0];
  }

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i);
    hash |= 0; // Convertir a entero de 32 bits
  }

  const index = Math.abs(hash) % USER_PALETTE.length;
  return USER_PALETTE[index]!;
}
