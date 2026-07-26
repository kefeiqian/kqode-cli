import { isSelectionEmpty, selectionBounds, type SelectionPoint } from '@libs/selection/bounds.ts';
import { rowSelectionSpan } from '@libs/selection/rowSpan.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import type { BodyRow } from '@libs/tui/bodyRows.ts';

/** Reconstructs clean logical text from a transcript selection. */
export function selectedText(
  allRows: readonly BodyRow[],
  anchor: SelectionPoint,
  focus: SelectionPoint
): string {
  const bounds = selectionBounds(anchor, focus);
  if (isSelectionEmpty(bounds)) {
    return '';
  }

  const logicalLines: string[] = [];
  for (let rowIndex = bounds.start.rowIndex; rowIndex <= bounds.end.rowIndex; rowIndex += 1) {
    const row = allRows[rowIndex];
    if (row === undefined || row.decorative === true) {
      continue;
    }

    const markerWidth = displayWidth(row.marker ?? '');
    const span = rowSelectionSpan(row.text, rowIndex, bounds, markerWidth);
    if (span === null) {
      continue;
    }
    const fragment = row.text.slice(span.startChar, span.endChar);

    if (row.continuesPrevious !== undefined && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += row.continuesPrevious + fragment;
    } else {
      logicalLines.push(fragment);
    }
  }

  return logicalLines.join('\n');
}
