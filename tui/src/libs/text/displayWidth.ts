import stringWidth from 'string-width';

/** One grapheme cluster paired with its terminal display width in columns. */
export type MeasuredGrapheme = {
  segment: string;
  width: number;
};

const graphemeSegmenter = new Intl.Segmenter();

/**
 * Terminal display width of `text`, in columns.
 *
 * Wide East Asian characters (CJK, fullwidth forms) and most emoji occupy two
 * columns while combining marks and other zero-width clusters occupy none. This
 * wraps the same `string-width` measurement Ink uses to lay out `Text`, so the
 * composer's wrapping, padding, and cursor math stay in sync with what Ink
 * actually renders — otherwise a `.length`-based count drifts by one column per
 * wide glyph and the caret lands left of the text.
 */
export function displayWidth(text: string): number {
  return stringWidth(text);
}

/**
 * Splits `text` into grapheme clusters, each paired with its display width.
 *
 * Segmenting by grapheme (not code unit) keeps multi-code-point clusters — emoji
 * ZWJ sequences, a base character plus combining marks — intact, so a caller can
 * wrap without ever splitting a single rendered glyph across two rows.
 */
export function measureGraphemes(text: string): MeasuredGrapheme[] {
  const measured: MeasuredGrapheme[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) {
    measured.push({ segment, width: stringWidth(segment) });
  }
  return measured;
}

/**
 * Right-pads `text` with spaces until it spans `width` display columns.
 *
 * Mirrors `String.prototype.padEnd` but measures columns rather than code units,
 * so a row of wide glyphs fills exactly to the edge instead of overflowing. Text
 * already at or beyond `width` is returned unchanged (never truncated).
 */
export function padEndToWidth(text: string, width: number): string {
  const padding = width - displayWidth(text);
  return padding > 0 ? text + ' '.repeat(padding) : text;
}
