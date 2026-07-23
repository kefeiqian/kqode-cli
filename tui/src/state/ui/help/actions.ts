import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { helpScrollOffsetAtom, helpVisibleAtom } from '@state/ui/help/state.ts';

export const openHelpAtom = atom(null, (_get, set) => {
  set(helpVisibleAtom, true);
  set(helpScrollOffsetAtom, 0);
});

export const closeHelpAtom = atom(null, (_get, set) => {
  set(helpVisibleAtom, false);
  set(helpScrollOffsetAtom, 0);
});

export const scrollHelpByRowsAtom = atom(
  null,
  (_get, set, { delta, maxOffset }: { delta: number; maxOffset: number }) => {
    set(helpScrollOffsetAtom, (current) =>
      clamp(current + delta, 0, Math.max(0, maxOffset))
    );
  }
);
