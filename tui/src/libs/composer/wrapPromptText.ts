import { measureGraphemes } from '@libs/text/displayWidth.ts';

/** One wrapped visual row of the prompt, with its source index range. */
export type WrappedPromptRow = {
  text: string;
  start: number;
  end: number;
};

// Single-slot memo: the prompt is re-wrapped several times per keystroke (the
// render window, the scroll-into-view effect, and the scroll atoms), always for
// the current text and width. Caching the last result — compared with `===`
// (value equality, with V8's same-string-object fast path) rather than a Map
// hash — collapses those into a single wrap. Callers never mutate the returned
// rows, so sharing the cached array is safe.
let cachedText: string | undefined;
let cachedColumns = -1;
let cachedRows: WrappedPromptRow[] | undefined;

/**
 * Splits `text` into visual rows: authored newlines start new rows, and each
 * logical line is wrapped so no row's display width exceeds `columns`. An empty
 * prompt yields a single empty row. Pass the prompt's input width (terminal
 * columns minus the prompt prefix) so wrapping matches what the composer renders.
 *
 * Width is measured in terminal columns, so a wide glyph (CJK, fullwidth, emoji)
 * counts as two — a run of them wraps at half the character count, matching Ink.
 *
 * The last `(text, columns)` result is memoized, so the repeated wraps of the
 * current prompt within a keystroke reuse one computation.
 */
export function wrapPromptText(text: string, columns: number): WrappedPromptRow[] {
  const safeColumns = Math.max(1, columns);
  if (cachedRows !== undefined && cachedText === text && cachedColumns === safeColumns) {
    return cachedRows;
  }

  const rows = computeWrappedPromptRows(text, safeColumns);
  cachedText = text;
  cachedColumns = safeColumns;
  cachedRows = rows;
  return rows;
}

/** Number of visual rows `text` wraps into at `columns` width. */
export function countWrappedPromptRows(text: string, columns: number): number {
  return wrapPromptText(text, columns).length;
}

function computeWrappedPromptRows(text: string, safeColumns: number): WrappedPromptRow[] {
  if (text.length === 0) {
    return [{ text: '', start: 0, end: 0 }];
  }

  const rows: WrappedPromptRow[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex < 0 ? text.length : newlineIndex;
    const rawLine = text.slice(lineStart, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    appendLineRows(rows, line, lineStart, safeColumns);

    if (newlineIndex < 0) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return rows;
}

/**
 * Appends the wrapped rows of a single logical `line` (no newlines) so each
 * row's display width stays within `safeColumns`. A wide grapheme that cannot
 * fit the remaining columns starts the next row rather than being split, matching
 * how terminals shift a double-width glyph past a one-column gap. `lineStart` is
 * the line's offset within the source text and anchors each row's index range.
 */
function appendLineRows(
  rows: WrappedPromptRow[],
  line: string,
  lineStart: number,
  safeColumns: number
): void {
  if (line.length === 0) {
    rows.push({ text: '', start: lineStart, end: lineStart });
    return;
  }

  let rowStart = 0;
  let offset = 0;
  let rowWidth = 0;

  for (const { segment, width } of measureGraphemes(line)) {
    if (rowWidth + width > safeColumns && offset > rowStart) {
      rows.push(rowSlice(line, lineStart, rowStart, offset));
      rowStart = offset;
      rowWidth = 0;
    }
    rowWidth += width;
    offset += segment.length;
  }

  rows.push(rowSlice(line, lineStart, rowStart, offset));
}

function rowSlice(
  line: string,
  lineStart: number,
  start: number,
  end: number
): WrappedPromptRow {
  return {
    text: line.slice(start, end),
    start: lineStart + start,
    end: lineStart + end
  };
}

