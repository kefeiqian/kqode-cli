import stringWidth from 'string-width';

/** One grapheme cluster paired with its terminal display width in columns. */
export type MeasuredGrapheme = {
  segment: string;
  width: number;
  start: number;
  end: number;
};

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Terminal display width of `text`, using the same measurement as Ink. */
export function displayWidth(text: string): number {
  return stringWidth(text);
}

/** Splits `text` into grapheme clusters with source offsets and display widths. */
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

/** Right-pads `text` to `width` display columns without truncating it. */
export function padEndToWidth(text: string, width: number): string {
  const padding = width - displayWidth(text);
  return padding > 0 ? text + ' '.repeat(padding) : text;
}

/** Truncates `text` to complete graphemes fitting within `width` columns. */
export function truncateToWidth(text: string, width: number): string {
  const safeWidth = Math.max(0, width);
  let usedWidth = 0;
  let end = 0;
  for (const grapheme of measureGraphemes(text)) {
    if (usedWidth + grapheme.width > safeWidth) {
      break;
    }
    usedWidth += grapheme.width;
    end = grapheme.end;
  }
  return text.slice(0, end);
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
  for (const grapheme of measureGraphemes(text)) {
    if (safeIndex < grapheme.end) {
      return grapheme.end;
    }
  }
  return text.length;
}

/** Clamps `index` to the preceding grapheme boundary. */
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

/** Grapheme boundary at display `column` within `text`. */
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
