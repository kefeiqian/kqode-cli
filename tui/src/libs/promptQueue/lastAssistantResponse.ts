import { BodyEntryKind } from '@constants/bodyEntry.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

/** Returns the newest settled assistant response text from `queue`, if present. */
export function lastAssistantResponse(queue: readonly QueueItem[]): string | undefined {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index];
    if (
      item?.state === 'settled' &&
      item.result?.kind === BodyEntryKind.Assistant
    ) {
      return item.result.text;
    }
  }
  return undefined;
}
