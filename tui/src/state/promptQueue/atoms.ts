import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import { unknownCommandMessage } from '@libs/commands/unknownCommand.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/index.ts';
import { promptQueueAtom, streamingTextByIdAtom } from '@state/promptQueue/store.ts';
import { refreshGitStatusAtom } from '@state/ui/index.ts';
import { createDeltaCoalescer } from '@libs/promptQueue/streamCoalescer.ts';
import { STREAM_RENDER_FLUSH_MS } from '@constants/backend.ts';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  backendErrorMessage,
  outcomeToResult
} from '@libs/promptQueue/promptQueue.ts';
import type { BackendResult, QueueItem } from '@libs/promptQueue/promptQueue.ts';

export { promptQueueAtom, streamingTextByIdAtom };

let nextQueueItemId = 0;

const drainingAtom = atom(false);

/**
 * Appends a submitted prompt and drains the backend queue one request at a time.
 *
 * The prompt is shown immediately: the first item is active with no marker and
 * later items render `(pending)` until they become active. Raw text is sent to
 * the backend while only sanitized text reaches the body, and validation/queue
 * state stays in memory for this slice.
 */
export const enqueuePromptAtom = atom(null, async (get, set, rawText: string) => {
  const hasActive = get(promptQueueAtom).some((item) => item.state === 'active');
  const item: QueueItem = {
    id: nextQueueItemId++,
    text: rawText,
    state: hasActive ? 'queued' : 'active'
  };

  set(promptQueueAtom, (queue) => [...queue, item]);
  set(bodyScrollOffsetRowsAtom, 0);
  await drainQueue(get, set);
});

/** Clears all transcript entries (prompts and results) and resets scroll. */
export const clearTranscriptAtom = atom(null, (_get, set) => {
  set(promptQueueAtom, []);
  set(streamingTextByIdAtom, new Map());
  set(bodyScrollOffsetRowsAtom, 0);
});

/**
 * Records an unknown `/command` submission in the transcript instead of the
 * composer: the raw text renders as a prompt entry and a red error entry names
 * the unmatched command. The item is pre-settled so the backend queue never
 * sends it, mirroring how a real prompt and its result appear in the body.
 */
export const appendUnknownCommandAtom = atom(null, (_get, set, rawText: string) => {
  const item: QueueItem = {
    id: nextQueueItemId++,
    text: rawText,
    state: 'settled',
    result: { kind: BodyEntryKind.Error, text: sanitizeDisplayText(unknownCommandMessage(rawText)) }
  };

  set(promptQueueAtom, (queue) => [...queue, item]);
  set(bodyScrollOffsetRowsAtom, 0);
});

async function drainQueue(get: Getter, set: Setter): Promise<void> {
  if (get(drainingAtom)) {
    return;
  }

  set(drainingAtom, true);
  try {
    let active = findActive(get);
    while (active !== undefined) {
      const result = await streamActive(get, set, active.id, active.text);
      settleActive(set, active.id, result);
      // A completed turn may have changed the working tree; refresh the git label
      // (fire-and-forget so it never delays draining the next queued prompt).
      void set(refreshGitStatusAtom);
      active = findActive(get);
    }
  } finally {
    set(drainingAtom, false);
  }
}

/**
 * Streams one prompt to the backend, rendering assistant deltas live into the
 * active item, and resolves the terminal transcript result.
 *
 * The assistant marker appears immediately (empty streaming text), then token
 * deltas are coalesced (see `createDeltaCoalescer`) and flushed at most ~15fps
 * into the live streaming text; the derived body sticks to the bottom so new
 * output stays visible. The final result is rendered by `settleActive`, so the
 * coalescer's trailing sub-frame buffer is safely discarded on completion.
 * Provider errors and the no-key path settle as themed body entries rather than
 * throwing.
 */
async function streamActive(
  get: Getter,
  set: Setter,
  id: number,
  text: string
): Promise<BackendResult> {
  const backendClient = get(backendClientAtom);
  if (backendClient === undefined) {
    return { kind: BodyEntryKind.Error, text: sanitizeDisplayText(BACKEND_UNAVAILABLE_MESSAGE) };
  }

  updateStreamingText(set, id, () => '');

  const coalescer = createDeltaCoalescer((batch) => {
    updateStreamingText(set, id, (current) => current + batch);
    set(bodyScrollOffsetRowsAtom, 0);
  }, STREAM_RENDER_FLUSH_MS);

  try {
    const outcome = await backendClient.submitStreaming(
      { text },
      { onDelta: (delta) => coalescer.push(delta) }
    );
    return outcomeToResult(outcome);
  } catch (error) {
    return { kind: BodyEntryKind.Error, text: sanitizeDisplayText(backendErrorMessage(error)) };
  } finally {
    coalescer.cancel();
  }
}

/**
 * Appends to the active item's live streaming text in O(1).
 *
 * The text lives in `streamingTextByIdAtom` (at most one entry) rather than in
 * the queue array, so a token delta rewrites only that single map entry instead
 * of cloning the whole queue. `submittedPromptEntriesAtom` derives its body rows
 * from this map, so there is no manual re-sync.
 */
function updateStreamingText(
  set: Setter,
  id: number,
  update: (current: string) => string
): void {
  set(streamingTextByIdAtom, (previous) => {
    const next = new Map(previous);
    next.set(id, update(previous.get(id) ?? ''));
    return next;
  });
}

function settleActive(set: Setter, id: number, result: BackendResult): void {
  set(promptQueueAtom, (queue) => {
    let promoted = false;
    return queue.map((item) => {
      if (item.id === id) {
        return { ...item, state: 'settled' as const, result };
      }
      if (!promoted && item.state === 'queued') {
        promoted = true;
        return { ...item, state: 'active' as const };
      }
      return item;
    });
  });
  discardStreamingText(set, id);
}

/** Drops a settled item's streaming buffer so the map holds at most one entry. */
function discardStreamingText(set: Setter, id: number): void {
  set(streamingTextByIdAtom, (previous) => {
    if (!previous.has(id)) {
      return previous;
    }
    const next = new Map(previous);
    next.delete(id);
    return next;
  });
}

function findActive(get: Getter): QueueItem | undefined {
  return get(promptQueueAtom).find((item) => item.state === 'active');
}
