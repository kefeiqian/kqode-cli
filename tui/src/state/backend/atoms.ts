import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/homeScreen/index.ts';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  backendErrorMessage,
  queueToBodyEntries
} from '@state/backend/bodyEntries.ts';
import type { BackendResult, QueueItem } from '@state/backend/bodyEntries.ts';
import { COMMAND_REGISTRY } from '@state/commands/registry.ts';

let nextQueueItemId = 0;

/** Ordered record of submitted prompts and their backend outcomes. */
export const promptQueueAtom = atom<QueueItem[]>([]);

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
  syncBodyEntries(get, set);
  await drainQueue(get, set);
});

/** Clears all transcript entries (prompts, results, and command notes) and resets scroll. */
export const clearTranscriptAtom = atom(null, (get, set) => {
  set(promptQueueAtom, []);
  set(bodyScrollOffsetRowsAtom, 0);
  syncBodyEntries(get, set);
});

/**
 * Appends the `/help` listing as a client-side note — one transcript line per
 * command. The note is `settled` and `kind: 'note'`, so the drain loop skips it
 * and nothing reaches the backend. The shared id counter keeps it correctly
 * ordered against prompts.
 */
export const appendHelpAtom = atom(null, (get, set) => {
  const width = Math.max(...COMMAND_REGISTRY.map((command) => command.name.length));
  const text = COMMAND_REGISTRY.map(
    (command) => `${command.name.padEnd(width)}  ${command.description}`
  ).join('\n');
  const item: QueueItem = { id: nextQueueItemId++, text, state: 'settled', kind: 'note' };

  set(promptQueueAtom, (queue) => [...queue, item]);
  set(bodyScrollOffsetRowsAtom, 0);
  syncBodyEntries(get, set);
});

async function drainQueue(get: Getter, set: Setter): Promise<void> {
  if (get(drainingAtom)) {
    return;
  }

  set(drainingAtom, true);
  try {
    let active = findActive(get);
    while (active !== undefined) {
      const result = await runBackendRequest(get, active.text);
      settleActive(get, set, active.id, result);
      active = findActive(get);
    }
  } finally {
    set(drainingAtom, false);
  }
}

async function runBackendRequest(get: Getter, text: string): Promise<BackendResult> {
  const backendClient = get(backendClientAtom);
  if (backendClient === undefined) {
    return { kind: 'error', text: sanitizeDisplayText(BACKEND_UNAVAILABLE_MESSAGE) };
  }

  try {
    const ack = await backendClient.submitMessage({ text });
    return {
      kind: 'success',
      text: sanitizeDisplayText(`Rust backend ACK - received: ${ack.receivedText}`)
    };
  } catch (error) {
    return { kind: 'error', text: sanitizeDisplayText(backendErrorMessage(error)) };
  }
}

function settleActive(get: Getter, set: Setter, id: number, result: BackendResult): void {
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
  syncBodyEntries(get, set);
}

function findActive(get: Getter): QueueItem | undefined {
  return get(promptQueueAtom).find((item) => item.state === 'active');
}

function syncBodyEntries(get: Getter, set: Setter): void {
  set(submittedPromptEntriesAtom, queueToBodyEntries(get(promptQueueAtom)));
}
