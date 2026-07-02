/**
 * Constrains `value` to the inclusive `[min, max]` range.
 *
 * Assumes `min <= max`; if they are inverted the upper bound wins (returns `max`).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
