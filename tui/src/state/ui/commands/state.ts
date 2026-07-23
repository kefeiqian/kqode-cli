import { atom } from 'jotai';

/** Set by Esc to hide the menu without clearing the current slash query. */
export const commandMenuDismissedAtom = atom(false);

/** Raw highlight index; selectors clamp it against the current match set. */
export const commandMenuHighlightIndexAtom = atom(0);
