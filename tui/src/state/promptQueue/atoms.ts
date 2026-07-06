import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { STREAM_RENDER_FLUSH_MS } from '@constants/backend.ts';
import { SETTLED_KIND_COMPLETED } from '@contracts/backend/index.ts';
import type { TranscriptEvent } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/index.ts';
import { openLoginSurfaceAtom } from '@state/ui/surface/index.ts';
import { refreshGitStatusAtom } from '@state/ui/index.ts';
import { createDeltaCoalescer } from '@libs/promptQueue/streamCoalescer.ts';
import { BACKEND_UNAVAILABLE_MESSAGE, backendErrorMessage } from '@libs/promptQueue/promptQueue.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import { reduceTranscriptEvent } from '@libs/promptQueue/transcriptReducer.ts';
import { appendClientOnlyError, sequencedText } from '@state/promptQueue/clientOnlyRows.ts';
import {
  conversationGenerationAtom,
  clientOnlyRowsAtom,
  nextClientOnlyRowIdAtom,
  nextQueueItemIdAtom,
  nextSubmissionSequenceAtom,
  promptQueueAtom,
  activeTurnIdAtom,
  settledTurnIdsAtom,
  streamingTextByIdAtom,
  transcriptReducerStateAtom,
  turnGenerationByIdAtom
} from '@state/promptQueue/store.ts';
export {
  activeTurnIdAtom,
  clientOnlyRowsAtom,
  conversationGenerationAtom,
  nextClientOnlyRowIdAtom,
  nextQueueItemIdAtom,
  nextSubmissionSequenceAtom,
  promptQueueAtom,
  settledTurnIdsAtom,
  streamingTextByIdAtom,
  turnGenerationByIdAtom
};
const AUTH_ERROR_KIND = 'auth';
const localTurnIdPrefix = 'local-turn';
let fallbackTurnCounter = 0;
const deltaCoalescers = new Map<string, ReturnType<typeof createDeltaCoalescer>>();
export const restoreComposerDraftAtom = atom('');
/** Factory for caller-side backend turn ids, injected by the composition root. */
export const newTurnIdAtom = atom({ newTurnId: () => `${localTurnIdPrefix}-${fallbackTurnCounter++}` });
/** Appends a prompt optimistically and submits its caller-minted turn id. */
export const enqueuePromptAtom = atom(
  null,
  async (get, set, input: string | { text: string; submissionSequence: number }) => {
    const { text: rawText, submissionSequence } = sequencedText(get, set, input);
    const backendClient = get(backendClientAtom);
    const turnId = get(newTurnIdAtom).newTurnId();
    const item: QueueItem = {
      id: get(nextQueueItemIdAtom),
      turnId,
      submissionSequence,
      text: rawText,
      state: 'active'
    };
    set(nextQueueItemIdAtom, item.id + 1);
    set(promptQueueAtom, (queue) => [...queue, item]);
    set(bodyScrollOffsetRowsAtom, 0);
    if (backendClient === undefined) {
      appendClientOnlyError(get, set, submissionSequence, BACKEND_UNAVAILABLE_MESSAGE);
      settleLocalSubmitFailure(set, turnId);
      return;
    }
    try {
      await backendClient.submit({ turnId, text: rawText });
    } catch (error) {
      appendClientOnlyError(get, set, submissionSequence, backendErrorMessage(error));
      settleLocalSubmitFailure(set, turnId);
    }
  }
);
/** Applies one backend transcript event to the local read-model. */
export const transcriptEventAtom = atom(null, (get, set, event: TranscriptEvent) => {
  if (event.type === 'tokenDelta') {
    coalesceDelta(set, event);
    return;
  }
  flushCoalescer(event.turnId);
  applyTranscriptEvent(get, set, event);
  if (event.type === 'settled') {
    cancelCoalescer(event.turnId);
  }
});
const coalescedTranscriptEventAtom = atom(null, (get, set, event: TranscriptEvent) => {
  applyTranscriptEvent(get, set, event);
});
/** Clears all transcript entries locally and asks the backend to clear too. */
export const clearTranscriptAtom = atom(null, (get, set) => {
  clearAllCoalescers();
  bumpGeneration(set);
  ignoreTurnIds(set, visibleTurnIds(get(promptQueueAtom)));
  set(promptQueueAtom, []);
  set(clientOnlyRowsAtom, []);
  set(streamingTextByIdAtom, new Map());
  set(turnGenerationByIdAtom, new Map());
  set(bodyScrollOffsetRowsAtom, 0);
  void get(backendClientAtom)?.clearConversation().catch(() => undefined);
});
/** Bumps generation on backend respawn and drops backend-owned mirror rows. */
export const resetTranscriptMirrorAtom = atom(null, (get, set) => {
  clearAllCoalescers();
  bumpGeneration(set);
  const generations = get(turnGenerationByIdAtom);
  ignoreTurnIds(
    set,
    visibleTurnIds(get(promptQueueAtom)).filter((turnId) => generations.has(turnId))
  );
  set(promptQueueAtom, (queue) =>
    queue.filter((item) => item.turnId === undefined || !generations.has(item.turnId))
  );
  set(streamingTextByIdAtom, new Map());
  set(turnGenerationByIdAtom, new Map());
});
function applyTranscriptEvent(get: Getter, set: Setter, event: TranscriptEvent): void {
  const result = reduceTranscriptEvent(
    get(transcriptReducerStateAtom),
    event,
    get(conversationGenerationAtom)
  );
  set(promptQueueAtom, result.state.queue);
  set(streamingTextByIdAtom, result.state.streamingTextById);
  set(turnGenerationByIdAtom, result.state.generationByTurnId);
  set(settledTurnIdsAtom, result.state.settledTurnIds);
  set(nextQueueItemIdAtom, result.state.nextQueueItemId);
  set(bodyScrollOffsetRowsAtom, 0);
  if (event.type === 'settled' && event.result.kind === SETTLED_KIND_COMPLETED) {
    void set(refreshGitStatusAtom);
  }
  if (result.effect !== undefined) {
    rerouteToLogin(get, set, result.effect.turnText, result.effect.type === AUTH_ERROR_KIND);
  }
}
function coalesceDelta(
  set: Setter,
  event: Extract<TranscriptEvent, { type: 'tokenDelta' }>
): void {
  const coalescer =
    deltaCoalescers.get(event.turnId) ??
    createDeltaCoalescer((delta) => {
      set(coalescedTranscriptEventAtom, { ...event, delta });
    }, STREAM_RENDER_FLUSH_MS);
  deltaCoalescers.set(event.turnId, coalescer);
  coalescer.push(event.delta);
}
function rerouteToLogin(get: Getter, set: Setter, draft: string, keepSettled: boolean): void {
  if (get(restoreComposerDraftAtom) === '') {
    set(restoreComposerDraftAtom, draft);
    set(openLoginSurfaceAtom);
  }
  if (!keepSettled) {
    set(promptQueueAtom, []);
    set(clientOnlyRowsAtom, []);
    set(streamingTextByIdAtom, new Map());
  }
}
function bumpGeneration(set: Setter): void {
  set(conversationGenerationAtom, (generation) => generation + 1);
}
function flushCoalescer(turnId: string): void {
  deltaCoalescers.get(turnId)?.flush();
}
function cancelCoalescer(turnId: string): void {
  deltaCoalescers.get(turnId)?.cancel();
  deltaCoalescers.delete(turnId);
}
function clearAllCoalescers(): void {
  for (const coalescer of deltaCoalescers.values()) {
    coalescer.cancel();
  }
  deltaCoalescers.clear();
}
function visibleTurnIds(queue: readonly QueueItem[]): string[] {
  return queue.flatMap((item) => (item.turnId === undefined ? [] : [item.turnId]));
}
function ignoreTurnIds(set: Setter, turnIds: readonly string[]): void {
  if (turnIds.length === 0) {
    return;
  }
  set(settledTurnIdsAtom, (previous) => new Set([...previous, ...turnIds]));
}

function settleLocalSubmitFailure(set: Setter, turnId: string): void {
  set(promptQueueAtom, (queue) =>
    queue.map((item) => (item.turnId === turnId ? { ...item, state: 'settled' } : item))
  );
  set(settledTurnIdsAtom, (turnIds) => new Set([...turnIds, turnId]));
}
