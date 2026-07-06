import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import { unknownCommandMessage } from '@libs/commands/unknownCommand.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { bodyScrollOffsetRowsAtom } from '@state/ui/index.ts';
import { promptQueueAtom, streamingTextByIdAtom } from '@state/promptQueue/store.ts';
import { refreshGitStatusAtom } from '@state/ui/index.ts';
import { openLoginSurfaceAtom } from '@state/ui/surface/index.ts';
import { createDeltaCoalescer } from '@libs/promptQueue/streamCoalescer.ts';
import { STREAM_RENDER_FLUSH_MS } from '@constants/backend.ts';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  backendErrorMessage,
  outcomeToResult
} from '@libs/promptQueue/promptQueue.ts';
import type { BackendResult, QueueItem } from '@libs/promptQueue/promptQueue.ts';

export { promptQueueAtom, streamingTextByIdAtom };

const AUTH_ERROR_KIND = 'auth';

let nextQueueItemId = 0;

const drainingAtom = atom(false);

export const restoreComposerDraftAtom = atom('');

type StreamActiveResult =
  | { kind: 'settled'; result: BackendResult }
  | { kind: 'needsConfiguration' }
  | { kind: 'authError'; result: BackendResult };

/** Appends a submitted prompt and drains the backend queue one request at a time. */
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
      if (result.kind === 'needsConfiguration') {
        rerouteToLogin(set, active.id, active.text, false);
        return;
      }
      if (result.kind === 'authError') {
        settleActive(set, active.id, result.result);
        rerouteToLogin(set, active.id, active.text, true);
        return;
      }
      settleActive(set, active.id, result.result);
      // A completed turn may have changed the working tree; refresh the git label
      // (fire-and-forget so it never delays draining the next queued prompt).
      void set(refreshGitStatusAtom);
      active = findActive(get);
    }
  } finally {
    set(drainingAtom, false);
  }
}

async function streamActive(
  get: Getter,
  set: Setter,
  id: number,
  text: string
): Promise<StreamActiveResult> {
  const backendClient = get(backendClientAtom);
  if (backendClient === undefined) {
    return {
      kind: 'settled',
      result: { kind: BodyEntryKind.Error, text: sanitizeDisplayText(BACKEND_UNAVAILABLE_MESSAGE) }
    };
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
    if (outcome.kind === 'needsConfiguration') {
      return { kind: 'needsConfiguration' };
    }
    const result = outcomeToResult(outcome);
    return outcome.kind === 'error' && outcome.errorKind === AUTH_ERROR_KIND
      ? { kind: 'authError', result }
      : { kind: 'settled', result };
  } catch (error) {
    return {
      kind: 'settled',
      result: { kind: BodyEntryKind.Error, text: sanitizeDisplayText(backendErrorMessage(error)) }
    };
  } finally {
    coalescer.cancel();
  }
}

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

function rerouteToLogin(
  set: Setter,
  activeId: number,
  draft: string,
  keepSettledActive: boolean
): void {
  set(promptQueueAtom, (queue) =>
    queue.filter((item) => item.state === 'settled' || (keepSettledActive && item.id === activeId))
  );
  set(streamingTextByIdAtom, new Map());
  set(restoreComposerDraftAtom, draft);
  set(openLoginSurfaceAtom);
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
