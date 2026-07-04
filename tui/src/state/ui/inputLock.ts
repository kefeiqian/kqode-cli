import { atom } from 'jotai';
import { statusHintAtom } from '@state/ui/statusHint.ts';

export const inputLockedAtom = atom((get) => get(statusHintAtom) !== undefined);
