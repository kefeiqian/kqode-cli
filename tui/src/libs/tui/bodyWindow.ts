import { clamp } from '@libs/math/clamp.ts';
import { resolveBodyRows } from '@libs/tui/bodyRows.ts';
import type { BodyEntry, BodyRow } from '@libs/tui/bodyRows.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

/** The wrapped transcript rows plus the window currently visible in the viewport. */
export type BodyRowWindow = {
  /** Every wrapped row for the transcript, oldest first. */
  allRows: BodyRow[];
  /** Absolute index into `allRows` of the first visible row. */
  startIndex: number;
  /** The rows currently on screen (`allRows[startIndex .. startIndex + visibleRows]`). */
  visibleRows: BodyRow[];
};

/**
 * Resolves the wrapped transcript rows and the visible window for a given scroll
 * offset, mirroring the slice `BodyPane` renders so mouse-selection coordinates
 * and the on-screen highlight map to the same rows. `scrollOffsetRows` counts
 * back from the newest content at the bottom (`0` = pinned to bottom), matching
 * `bodyScrollOffsetRowsAtom`.
 */
export function resolveBodyRowWindow(
  entries: readonly BodyEntry[],
  columns: number,
  rows: number,
  scrollOffsetRows: number,
  theme: ThemeDefinition
): BodyRowWindow {
  const visibleRowCount = Math.max(1, rows);
  const visibleColumns = Math.max(1, columns);
  const allRows = resolveBodyRows(entries, visibleColumns, visibleRowCount, theme);
  const maxScrollOffset = Math.max(0, allRows.length - visibleRowCount);
  const scrollOffset = clamp(scrollOffsetRows, 0, maxScrollOffset);
  const end = allRows.length - scrollOffset;
  const startIndex = Math.max(0, end - visibleRowCount);
  return { allRows, startIndex, visibleRows: allRows.slice(startIndex, end) };
}
