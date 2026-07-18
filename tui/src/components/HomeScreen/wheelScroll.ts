import type { createStore } from 'jotai';
import { MOUSE_WHEEL_SCROLL_ROWS } from '@constants/ui.ts';
import { resolveWheelTarget } from '@components/HomeScreen/wheelRouting.ts';
import type { MouseWheelEvent } from '@libs/terminal/mouse.ts';
import {
  composerCanScrollAtom,
  composerTopAtom,
  layoutAtom,
  rowsAtom,
  scrollBodyByRowsAtom,
  scrollComposerByRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

/** Applies every wheel notch in one input chunk in source order. */
export function handleWheelScroll(
  store: Store,
  wheels: readonly MouseWheelEvent[],
  notifyScroll: () => void
): void {
  if (wheels.length === 0) {
    return;
  }

  notifyScroll();
  for (const wheel of wheels) {
    const target = resolveWheelTarget({
      mouseRow: wheel.row,
      composerTop: store.get(composerTopAtom),
      rows: store.get(rowsAtom),
      composerCanScroll: store.get(composerCanScrollAtom)
    });

    if (target === 'composer') {
      const step = Math.max(
        1,
        Math.min(MOUSE_WHEEL_SCROLL_ROWS, store.get(layoutAtom).composerVisibleRows - 1)
      );
      store.set(scrollComposerByRowsAtom, wheel.direction === 'up' ? step : -step);
    } else {
      store.set(
        scrollBodyByRowsAtom,
        wheel.direction === 'up' ? MOUSE_WHEEL_SCROLL_ROWS : -MOUSE_WHEEL_SCROLL_ROWS
      );
    }
  }
}
