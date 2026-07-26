import { measureGraphemes } from '@libs/text/displayWidth.ts';
import { expandTabs } from '@libs/text/expandTabs.ts';

export type WrappedBodyLine = {
  text: string;
  continuesPrevious: string | undefined;
};

/** Splits hard lines and marks soft-wrap continuations for clipboard rejoining. */
export function wrapBodyLines(text: string, columns: number): WrappedBodyLine[] {
  const wrappedRows: WrappedBodyLine[] = [];
  const safeColumns = Math.max(1, columns);
  const hardLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const hardLine of hardLines) {
    const line = expandTabs(hardLine);
    if (line.length === 0) {
      wrappedRows.push({ text: '', continuesPrevious: undefined });
      continue;
    }

    let row = '';
    let rowWidth = 0;
    let continuesPrevious: string | undefined;
    for (const grapheme of measureGraphemes(line)) {
      if (row.length > 0 && rowWidth + grapheme.width > safeColumns) {
        wrappedRows.push({ text: row, continuesPrevious });
        row = '';
        rowWidth = 0;
        continuesPrevious = '';
      }
      row += grapheme.segment;
      rowWidth += grapheme.width;
    }
    wrappedRows.push({ text: row, continuesPrevious });
  }

  return wrappedRows;
}
