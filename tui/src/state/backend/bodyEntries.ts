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
};

export function queueToBodyEntries(queue: readonly QueueItem[]): BodyEntry[] {
  return queue.flatMap((item) => {
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

export function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendClientError) {
    return `Rust backend failed: ${error.message}`;
  }
  return `Rust backend failed: ${error instanceof Error ? error.message : String(error)}`;
}
