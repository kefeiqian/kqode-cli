import type { SelectionBounds } from '@libs/selection/bounds.ts';
import { rowSelectionSpan } from '@libs/selection/rowSpan.ts';

/** A row split around its selected display-column span. */
export type RowHighlight = { pre: string; selected: string; post: string };

/** Resolves the highlighted text span for one absolute body row. */
export function rowHighlight(
  text: string,
  rowIndex: number,
  bounds: SelectionBounds,
  markerWidth: number
): RowHighlight | null {
  const span = rowSelectionSpan(text, rowIndex, bounds, markerWidth);
  if (span === null || span.endChar <= span.startChar) {
    return null;
  }

  return {
    pre: text.slice(0, span.startChar),
    selected: text.slice(span.startChar, span.endChar),
    post: text.slice(span.endChar)
  };
}
