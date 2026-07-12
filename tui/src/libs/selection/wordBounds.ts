import { measureGraphemes } from '@libs/text/displayWidth.ts';

/** A half-open display-column span `[start, end)` of a run within a row. */
export type ColumnSpan = { start: number; end: number };

const WHITESPACE = /^\s+$/;

/**
 * Returns the display-column span `[start, end)` of the whitespace-delimited word
 * containing display `column` in `text`, or `null` when the column sits on
 * whitespace or past the end of the row.
 *
 * A "word" is whitespace-delimited so a file path or URL selects as one unit,
 * matching Claude Code's and iTerm2's path-as-one-unit behavior. Columns map to
 * grapheme boundaries, so wide (CJK) and multi-code-point (emoji) glyphs are
 * never split across the span edges.
 */
export function wordBounds(text: string, column: number): ColumnSpan | null {
  const cells = measureColumns(text);
  const index = cells.findIndex((cell) => column >= cell.start && column < cell.end);
  if (index === -1 || cells[index].whitespace) {
    return null;
  }

  let startIndex = index;
  while (startIndex > 0 && !cells[startIndex - 1].whitespace) {
    startIndex -= 1;
  }
  let endIndex = index;
  while (endIndex < cells.length - 1 && !cells[endIndex + 1].whitespace) {
    endIndex += 1;
  }

  return { start: cells[startIndex].start, end: cells[endIndex].end };
}

type MeasuredCell = { start: number; end: number; whitespace: boolean };

/** Splits `text` into grapheme cells tagged with their display-column span. */
function measureColumns(text: string): MeasuredCell[] {
  const cells: MeasuredCell[] = [];
  let column = 0;
  for (const grapheme of measureGraphemes(text)) {
    const end = column + grapheme.width;
    cells.push({ start: column, end, whitespace: WHITESPACE.test(grapheme.segment) });
    column = end;
  }
  return cells;
}
