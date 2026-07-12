import type { createStore } from 'jotai';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import { clamp } from '@libs/math/clamp.ts';
import type { MouseButtonEvent } from '@libs/terminal/mouse.ts';
import {
  activeDockedPanelAtom,
  bodyTopAtom,
  composerTopAtom,
  layoutAtom,
  rowsAtom,
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
 * Maps an SGR mouse gesture (1-based screen coordinates) to a selection point in
 * absolute body-row space, then drives the in-app selection: `press` starts it,
 * `drag` extends the focus, `release` extends and copies. The point is clamped to
 * the visible body window, so a drag past the viewport edges selects to the
 * nearest on-screen row rather than escaping the transcript.
 */
export function handleSelectionGesture(store: Store, gesture: MouseButtonEvent): void {
  const { allRows, startIndex, visibleRows } = store.get(visibleBodyRowsAtom);
  if (visibleRows.length === 0) {
    return;
  }

  const bodyTop = store.get(bodyTopAtom);
  const viewportRow = clamp(gesture.row - 1 - bodyTop, 0, visibleRows.length - 1);
  const rowIndex = clamp(startIndex + viewportRow, 0, Math.max(0, allRows.length - 1));
  const point = { rowIndex, column: Math.max(0, gesture.column - 1) };

  if (gesture.kind === 'press') {
    store.set(startBodySelectionAtom, point);
    return;
  }

  store.set(updateBodySelectionAtom, point);
  if (gesture.kind === 'release') {
    copySelection(store);
  }
}
