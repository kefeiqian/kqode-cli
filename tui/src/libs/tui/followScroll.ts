import { clamp } from '@libs/math/clamp.ts';

/**
 * Resolves the transcript body scroll offset after the transcript grows (or
 * shrinks) — e.g. while an assistant reply streams in. Offsets count wrapped
 * rows back from the newest content, so `0` is pinned to the bottom (see
 * `resolveBodyRowWindow`).
 *
 * While the viewport is pinned to the bottom (`previousOffset <= 0`) it keeps
 * following the newest output. Once the reader has scrolled up
 * (`previousOffset > 0`) the viewport is anchored to the same rows by absorbing
 * the rows appended below it — the growth in the maximum offset — so streaming
 * never yanks the reader back to the end. The result is clamped to the new
 * `[0, nextMaxOffset]` scroll range.
 */
export function resolveFollowScrollOffset({
  previousOffset,
  previousMaxOffset,
  nextMaxOffset
}: {
  previousOffset: number;
  previousMaxOffset: number;
  nextMaxOffset: number;
}): number {
  if (previousOffset <= 0) {
    return 0;
  }

  const appendedRows = nextMaxOffset - previousMaxOffset;
  return clamp(previousOffset + appendedRows, 0, nextMaxOffset);
}
