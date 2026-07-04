import { atom } from 'jotai';
import type { ArmedAction } from '@constants/ui.ts';

/**
 * Null unless the user pressed Esc (clear-input) or Ctrl+C (exit) once; a second
 * matching press confirms it. Kept separate from `statusHintAtom` so arming shows
 * a status-bar hint without locking input (`inputLockedAtom` is unaffected).
 */
export const armedActionAtom = atom<ArmedAction | null>(null);
