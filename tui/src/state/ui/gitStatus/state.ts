import { atom } from 'jotai';
import type { GitStatus } from '@contracts/backend/index.ts';

/** Latest workspace git and pull-request status. */
export const gitStatusAtom = atom<GitStatus | undefined>(undefined);
