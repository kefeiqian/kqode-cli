import { atom } from 'jotai';
import { statusHintAtom } from '@state/global/statusHint.ts';

export const inputLockedAtom = atom((get) => get(statusHintAtom) !== undefined);
