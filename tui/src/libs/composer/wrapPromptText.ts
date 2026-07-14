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
 * logical line is chunked every `columns` characters. An empty prompt yields a
 * single empty row. Pass the prompt's input width (terminal columns minus the
 * prompt prefix) so wrapping matches what the composer renders.
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

    if (line.length === 0) {
      rows.push({ text: '', start: lineStart, end: lineStart });
    } else {
      for (let offset = 0; offset < line.length; offset += safeColumns) {
        const endOffset = Math.min(offset + safeColumns, line.length);
        rows.push({
          text: line.slice(offset, endOffset),
          start: lineStart + offset,
          end: lineStart + endOffset
        });
      }
    }

    if (newlineIndex < 0) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return rows;
}
