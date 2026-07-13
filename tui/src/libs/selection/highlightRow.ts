import { isSelectionEmpty, type SelectionBounds } from '@libs/selection/bounds.ts';
import type { RenderedStyledSegment } from '@libs/markdown/types.ts';
import { displayWidth, indexAtDisplayColumn } from '@libs/text/displayWidth.ts';

/** A row's content split around the selected span, for rendering the highlight. */
export type RowHighlight = { pre: string; selected: string; post: string };
export type RowHighlightedSegment = RenderedStyledSegment & { selected: boolean };

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

/**
 * Splits styled row segments into selected and unselected pieces while keeping
 * each segment's visual style. Selection columns use the same marker offset and
 * grapheme boundary rules as `rowHighlight`.
 */
export function rowSegmentHighlights(
  segments: readonly RenderedStyledSegment[],
  rowIndex: number,
  bounds: SelectionBounds,
  markerWidth: number
): RowHighlightedSegment[] | null {
  if (
    isSelectionEmpty(bounds) ||
    rowIndex < bounds.start.rowIndex ||
    rowIndex > bounds.end.rowIndex
  ) {
    return null;
  }

  const selectedStart =
    rowIndex === bounds.start.rowIndex ? Math.max(0, bounds.start.column - markerWidth) : 0;
  const selectedEnd =
    rowIndex === bounds.end.rowIndex
      ? Math.max(0, bounds.end.column - markerWidth)
      : Number.POSITIVE_INFINITY;
  const highlighted: RowHighlightedSegment[] = [];
  let segmentStartColumn = 0;
  let hasSelectedSegment = false;

  for (const segment of segments) {
    const segmentWidth = displayWidth(segment.text);
    const segmentEndColumn = segmentStartColumn + segmentWidth;
    const overlapStart = Math.max(selectedStart, segmentStartColumn);
    const overlapEnd = Math.min(selectedEnd, segmentEndColumn);

    if (overlapEnd <= overlapStart) {
      pushHighlightedSegment(highlighted, segment, segment.text, false);
      segmentStartColumn = segmentEndColumn;
      continue;
    }

    const startChar = indexAtDisplayColumn(segment.text, overlapStart - segmentStartColumn);
    const endChar = indexAtDisplayColumn(segment.text, overlapEnd - segmentStartColumn);

    pushHighlightedSegment(highlighted, segment, segment.text.slice(0, startChar), false);
    if (endChar > startChar) {
      pushHighlightedSegment(highlighted, segment, segment.text.slice(startChar, endChar), true);
      hasSelectedSegment = true;
    }
    pushHighlightedSegment(highlighted, segment, segment.text.slice(endChar), false);
    segmentStartColumn = segmentEndColumn;
  }

  return hasSelectedSegment ? highlighted : null;
}

function pushHighlightedSegment(
  target: RowHighlightedSegment[],
  segment: RenderedStyledSegment,
  text: string,
  selected: boolean
): void {
  if (text.length === 0) {
    return;
  }

  target.push({ ...segment, selected, text });
}
