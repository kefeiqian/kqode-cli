import {
  isSelectionEmpty,
  type SelectionBounds
} from '@libs/selection/bounds.ts';
import { indexAtDisplayColumn } from '@libs/text/displayWidth.ts';

export type RowSelectionSpan = {
  endChar: number;
  startChar: number;
};

/** Maps normalized selection columns onto source-string indexes for one row. */
export function rowSelectionSpan(
  text: string,
  rowIndex: number,
  bounds: SelectionBounds,
  markerWidth: number
): RowSelectionSpan | null {
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

  return {
    startChar: indexAtDisplayColumn(text, Math.max(0, startColumn - markerWidth)),
    endChar: indexAtDisplayColumn(text, Math.max(0, endColumn - markerWidth))
  };
}
