import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';

/**
 * True while the fullscreen `/help` viewer is showing. `App` swaps the home
 * screen for the help screen when this flips, so the help viewer fully replaces
 * the transcript (a `more`-style pager) rather than rendering inline.
 */
export const helpVisibleAtom = atom(false);

/** Rows scrolled down from the top of the help content (0 == top). */
export const helpScrollOffsetAtom = atom(0);

/** Opens the help viewer and resets the scroll position to the top. */
export const openHelpAtom = atom(null, (_get, set) => {
  set(helpVisibleAtom, true);
  set(helpScrollOffsetAtom, 0);
});

/** Closes the help viewer and resets the scroll position to the top. */
export const closeHelpAtom = atom(null, (_get, set) => {
  set(helpVisibleAtom, false);
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
