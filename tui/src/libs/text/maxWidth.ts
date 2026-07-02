/**
 * The width of the widest line, measured by `measure` (raw `.length` by
 * default). Returns 0 for an empty list.
 *
 * Pass an SGR-aware `measure` (e.g. `visibleLength`) when lines carry ANSI color
 * escapes so the width reflects printed columns rather than raw characters.
 */
export function maxWidth(
  lines: readonly string[],
  measure: (line: string) => number = (line) => line.length
): number {
  return lines.reduce((max, line) => Math.max(max, measure(line)), 0);
}
