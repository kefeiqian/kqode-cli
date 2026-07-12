import type { createStore } from 'jotai';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import { clamp } from '@libs/math/clamp.ts';
import { classifyClick, type PressRecord } from '@libs/selection/multiClick.ts';
import { wordBounds } from '@libs/selection/wordBounds.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import type { BodyRow } from '@libs/tui/bodyRows.ts';
import type { MouseButtonEvent } from '@libs/terminal/mouse.ts';
import {
  activeDockedPanelAtom,
  bodyTopAtom,
  type BodySelection,
  composerTopAtom,
  layoutAtom,
  rowsAtom,
  setBodySelectionRangeAtom,
  startBodySelectionAtom,
  updateBodySelectionAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

/** The home-screen region a left-button gesture belongs to. */
export type GestureRegion = 'body' | 'composer';

/**
 * Resolves which region a left press at 1-based SGR `row` belongs to, or `null`
 * when it lands on inert chrome (header, spacer, cwd, status) or while a docked
 * panel owns the screen. The body spans `[bodyTop, bodyTop + bodyRows)` and the
 * composer block spans `[composerTop, rows - 1)` in Ink's zero-based rows; SGR
 * rows are 1-based, so `row - 1` maps onto them (mirrors `bodyTopAtom` and
 * `composerTopAtom`). The caller records the owning region at press time so a
 * drag that wanders out of its region still routes to the gesture that began.
 */
export function resolveGestureRegion(store: Store, row: number): GestureRegion | null {
  if (store.get(activeDockedPanelAtom) !== null) {
    return null;
  }

  const pointerRow = row - 1;
  const bodyTop = store.get(bodyTopAtom);
  const bodyRows = store.get(layoutAtom).bodyRows;
  if (pointerRow >= bodyTop && pointerRow < bodyTop + bodyRows) {
    return 'body';
  }

  const composerTop = store.get(composerTopAtom);
  if (pointerRow >= composerTop && pointerRow < store.get(rowsAtom) - 1) {
    return 'composer';
  }

  return null;
}

/**
 * Per-session multi-click state threaded through {@link handleSelectionGesture}:
 * the previous press (so a new one can be classified as single/double/triple) and
 * whether the current selection is locked to fixed word/line bounds. The caller
 * owns this (a ref) and this module mutates it.
 */
export type SelectionGestureState = {
  lastPress: PressRecord | null;
  boundsLocked: boolean;
};

/** A fresh, empty multi-click state for a new session. */
export function createSelectionGestureState(): SelectionGestureState {
  return { lastPress: null, boundsLocked: false };
}

/** Multi-click context: the mutable state plus an injected clock for classification. */
export type MultiClickContext = {
  state: SelectionGestureState;
  now: () => number;
};

/**
 * Maps an SGR mouse gesture (1-based screen coordinates) to a selection point in
 * absolute body-row space, then drives the in-app selection: `press` starts it,
 * `drag` extends the focus, `release` extends and copies. The point is clamped to
 * the visible body window, so a drag past the viewport edges selects to the
 * nearest on-screen row rather than escaping the transcript.
 *
 * When a {@link MultiClickContext} is supplied, a press is classified against the
 * previous one: a double-click selects the whitespace-delimited word under the
 * pointer and a triple-click the whole rendered line, both locking the bounds so
 * the trailing release only copies (a plain release would drag the focus back to
 * the pointer and copy a partial word). Without the context, every press is a
 * single click.
 */
export function handleSelectionGesture(
  store: Store,
  gesture: MouseButtonEvent,
  multiClick?: MultiClickContext
): void {
  const { allRows, startIndex, visibleRows } = store.get(visibleBodyRowsAtom);
  if (visibleRows.length === 0) {
    return;
  }

  const bodyTop = store.get(bodyTopAtom);
  const viewportRow = clamp(gesture.row - 1 - bodyTop, 0, visibleRows.length - 1);
  const rowIndex = clamp(startIndex + viewportRow, 0, Math.max(0, allRows.length - 1));
  const column = Math.max(0, gesture.column - 1);

  if (gesture.kind === 'press') {
    handleSelectionPress(store, allRows, { rowIndex, column }, gesture, multiClick);
    return;
  }

  // A word/line selection is locked to fixed bounds; a drag or release must not
  // pull the focus back to the pointer cell, which would copy a partial word.
  if (multiClick?.state.boundsLocked === true) {
    if (gesture.kind === 'release') {
      copySelection(store);
      multiClick.state.boundsLocked = false;
    }
    return;
  }

  store.set(updateBodySelectionAtom, { rowIndex, column });
  if (gesture.kind === 'release') {
    copySelection(store);
  }
}

/**
 * Handles a left press: classifies it (when a context is present) and either
 * anchors a fresh single-click selection or locks the word/line bounds of a
 * double/triple-click.
 */
function handleSelectionPress(
  store: Store,
  allRows: readonly BodyRow[],
  point: { rowIndex: number; column: number },
  gesture: MouseButtonEvent,
  multiClick?: MultiClickContext
): void {
  if (multiClick === undefined) {
    store.set(startBodySelectionAtom, point);
    return;
  }

  const at = multiClick.now();
  const count = classifyClick(multiClick.state.lastPress, {
    at,
    row: gesture.row,
    column: gesture.column
  });
  multiClick.state.lastPress = { at, row: gesture.row, column: gesture.column, count };

  const range =
    count >= 2 ? resolveMultiClickRange(allRows[point.rowIndex], point.rowIndex, point.column, count) : null;
  if (range !== null) {
    store.set(setBodySelectionRangeAtom, range);
    multiClick.state.boundsLocked = true;
    return;
  }

  multiClick.state.boundsLocked = false;
  store.set(startBodySelectionAtom, point);
}

/**
 * Resolves the word (double) or line (triple) selection span for a press on
 * `row` at absolute `rowIndex` and selection `column`, or `null` when there is
 * nothing to select (empty/whitespace/decorative row). Selection columns include
 * the row's leading marker, so bounds are computed against `row.text` with the
 * marker width subtracted and re-added — mirroring `selectedText`.
 */
function resolveMultiClickRange(
  row: BodyRow | undefined,
  rowIndex: number,
  column: number,
  count: number
): BodySelection | null {
  if (row === undefined || row.decorative === true) {
    return null;
  }

  const markerWidth = displayWidth(row.marker ?? '');

  if (count >= 3) {
    const width = displayWidth(row.text);
    if (width === 0) {
      return null;
    }
    return {
      anchor: { rowIndex, column: 0 },
      focus: { rowIndex, column: markerWidth + width }
    };
  }

  const bounds = wordBounds(row.text, Math.max(0, column - markerWidth));
  if (bounds === null) {
    return null;
  }
  return {
    anchor: { rowIndex, column: bounds.start + markerWidth },
    focus: { rowIndex, column: bounds.end + markerWidth }
  };
}
