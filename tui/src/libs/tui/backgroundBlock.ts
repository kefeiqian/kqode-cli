export const LOWER_HALF_BLOCK = '▄';
export const UPPER_HALF_BLOCK = '▀';

export type HalfLineEdge = 'top' | 'bottom';

/** Glyph orientation for inverse-colored half-lines, with a monochrome fallback. */
export function resolveHalfLineGlyph(edge: HalfLineEdge, supportsColor: boolean): string {
  if (supportsColor) {
    return edge === 'top' ? UPPER_HALF_BLOCK : LOWER_HALF_BLOCK;
  }
  return edge === 'top' ? LOWER_HALF_BLOCK : UPPER_HALF_BLOCK;
}
