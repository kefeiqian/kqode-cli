import { atom } from 'jotai';
import type { StatusHint } from '@constants/statusHint.ts';

export const startupStatusHintAtom = atom<StatusHint | undefined>(undefined);

/** Auto-clearing status feedback for clipboard actions. */
export const transientStatusHintAtom = atom<StatusHint | undefined>(undefined);

export const setTransientStatusHintAtom = atom(
  null,
  (_get, set, hint: StatusHint | undefined) => {
    set(transientStatusHintAtom, hint);
  }
);

export const statusHintAtom = atom(
  (get) => get(startupStatusHintAtom) ?? get(transientStatusHintAtom)
);
