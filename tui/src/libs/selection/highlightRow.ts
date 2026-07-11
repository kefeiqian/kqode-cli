import { isSelectionEmpty, type SelectionBounds } from '@libs/selection/bounds.ts';
import { indexAtDisplayColumn } from '@libs/text/displayWidth.ts';

/** A row's content split around the selected span, for rendering the highlight. */
export type RowHighlight = { pre: string; selected: string; post: string };

/**
 * Splits a row's content `text` into the unselected prefix/suffix and the
 * selected middle for an absolute `rowIndex` and normalized selection `bounds`.
 * `markerWidth` offsets the display columns past the row's separately rendered
 * marker. Returns `null` when the row is outside the selection or the span is
 * empty. Column boundaries snap to graphemes (via `indexAtDisplayColumn`) and the
 * span is clamped to `text` — never into trailing padding — so the highlight
 * covers exactly what `selectedText` copies (keeping R4: highlight = copied range).
 */
export function rowHighlight(
  text: string,
  rowIndex: number,
  bounds: SelectionBounds,
  markerWidth: number
): RowHighlight | null {
  if (
    isSelectionEmpty(bounds) ||
    rowIndex < bounds.start.rowIndex ||
    rowIndex > bounds.end.rowIndex
  ) {
    return null;
  }

  const startColumn = rowIndex === bounds.start.rowIndex ? bounds.start.column : 0;
  const endColumn =
    rowIndex === bounds.end.rowIndex ? bounds.end.column : Number.POSITIVE_INFINITY;
  const startChar = indexAtDisplayColumn(text, Math.max(0, startColumn - markerWidth));
  const endChar = indexAtDisplayColumn(text, Math.max(0, endColumn - markerWidth));
  if (endChar <= startChar) {
    return null;
  }

  return {
    pre: text.slice(0, startChar),
    selected: text.slice(startChar, endChar),
    post: text.slice(endChar)
  };
}
