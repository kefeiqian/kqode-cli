import { atom } from 'jotai';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

/** Ordered record of submitted prompts and their backend outcomes. */
export const promptQueueAtom = atom<QueueItem[]>([]);
