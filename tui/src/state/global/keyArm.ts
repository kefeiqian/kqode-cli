import { atom } from 'jotai';

/** A destructive/exit action awaiting a confirming second key press. */
export type ArmedAction = 'clear-input' | 'exit';

/**
 * Null unless the user pressed Esc (clear-input) or Ctrl+C (exit) once; a second
 * matching press confirms it. Kept separate from `statusHintAtom` so arming shows
 * a status-bar hint without locking input (`inputLockedAtom` is unaffected).
 */
export const armedActionAtom = atom<ArmedAction | null>(null);
