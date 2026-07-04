import { atom } from 'jotai';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';

export const bodyEntriesAtom = atom<readonly BodyEntry[] | undefined>(undefined);
