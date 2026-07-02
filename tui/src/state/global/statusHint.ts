import { atom } from 'jotai';

export type StatusHint = {
  full: string;
  compact: string;
  kind?: 'loading';
};

/** Status hint shown while the backend process starts at launch. */
export const BACKEND_LOADING_HINT: StatusHint = {
  full: 'Loading backend',
  compact: 'Loading',
  kind: 'loading'
};

export const startupStatusHintAtom = atom<StatusHint | undefined>(undefined);

export const statusHintAtom = atom((get) => get(startupStatusHintAtom));
