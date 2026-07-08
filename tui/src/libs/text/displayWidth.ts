import stringWidth from 'string-width';

/** One grapheme cluster paired with its terminal display width in columns. */
export type MeasuredGrapheme = {
  segment: string;
  width: number;
  start: number;
  end: number;
};

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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
  let start = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const end = start + segment.length;
    measured.push({ segment, width: stringWidth(segment), start, end });
    start = end;
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

/** Previous grapheme boundary at or before `index`. */
export function previousGraphemeStart(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  if (safeIndex === 0) {
    return 0;
  }

  let previousEnd = 0;
  for (const grapheme of measureGraphemes(text)) {
    if (safeIndex <= grapheme.start) {
      return previousEnd;
    }
    if (safeIndex <= grapheme.end) {
      return grapheme.start;
    }
    previousEnd = grapheme.end;
  }

  return previousEnd;
}

/** Next grapheme boundary at or after `index`. */
export function nextGraphemeEnd(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  if (safeIndex >= text.length) {
    return text.length;
  }

  for (const grapheme of measureGraphemes(text)) {
    if (safeIndex < grapheme.end) {
      return grapheme.end;
    }
  }

  return text.length;
}

/** Clamps `index` into `[0, text.length]`, then snaps back to a grapheme boundary. */
export function clampToGraphemeBoundary(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length));

  if (safeIndex === 0 || safeIndex === text.length) {
    return safeIndex;
  }

  for (const grapheme of measureGraphemes(text)) {
    if (safeIndex === grapheme.start || safeIndex === grapheme.end) {
      return safeIndex;
    }
    if (safeIndex < grapheme.end) {
      return grapheme.start;
    }
  }

  return safeIndex;
}

/** Display columns occupied before `index` within `text`. */
export function displayWidthBeforeIndex(text: string, index: number): number {
  const safeIndex = clampToGraphemeBoundary(text, index);
  let width = 0;

  for (const grapheme of measureGraphemes(text)) {
    if (safeIndex <= grapheme.start) {
      break;
    }
    width += grapheme.width;
    if (safeIndex === grapheme.end) {
      break;
    }
  }

  return width;
}

/**
 * Grapheme boundary at display `column` within `text`.
 *
 * A click that lands inside a multi-column grapheme resolves to the boundary
 * before that grapheme rather than splitting it.
 */
export function indexAtDisplayColumn(text: string, column: number): number {
  const safeColumn = Math.max(0, column);
  let width = 0;

  for (const grapheme of measureGraphemes(text)) {
    if (safeColumn <= width) {
      return grapheme.start;
    }

    const nextWidth = width + grapheme.width;
    if (safeColumn < nextWidth) {
      return grapheme.start;
    }
    if (safeColumn === nextWidth) {
      return grapheme.end;
    }

    width = nextWidth;
  }

  return text.length;
}
