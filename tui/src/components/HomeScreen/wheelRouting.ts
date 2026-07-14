export type WheelTarget = 'composer' | 'body';

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
 * when the pointer is over it AND it can actually scroll; every other case —
 * header/spacer/cwd/status rows, a non-scrollable composer, or an
 * out-of-range row — defaults to the body, so no notch is ever dropped.
 */
export function resolveWheelTarget(params: {
  mouseRow: number;
  composerTop: number;
  rows: number;
  composerCanScroll: boolean;
}): WheelTarget {
  const { mouseRow, composerTop, rows, composerCanScroll } = params;
  return composerCanScroll && isPointerOverComposer(mouseRow, composerTop, rows)
    ? 'composer'
    : 'body';
}
