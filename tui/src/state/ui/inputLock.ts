import { atom } from 'jotai';
import { startupStatusHintAtom } from '@state/ui/statusHint.ts';

export const inputLockedAtom = atom((get) => get(startupStatusHintAtom) !== undefined);
