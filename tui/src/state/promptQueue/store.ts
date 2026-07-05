import { atom } from 'jotai';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

/** Ordered record of submitted prompts and their backend outcomes. */
export const promptQueueAtom = atom<QueueItem[]>([]);

/**
 * Live assistant text for in-flight turns, keyed by {@link QueueItem} `id`.
 *
 * Streaming text mutates on every token delta, so it is held here instead of
 * inside {@link promptQueueAtom}: updating one entry is O(1), whereas rewriting
 * it into the queue array would clone the whole (session-long, growing) queue on
 * every delta. The queue drains sequentially, so only the single active turn
 * streams at a time and its entry is deleted once the turn settles — this map
 * therefore holds at most one entry, keeping each copy-on-write O(1).
 */
export const streamingTextByIdAtom = atom<ReadonlyMap<number, string>>(new Map());
