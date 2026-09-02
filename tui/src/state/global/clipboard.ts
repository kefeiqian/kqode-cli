import { atom } from 'jotai';
import type { ClipboardClient } from '@contracts/clipboard/index.ts';

/** Injected clipboard seam used by copy and paste interactions. */
export const clipboardClientAtom = atom<ClipboardClient | undefined>(undefined);
