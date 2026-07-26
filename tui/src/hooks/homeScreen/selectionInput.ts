import type { createStore } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import type { MouseButtonEvent } from '@libs/terminal/mouse.ts';
import {
  bodyTopAtom,
  composerTopAtom,
  layoutAtom,
  rowsAtom,
  startBodySelectionAtom,
  updateBodySelectionAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;
export type GestureRegion = 'body' | 'composer';

/** Resolves the screen region that owns a new left-button gesture. */
export function resolveGestureRegion(store: Store, row: number): GestureRegion | null {
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

/** Applies a press, drag, or release to the absolute transcript selection. */
export function handleSelectionGesture(store: Store, gesture: MouseButtonEvent): boolean {
  const { allRows, startIndex, visibleRows } = store.get(visibleBodyRowsAtom);
  if (visibleRows.length === 0) {
    return false;
  }

  const bodyTop = store.get(bodyTopAtom);
  const rawViewportRow = gesture.row - 1 - bodyTop;
  if (
    gesture.kind === 'press' &&
    (rawViewportRow < 0 || rawViewportRow >= visibleRows.length)
  ) {
    return false;
  }

  const viewportRow = clamp(rawViewportRow, 0, visibleRows.length - 1);
  const rowIndex = clamp(startIndex + viewportRow, 0, Math.max(0, allRows.length - 1));
  const point = { rowIndex, column: Math.max(0, gesture.column - 1) };

  if (gesture.kind === 'press') {
    store.set(startBodySelectionAtom, point);
    return true;
  }

  store.set(updateBodySelectionAtom, point);
  return true;
}
