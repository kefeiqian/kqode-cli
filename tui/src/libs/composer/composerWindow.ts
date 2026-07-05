import { clamp } from '@libs/math/clamp.ts';
import { wrapPromptText } from '@libs/composer/wrapPromptText.ts';
import type { WrappedPromptRow } from '@libs/composer/wrapPromptText.ts';

export type ComposerWindowParams = {
  text: string;
  /** Prompt input width (terminal columns minus the prompt prefix). */
  columns: number;
  maxVisibleLines: number;
  cursorIndex: number;
  /** Signed rows scrolled away from the cursor-follow baseline (+ up, - down). */
  offset?: number;
};

export type ComposerWindow = {
  /** The visible wrapped rows joined by newlines. */
  text: string;
  /** Cursor index within `text` (only meaningful when `cursorVisible`). */
  cursorIndex: number;
  /** Whether the cursor's row is inside the visible window. */
  cursorVisible: boolean;
  /** Whether the prompt overflows the visible height (cursor-independent). */
  canScroll: boolean;
  /** Most-negative offset — scrolls to the last wrapped row. */
  minOffset: number;
  /** Most-positive offset — scrolls to the first wrapped row. */
  maxOffset: number;
};

/**
 * Resolves the visible window of a (possibly scrolled) multi-line prompt.
 *
 * `offset` is a signed number of rows away from the cursor-follow baseline:
 * positive scrolls toward earlier rows (up), negative toward later rows (down),
 * and `0` reproduces the cursor-follow window. `visibleStart` is always clamped
 * into `[0, lastStart]`, so a stale offset (after a resize/edit) stays safe and
 * self-heals. `minOffset`/`maxOffset` are the clamp bounds a scroll action reuses.
 */
export function resolveComposerWindow(params: ComposerWindowParams): ComposerWindow {
  const { text, columns, maxVisibleLines, cursorIndex, offset = 0 } = params;
  const safeMaxVisibleLines = Math.max(1, maxVisibleLines);
  const rows = wrapPromptText(text, columns);
  const safeCursorIndex = clamp(cursorIndex, 0, text.length);
  // Cursor-follow baseline (slide up only when the cursor would fall below the
  // last visible row); the signed offset then shifts the window from there.
  const { visibleStart, lastStart, baseStart, cursorRowIndex } = resolveWindowBounds(
    rows,
    safeMaxVisibleLines,
    safeCursorIndex,
    offset
  );
  const visibleRows = rows.slice(visibleStart, visibleStart + safeMaxVisibleLines);

  return {
    text: visibleRows.map((row) => row.text).join('\n'),
    cursorIndex: resolveVisibleCursorIndex(visibleRows, safeCursorIndex),
    cursorVisible:
      cursorRowIndex >= visibleStart && cursorRowIndex < visibleStart + safeMaxVisibleLines,
    canScroll: rows.length > safeMaxVisibleLines,
    minOffset: baseStart - lastStart,
    maxOffset: baseStart
  };
}

/**
 * Returns the scroll offset that brings the cursor into the visible window with
 * the least movement: the current `offset` when the cursor is already visible,
 * or the offset that pins the cursor to the nearest window edge otherwise. Used
 * to keep the caret visible after an edit or navigation without snapping the
 * view to the bottom (offset `0`).
 */
export function resolveScrollIntoViewOffset(params: ComposerWindowParams): number {
  const { text, columns, maxVisibleLines, cursorIndex, offset = 0 } = params;
  const safeMaxVisibleLines = Math.max(1, maxVisibleLines);
  const rows = wrapPromptText(text, columns);
  const safeCursorIndex = clamp(cursorIndex, 0, text.length);
  const { visibleStart, baseStart, cursorRowIndex } = resolveWindowBounds(
    rows,
    safeMaxVisibleLines,
    safeCursorIndex,
    offset
  );

  if (cursorRowIndex < visibleStart) {
    return baseStart - cursorRowIndex; // above the window: pin to the top row
  }
  if (cursorRowIndex >= visibleStart + safeMaxVisibleLines) {
    return baseStart - (cursorRowIndex - safeMaxVisibleLines + 1); // below: pin to the bottom row
  }
  return offset; // already visible — keep the current view
}

