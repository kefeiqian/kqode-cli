import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import {
  activeSurfaceAtom,
  closeActiveSurfaceAtom,
  openHelpSurfaceAtom,
  Surface
} from '@state/ui/surface/index.ts';

/**
 * Compatibility selector for help visibility. The active surface is the source
 * of truth; setting this preserves older callers while folding help into the
 * mutually exclusive surface selector.
 */
export const helpVisibleAtom = atom(
  (get) => get(activeSurfaceAtom) === Surface.Help,
  (_get, set, visible: boolean) => {
    if (visible) {
      set(openHelpSurfaceAtom);
    } else {
      set(closeActiveSurfaceAtom);
    }
  }
);

/** Rows scrolled down from the top of the help content (0 == top). */
export const helpScrollOffsetAtom = atom(0);

/** Opens the help viewer and resets the scroll position to the top. */
export const openHelpAtom = atom(null, (_get, set) => {
  set(openHelpSurfaceAtom);
  set(helpScrollOffsetAtom, 0);
});

/** Closes the help viewer and resets the scroll position to the top. */
export const closeHelpAtom = atom(null, (_get, set) => {
  set(closeActiveSurfaceAtom);
  set(helpScrollOffsetAtom, 0);
});

/**
 * Scrolls the help content by `delta` rows, clamped to `[0, maxOffset]`. The
 * caller supplies `maxOffset` because it depends on the rendered viewport height
 * and content length, both of which live in the component.
 */
export const scrollHelpByRowsAtom = atom(
  null,
  (_get, set, { delta, maxOffset }: { delta: number; maxOffset: number }) => {
    set(helpScrollOffsetAtom, (current) => clamp(current + delta, 0, Math.max(0, maxOffset)));
  }
);
