import { atom } from 'jotai';
import type { BackendClient } from '@contracts/backend/index.ts';

/** Injected backend seam the prompt queue submits through and reads git status from. */
export const backendClientAtom = atom<BackendClient | undefined>(undefined);
