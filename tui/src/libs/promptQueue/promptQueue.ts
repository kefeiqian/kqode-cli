import { BackendClientError } from '@contracts/backend/index.ts';
import type { SubmitOutcome } from '@contracts/backend/index.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';

export type QueueItemState = 'active' | 'queued' | 'settled';

export type BackendResult = {
  kind:
    | typeof BodyEntryKind.Assistant
    | typeof BodyEntryKind.Success
    | typeof BodyEntryKind.Error;
  text: string;
};

/** Shown when a prompt is submitted with no backend client wired into the seam. */
export const BACKEND_UNAVAILABLE_MESSAGE = 'Rust backend unavailable';

/** Shown when provider configuration has not landed in this bootstrap slice. */
export const NEEDS_CONFIGURATION_MESSAGE =
  'Provider configuration is not available yet. Continue with the provider setup PR.';

export type QueueItem = {
  id: number;
  text: string;
  state: QueueItemState;
  result?: BackendResult;
};

/** Cached body entries for one queue item. */
type ItemEntriesCacheSlot = { entries: BodyEntry[] };

// Body entries for an unchanged item are stable, so memoize them per item
// identity. `QueueItem` objects are immutable — state/result transitions create a
// new object (see the prompt-queue atoms) — so a cache hit needs only an identity
// match. This keeps `BodyEntry` references stable (so downstream row wrapping
// stays cached) and skips re-sanitizing the whole transcript on every render.
// Settled/cleared items are GC'd from the WeakMap once the queue drops them.
const entriesByItem = new WeakMap<QueueItem, ItemEntriesCacheSlot>();

/**
 * Maps the prompt queue to transcript body entries.
 *
 * Results are memoized per item (see `entriesByItem`), so an unchanged item
 * returns identical `BodyEntry` references and only a new item object is rebuilt.
 */
export function queueToBodyEntries(queue: readonly QueueItem[]): BodyEntry[] {
  return queue.flatMap((item) => {
    const cached = entriesByItem.get(item);
    if (cached !== undefined) {
      return cached.entries;
    }

    const entries = buildItemEntries(item);
    entriesByItem.set(item, { entries });
    return entries;
  });
}

function buildItemEntries(item: QueueItem): BodyEntry[] {
  const promptText = sanitizeDisplayText(item.text);
  const promptEntry: BodyEntry =
    item.state === 'queued'
      ? { id: `prompt-${item.id}`, kind: BodyEntryKind.Pending, text: promptText }
      : { id: `prompt-${item.id}`, kind: BodyEntryKind.User, text: promptText };

  if (item.result !== undefined) {
    return [
      promptEntry,
      { id: `result-${item.id}`, kind: item.result.kind, text: item.result.text }
    ];
  }

  return [promptEntry];
}

/** Maps a submitted turn's terminal {@link SubmitOutcome} to a transcript result. */
export function outcomeToResult(outcome: SubmitOutcome): BackendResult {
  switch (outcome.kind) {
    case 'needsConfiguration':
      return {
        kind: BodyEntryKind.Error,
        text: sanitizeDisplayText(NEEDS_CONFIGURATION_MESSAGE)
      };
  }
}

export function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendClientError) {
    return `Rust backend failed: ${error.message}`;
  }
  return `Rust backend failed: ${error instanceof Error ? error.message : String(error)}`;
}
