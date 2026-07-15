import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import { unknownCommandMessage } from '@libs/commands/unknownCommand.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/index.ts';
import { promptQueueAtom } from '@state/promptQueue/store.ts';
import { refreshGitStatusAtom } from '@state/ui/index.ts';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  backendErrorMessage,
  outcomeToResult
} from '@libs/promptQueue/promptQueue.ts';
import type { BackendResult, QueueItem } from '@libs/promptQueue/promptQueue.ts';

export { promptQueueAtom };

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
      const result = await submitActive(get, active.text);
      settleActive(set, active.id, result);
      // A settled turn may have changed the working tree once providers land;
      // refresh the git label (fire-and-forget so it never delays draining the
      // next queued prompt).
      void set(refreshGitStatusAtom);
      active = findActive(get);
    }
  } finally {
    set(drainingAtom, false);
  }
}

/**
 * Submits one prompt to the backend and resolves the terminal transcript result.
 *
 * The needs-configuration ack and any backend transport/timeout error settle as
 * themed body entries rather than throwing (see `settleActive` and
 * `outcomeToResult`). Streamed assistant text lands with the provider PR.
 */
async function submitActive(get: Getter, text: string): Promise<BackendResult> {
  const backendClient = get(backendClientAtom);
  if (backendClient === undefined) {
    return { kind: BodyEntryKind.Error, text: sanitizeDisplayText(BACKEND_UNAVAILABLE_MESSAGE) };
  }

  try {
    const outcome = await backendClient.submit({ text });
    return outcomeToResult(outcome);
  } catch (error) {
    return { kind: BodyEntryKind.Error, text: sanitizeDisplayText(backendErrorMessage(error)) };
  }
}

function settleActive(set: Setter, id: number, result: BackendResult): void {
  set(promptQueueAtom, (queue) => {
    let promoted = false;
    let settledTarget = false;
    return queue.map((item) => {
      if (item.id === id) {
        settledTarget = true;
        return { ...item, state: 'settled' as const, result };
      }
      if (settledTarget && !promoted && item.state === 'queued') {
        promoted = true;
        return { ...item, state: 'active' as const };
      }
      return item;
    });
  });
}

function findActive(get: Getter): QueueItem | undefined {
  return get(promptQueueAtom).find((item) => item.state === 'active');
}
