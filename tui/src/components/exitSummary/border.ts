import { maxWidth } from '@libs/text/maxWidth.ts';

const ROUNDED = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│'
} as const;

export type BoxOptions = {
  /** Horizontal padding between the border and content. Defaults to 2. */
  padding?: number;
  /**
   * Printed width of a content line. Defaults to `String.length`; pass a
   * SGR-aware measure (e.g. `visibleLength`) when content carries color escapes,
   * so the right border stays aligned.
   */
  width?: (line: string) => number;
};

/**
 * Wraps `lines` in a rounded box, padding every line to the widest so the right
 * border aligns. Padding uses the injected `width` measure, not raw string
 * length, so colored content does not shift the border.
 */
export function boxed(lines: readonly string[], options: BoxOptions = {}): string[] {
  const padding = options.padding ?? 2;
  const measure = options.width ?? ((line) => line.length);
  const inner = maxWidth(lines, measure);
  const pad = ' '.repeat(padding);
  const horizontal = ROUNDED.horizontal.repeat(inner + padding * 2);

  const body = lines.map((line) => {
    const filler = ' '.repeat(inner - measure(line));
    return `${ROUNDED.vertical}${pad}${line}${filler}${pad}${ROUNDED.vertical}`;
  });

  return [
    `${ROUNDED.topLeft}${horizontal}${ROUNDED.topRight}`,
    ...body,
    `${ROUNDED.bottomLeft}${horizontal}${ROUNDED.bottomRight}`
  ];
}
