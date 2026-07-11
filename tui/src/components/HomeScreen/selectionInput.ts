import type { createStore } from 'jotai';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import { clamp } from '@libs/math/clamp.ts';
import type { MouseButtonEvent } from '@libs/terminal/mouse.ts';
import {
  bodyTopAtom,
  startBodySelectionAtom,
  updateBodySelectionAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

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
