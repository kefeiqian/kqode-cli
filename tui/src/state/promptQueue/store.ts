import { atom } from 'jotai';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import type { TranscriptReducerState } from '@libs/promptQueue/transcriptReducer.ts';

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

/** Monotonic client-side conversation generation used to drop stale events. */
export const conversationGenerationAtom = atom(0);

/** Backend-event generation stamped lazily by `turnId`. */
export const turnGenerationByIdAtom = atom<ReadonlyMap<string, number>>(new Map());

/** Terminal turns ignore all later backend events. */
export const settledTurnIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

/** Next numeric queue id for body-row keys. */
export const nextQueueItemIdAtom = atom(0);

/** Snapshot atom used to feed the pure transcript reducer. */
export const transcriptReducerStateAtom = atom<TranscriptReducerState>((get) => ({
  queue: get(promptQueueAtom),
  streamingTextById: get(streamingTextByIdAtom),
  generationByTurnId: get(turnGenerationByIdAtom),
  settledTurnIds: get(settledTurnIdsAtom),
  nextQueueItemId: get(nextQueueItemIdAtom)
}));
