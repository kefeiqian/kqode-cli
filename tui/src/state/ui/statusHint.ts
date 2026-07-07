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

/** Status hint shown while a submitted turn is awaiting its LLM response. */
export const WORKING_STATUS_HINT: StatusHint = {
  text: 'Working',
  kind: 'loading'
};

export const startupStatusHintAtom = atom<StatusHint | undefined>(undefined);

/**
 * Frame counter for the animated loading/working status-hint dots. Lifted out of
 * StatusBar-local state into a shared atom so the prompt composer can subscribe
 * to it: the status bar repaints on every spinner tick without re-rendering the
 * composer, and Ink only keeps the terminal cursor shown on a frame where
 * `setCursorPosition` ran, so the composer must re-render (and re-assert the
 * caret) in lockstep or the prompt loses its cursor mid-animation. Driven by a
 * single interval in the StatusBar; `0` while no loading-kind hint is active.
 */
export const loadingFrameAtom = atom(0);

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
