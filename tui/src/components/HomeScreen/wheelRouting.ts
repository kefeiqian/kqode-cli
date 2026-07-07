import { isInsideSafeChromeBounds } from '@libs/tui/safeCanvas.ts';

export type WheelTarget = 'composer' | 'body' | 'none';

/**
 * Whether the wheel pointer (1-based SGR `mouseRow`) sits over the composer
 * block. `composerTop` is the composer block's 0-based top row (the top
 * half-line); the block spans down to but not including the status row
 * (`rows - 1`). SGR rows are 1-based, so `mouseRow - 1` maps onto layout rows.
 */
export function isPointerOverComposer(
  mouseRow: number,
  composerTop: number,
  rows: number
): boolean {
  const pointerRow = mouseRow - 1;
  return pointerRow >= composerTop && pointerRow < rows - 1;
}

/**
 * Routes a wheel notch to the pane under the pointer. The composer wins only
 * when the pointer is over it AND it can actually scroll. Pointer positions
 * outside the safe canvas are ignored so guard-space input does not affect
 * body or composer state; other in-canvas rows default to the body.
 */
export function resolveWheelTarget(params: {
  mouseRow: number;
  mouseColumn: number;
  composerTop: number;
  rows: number;
  columns: number;
  composerCanScroll: boolean;
}): WheelTarget {
  const { mouseRow, mouseColumn, composerTop, rows, columns, composerCanScroll } = params;
  if (!isInsideSafeChromeBounds({ row: mouseRow, column: mouseColumn, rows, columns })) {
    return 'none';
  }
  return composerCanScroll && isPointerOverComposer(mouseRow, composerTop, rows)
    ? 'composer'
    : 'body';
}
