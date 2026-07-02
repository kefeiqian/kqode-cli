import { atom } from 'jotai';
import type { BackendClient } from '@contracts/backend/index.ts';

/** Injected backend seam (submitMessage-only) the prompt queue submits through. */
export const backendClientAtom = atom<BackendClient | undefined>(undefined);
