import { atom } from 'jotai';
import type { StatusHint } from '@constants/statusHint.ts';

export const startupStatusHintAtom = atom<StatusHint | undefined>(undefined);

export const statusHintAtom = atom((get) => get(startupStatusHintAtom));
