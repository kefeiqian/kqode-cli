import { BackendClientError } from '@contracts/backend/index.ts';
import type { StreamOutcome } from '@contracts/backend/index.ts';
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

export type QueueItem = {
  id: number;
  text: string;
  state: QueueItemState;
  result?: BackendResult;
};

/** Cached body entries for one queue item plus the streaming text they reflect. */
type ItemEntriesCacheSlot = { streamingText: string | undefined; entries: BodyEntry[] };

// Body entries for an unchanged item are stable, so memoize them per item
// identity. `QueueItem` objects are immutable — state/result transitions create a
// new object (see the prompt-queue atoms) and only the active turn's streaming
// text mutates in place — so a cache hit needs just an identity match plus an
// unchanged streaming string. This keeps `BodyEntry` references stable across
// tokens (so downstream row wrapping stays cached) and skips re-sanitizing the
// whole transcript on every delta. Settled/cleared items are GC'd from the
// WeakMap once the queue drops them.
const entriesByItem = new WeakMap<QueueItem, ItemEntriesCacheSlot>();

/**
 * Maps the prompt queue to transcript body entries. `streamingTextById` carries
 * the live assistant text for in-flight turns (see `streamingTextByIdAtom`); an
 * entry keyed by an unsettled item's `id` renders the streaming assistant row.
 *
 * Results are memoized per item (see `entriesByItem`), so an unchanged item
 * returns identical `BodyEntry` references and only a mutated (streaming) item is
 * rebuilt.
 */
export function queueToBodyEntries(
  queue: readonly QueueItem[],
  streamingTextById?: ReadonlyMap<number, string>
): BodyEntry[] {
  return queue.flatMap((item) => {
    const streamingText = streamingTextById?.get(item.id);
    const cached = entriesByItem.get(item);
    if (cached !== undefined && cached.streamingText === streamingText) {
      return cached.entries;
    }

    const entries = buildItemEntries(item, streamingText);
    entriesByItem.set(item, { streamingText, entries });
    return entries;
  });
}

function buildItemEntries(item: QueueItem, streamingText: string | undefined): BodyEntry[] {
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

  if (streamingText !== undefined) {
    return [
      promptEntry,
      {
        id: `stream-${item.id}`,
        kind: BodyEntryKind.Assistant,
        text: sanitizeDisplayText(streamingText)
      }
    ];
  }

  return [promptEntry];
}

/** Maps a streamed turn's terminal {@link StreamOutcome} to a transcript result. */
export function outcomeToResult(outcome: Exclude<StreamOutcome, { kind: 'needsConfiguration' }>): BackendResult {
  if (outcome.kind === 'completed') {
    return { kind: BodyEntryKind.Assistant, text: sanitizeDisplayText(outcome.text) };
  }
  return { kind: BodyEntryKind.Error, text: sanitizeDisplayText(outcome.message) };
}

export function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendClientError) {
    return `Rust backend failed: ${error.message}`;
  }
  return `Rust backend failed: ${error instanceof Error ? error.message : String(error)}`;
}
