import { atom } from 'jotai';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import type { ClientOnlyRow } from '@libs/promptQueue/rowComposition.ts';
import type { TranscriptReducerState } from '@libs/promptQueue/transcriptReducer.ts';

/** Ordered record of submitted prompts and their backend outcomes. */
export const promptQueueAtom = atom<QueueItem[]>([]);

/** Active backend turn id, or `null` when no active mirror item has one. */
export const activeTurnIdAtom = atom((get) => {
  const activeItem = get(promptQueueAtom).find(
    (item) => item.state === 'active' && item.turnId !== undefined
  );
  return activeItem?.turnId ?? null;
});

/** Client-only rows that are composed with, but never stored in, the mirror. */
export const clientOnlyRowsAtom = atom<ClientOnlyRow[]>([]);

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

/** Next id for stable client-only body-row keys. */
export const nextClientOnlyRowIdAtom = atom(0);

/** Fallback submit sequence for tests and direct atom callers. */
export const nextSubmissionSequenceAtom = atom(0);

/** Snapshot atom used to feed the pure transcript reducer. */
export const transcriptReducerStateAtom = atom<TranscriptReducerState>((get) => ({
  queue: get(promptQueueAtom),
  streamingTextById: get(streamingTextByIdAtom),
  generationByTurnId: get(turnGenerationByIdAtom),
  settledTurnIds: get(settledTurnIdsAtom),
  nextQueueItemId: get(nextQueueItemIdAtom)
}));
