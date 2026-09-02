import { atom } from 'jotai';

const RIGHT_CLICK_PASTE_SUPPRESSION_MS = 250;

export const rightClickPasteSuppressionUntilAtom = atom(0);

export const markRightClickPasteSuppressionAtom = atom(
  null,
  (_get, set, now: number = Date.now()) => {
    set(rightClickPasteSuppressionUntilAtom, now + RIGHT_CLICK_PASTE_SUPPRESSION_MS);
  }
);

