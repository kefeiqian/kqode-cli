import { clamp } from '@libs/math/clamp.ts';
import { resolveBodyRows, type BodyEntry, type BodyRow } from '@libs/tui/bodyRows.ts';

export type BodyRowWindow = {
  allRows: BodyRow[];
  startIndex: number;
  visibleRows: BodyRow[];
};

/** Resolves the wrapped body rows and visible scroll window from shared inputs. */
export function resolveBodyRowWindow(
  entries: readonly BodyEntry[],
  columns: number,
  rows: number,
  scrollOffsetRows: number
): BodyRowWindow {
  const visibleRows = Math.max(1, rows);
  const allRows = resolveBodyRows(entries, Math.max(1, columns), visibleRows);
  const maxScrollOffset = Math.max(0, allRows.length - visibleRows);
  const scrollOffset = clamp(scrollOffsetRows, 0, maxScrollOffset);
  const end = allRows.length - scrollOffset;
  const startIndex = Math.max(0, end - visibleRows);

  return {
    allRows,
    startIndex,
    visibleRows: allRows.slice(startIndex, end)
  };
}
