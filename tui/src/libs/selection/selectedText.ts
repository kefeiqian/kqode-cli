import { isSelectionEmpty, selectionBounds, type SelectionPoint } from '@libs/selection/bounds.ts';
import { displayWidth, indexAtDisplayColumn } from '@libs/text/displayWidth.ts';
import type { BodyRow } from '@libs/tui/bodyRows.ts';

const TRAILING_WHITESPACE = /\s+$/;

/**
 * Reconstructs the clean logical text of a selection over the wrapped body rows.
 *
 * Reads each row's `text` (never the rendered cells), so KQode chrome — the
 * per-row scrollbar glyph and reserved gutter, painted separately at render —
 * and the full-width background padding are excluded by construction. Rows
 * flagged `decorative` (the user message-bubble half-block edges, whose `text`
 * is pure `▄`/`▀` chrome) are skipped entirely so those block glyphs never reach
 * the clipboard. A row's leading `marker` (assistant `•`, list prefixes) is a
 * separate render element, so selection columns are offset past it. Soft-wrapped
 * rows (`continuesPrevious`) rejoin into one logical line, and trailing
 * whitespace is trimmed per line. Columns map to grapheme boundaries via
 * `indexAtDisplayColumn`, so wide (CJK) and multi-code-point (emoji) glyphs are
 * never split.
 */
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
    if (row === undefined) {
      continue;
    }

    // Decorative chrome rows (message-bubble half-block edges) hold display-only
    // glyphs in `text`; skip them so they contribute neither glyphs nor a blank
    // line to the copied selection.
    if (row.decorative === true) {
      continue;
    }

    const markerWidth = displayWidth(row.marker ?? '');
    const startColumn = rowIndex === bounds.start.rowIndex ? bounds.start.column : 0;
    const endColumn =
      rowIndex === bounds.end.rowIndex ? bounds.end.column : Number.POSITIVE_INFINITY;
    const startChar = indexAtDisplayColumn(row.text, Math.max(0, startColumn - markerWidth));
    const endChar = indexAtDisplayColumn(row.text, Math.max(0, endColumn - markerWidth));
    const fragment = row.text.slice(startChar, endChar);

    if (row.continuesPrevious !== undefined && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += row.continuesPrevious + fragment;
    } else {
      logicalLines.push(fragment);
    }
  }

  return logicalLines.map((line) => line.replace(TRAILING_WHITESPACE, '')).join('\n');
}
