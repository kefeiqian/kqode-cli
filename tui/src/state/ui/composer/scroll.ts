import { atom } from 'jotai';

/**
 * Signed rows the composer view is scrolled away from its cursor-follow baseline
 * (+ up / - down). Text/cursor mutations do not reset it unless the composer is
 * cleared; cursor movement minimally scrolls the caret back into view.
 */
export const composerScrollOffsetRowsAtom = atom(0);

/**
 * Monotonic tick bumped after body/composer scrolling changes the visible
 * window. The composer subscribes to re-assert the terminal caret position.
 */
export const composerCaretRefreshTickAtom = atom(0);
