import type { createStore } from 'jotai';
import { MOUSE_WHEEL_SCROLL_ROWS } from '@constants/ui.ts';
import { parseMouseWheelEvents } from '@libs/terminal/mouse.ts';
import { resolveWheelTarget } from '@components/HomeScreen/wheelRouting.ts';
import { activeDockedPanelAtom } from '@state/ui/dock/atoms.ts';
import {
  composerCanScrollAtom,
  composerTopAtom,
  layoutAtom,
  rowsAtom,
  safeChromeColumnsAtom,
  scrollBodyByRowsAtom,
  scrollComposerByRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

/**
 * Applies every wheel notch in one input chunk, routing each to the pane under
 * its own pointer. A fast wheel spin batches several SGR notches into a single
 * chunk; handling them one-by-one keeps scrolling proportional to the spin
 * instead of dropping the whole chunk.
 *
 * Returns `true` when `input` held at least one wheel notch (so the caller stops
 * further mouse/key handling), `false` otherwise. `notifyScroll` fires once — on
 * the first notch that actually scrolls — and is skipped entirely when every
 * notch routes to `'none'` (pointer outside the safe canvas), matching the
 * pre-batch behavior that only suppressed the caret when a scroll occurred.
 */
export function handleWheelScroll(
  store: Store,
  input: string,
  notifyScroll: () => void
): boolean {
  const wheels = parseMouseWheelEvents(input);
  if (wheels.length === 0) {
    return false;
  }

  const dockedActive = store.get(activeDockedPanelAtom) !== null;
  let notified = false;
  const notifyOnce = (): void => {
    if (!notified) {
      notifyScroll();
      notified = true;
    }
  };

  for (const wheel of wheels) {
    const bodyDelta =
      wheel.direction === 'up' ? MOUSE_WHEEL_SCROLL_ROWS : -MOUSE_WHEEL_SCROLL_ROWS;

    // While a docked panel is open the transcript body owns the wheel.
    if (dockedActive) {
      notifyOnce();
      store.set(scrollBodyByRowsAtom, bodyDelta);
      continue;
    }

    const target = resolveWheelTarget({
      mouseRow: wheel.row,
      mouseColumn: wheel.column,
      composerTop: store.get(composerTopAtom),
      rows: store.get(rowsAtom),
      columns: store.get(safeChromeColumnsAtom),
      composerCanScroll: store.get(composerCanScrollAtom)
    });

    if (target === 'none') {
      continue;
    }

    notifyOnce();
    if (target === 'composer') {
      // A body-sized notch is near-full-page in a small composer; clamp it.
      const step = Math.max(
        1,
        Math.min(MOUSE_WHEEL_SCROLL_ROWS, store.get(layoutAtom).composerVisibleRows - 1)
      );
      store.set(scrollComposerByRowsAtom, wheel.direction === 'up' ? step : -step);
    } else {
      store.set(scrollBodyByRowsAtom, bodyDelta);
    }
  }

  return true;
}
