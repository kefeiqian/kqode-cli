import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { queueToBodyEntries } from '@libs/promptQueue/promptQueue.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';

const UNSEQUENCED_ROW_ORDER = Number.MAX_SAFE_INTEGER;

/** A row produced only by the TypeScript client, never by backend events. */
export type ClientOnlyRow = {
  id: number;
  submissionSequence: number;
  kind: typeof BodyEntryKind.Error | typeof BodyEntryKind.Muted | typeof BodyEntryKind.Success;
  text: string;
};

type OrderedEntryGroup = {
  sequence: number;
  order: number;
  entries: BodyEntry[];
};

/** Interleaves backend-mirrored turns with client-only notices by submit order. */
export function composeTranscriptRows(
  queue: readonly QueueItem[],
  clientRows: readonly ClientOnlyRow[],
  streamingTextById?: ReadonlyMap<number, string>
): BodyEntry[] {
  const backendGroups = queue.map<OrderedEntryGroup>((item, order) => ({
    sequence: item.submissionSequence ?? UNSEQUENCED_ROW_ORDER,
    order,
    entries: queueToBodyEntries([item], streamingTextById)
  }));
  const clientGroups = clientRows.map<OrderedEntryGroup>((row, index) => ({
    sequence: row.submissionSequence,
    order: queue.length + index,
    entries: [clientOnlyEntry(row)]
  }));

  return [...backendGroups, ...clientGroups]
    .sort((left, right) => left.sequence - right.sequence || left.order - right.order)
    .flatMap((group) => group.entries);
}

function clientOnlyEntry(row: ClientOnlyRow): BodyEntry {
  return {
    id: `client-${row.id}`,
    kind: row.kind,
    text: sanitizeDisplayText(row.text)
  };
}