/**
 * Maps a click on visible row `visibleRow` (0-based within the window) at
 * `column` (0-based within that row's text) to the resulting cursor `index` and
 * the scroll `offset` that keeps the current visible window fixed — so clicking
 * repositions the caret without scrolling the composer. Returns `null` when the
 * click lands outside the visible wrapped rows.
 */
export function resolveClickResult(
  params: ComposerWindowParams & { visibleRow: number; column: number }
): { index: number; offset: number } | null {
  const { text, columns, maxVisibleLines, cursorIndex, offset = 0, visibleRow, column } = params;
  const safeMaxVisibleLines = Math.max(1, maxVisibleLines);
  if (visibleRow < 0 || visibleRow >= safeMaxVisibleLines) {
    return null;
  }

  const rows = wrapPromptText(text, columns);
  const safeCursorIndex = clamp(cursorIndex, 0, text.length);
  const { visibleStart, lastStart } = resolveWindowBounds(
    rows,
    safeMaxVisibleLines,
    safeCursorIndex,
    offset
  );
  const targetRowIndex = visibleStart + visibleRow;
  if (targetRowIndex >= rows.length) {
    return null;
  }

  const row = rows[targetRowIndex];
  const index = row.start + Math.min(Math.max(0, column), row.end - row.start);
  // Keep the window fixed: reproduce the current visibleStart against the NEW
  // cursor's follow baseline. Resolve the cursor row the same way
  // resolveComposerWindow does — at a soft-wrap boundary `index === row.start ===
  // previousRow.end` resolves to the earlier row — so the two agree and the
  // window does not shift.
  const baseStart = clamp(
    resolveCursorRowIndex(rows, index) - safeMaxVisibleLines + 1,
    0,
    lastStart
  );
  return { index, offset: baseStart - visibleStart };
}

function resolveWindowBounds(
  rows: WrappedPromptRow[],
  safeMaxVisibleLines: number,
  cursorIndex: number,
  offset: number
): { visibleStart: number; lastStart: number; baseStart: number; cursorRowIndex: number } {
  const cursorRowIndex = resolveCursorRowIndex(rows, cursorIndex);
  const lastStart = Math.max(0, rows.length - safeMaxVisibleLines);
  const baseStart = clamp(cursorRowIndex - safeMaxVisibleLines + 1, 0, lastStart);
  const visibleStart = clamp(baseStart - offset, 0, lastStart);
  return { visibleStart, lastStart, baseStart, cursorRowIndex };
}

function resolveCursorRowIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  return Math.max(
    0,
    rows.findIndex((row) => cursorIndex >= row.start && cursorIndex <= row.end)
  );
}

export type VerticalDirection = 'up' | 'down';

/**
 * The cursor index one visual row up or down from `cursorIndex`, preserving the
 * visual column (clamped to the target row's length). Returns `null` when there
 * is no visual row that direction (first/last row, or a single-row prompt) — the
 * caller treats that as a no-op, leaving a seam for future history traversal.
 */
export function resolveVerticalCursorIndex(
  text: string,
  columns: number,
  cursorIndex: number,
  direction: VerticalDirection
): number | null {
  const rows = wrapPromptText(text, columns);
  const safeCursorIndex = clamp(cursorIndex, 0, text.length);
  const currentRow = resolveCursorRowIndex(rows, safeCursorIndex);
  const targetRow = currentRow + (direction === 'up' ? -1 : 1);
  if (targetRow < 0 || targetRow >= rows.length) {
    return null;
  }

  const column = safeCursorIndex - rows[currentRow].start;
  const target = rows[targetRow];
  return target.start + Math.min(column, target.end - target.start);
}

function resolveVisibleCursorIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  let visibleCursorIndex = 0;

  for (const row of rows) {
    if (cursorIndex >= row.start && cursorIndex <= row.end) {
      return visibleCursorIndex + Math.min(row.text.length, cursorIndex - row.start);
    }

    visibleCursorIndex += row.text.length + 1;
  }

  return Math.max(0, visibleCursorIndex - 1);
}
