import { atom } from 'jotai';

export type StatusHint = {
  text: string;
  kind?: 'loading';
};

/** Status hint shown while the backend process starts at launch. */
export const BACKEND_LOADING_HINT: StatusHint = {
  text: 'Loading backend',
  kind: 'loading'
};

export const startupStatusHintAtom = atom<StatusHint | undefined>(undefined);

/** Auto-clearing status hint for short-lived copy/paste feedback. */
export const transientStatusHintAtom = atom<StatusHint | undefined>(undefined);

/** Write-only helper for setting or clearing a transient status hint. */
export const setTransientStatusHintAtom = atom(
  null,
  (_get, set, hint: StatusHint | undefined) => {
    set(transientStatusHintAtom, hint);
  }
);

/** Current status hint, with startup/loading feedback taking precedence. */
export const statusHintAtom = atom((get) => get(startupStatusHintAtom) ?? get(transientStatusHintAtom));
