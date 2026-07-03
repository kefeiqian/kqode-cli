import { BackendClientError } from '@contracts/backend/index.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';

export type QueueItemState = 'active' | 'queued' | 'settled';

export type BackendResult = { kind: 'success' | 'error'; text: string };

/** Shown when a prompt is submitted with no backend client wired into the seam. */
export const BACKEND_UNAVAILABLE_MESSAGE = 'Rust backend unavailable';

export type QueueItem = {
  id: number;
  text: string;
  state: QueueItemState;
  result?: BackendResult;
  /** `'note'` items are client-side output (e.g. `/help`); they never reach the backend. */
  kind?: 'prompt' | 'note';
};

export function queueToBodyEntries(queue: readonly QueueItem[]): BodyEntry[] {
  return queue.flatMap((item) => {
    if (item.kind === 'note') {
      return noteToBodyEntries(item);
    }

    const promptText = sanitizeDisplayText(item.text);
    const promptEntry: BodyEntry =
      item.state === 'queued'
        ? { id: `prompt-${item.id}`, kind: 'pending', text: promptText }
        : { id: `prompt-${item.id}`, kind: 'prompt', text: promptText };

    return item.result === undefined
      ? [promptEntry]
      : [promptEntry, { id: `result-${item.id}`, kind: item.result.kind, text: item.result.text }];
  });
}

/**
 * Renders a client-side note as one `info` row per line. A single multi-line
 * `info` entry would flatten, because the assistant-row renderer wraps without
 * preserving hard line breaks — so `/help` needs one entry per command line.
 */
function noteToBodyEntries(item: QueueItem): BodyEntry[] {
  return sanitizeDisplayText(item.text)
    .split('\n')
    .map((line, index) => ({ id: `note-${item.id}-${index}`, kind: 'info', text: line }));
}

export function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendClientError) {
    return `Rust backend failed: ${error.message}`;
  }
  return `Rust backend failed: ${error instanceof Error ? error.message : String(error)}`;
}
