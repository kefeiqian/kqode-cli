import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { composeTranscriptRows } from '@libs/promptQueue/rowComposition.ts';
import type { ClientOnlyRow } from '@libs/promptQueue/rowComposition.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

function notice(id: number, submissionSequence: number, text: string): ClientOnlyRow {
  return { id, submissionSequence, kind: BodyEntryKind.Error, text };
}

describe('composeTranscriptRows', () => {
  it('interleaves client-only rows by monotonic submit sequence', () => {
    const queue: QueueItem[] = [
      { id: 1, submissionSequence: 0, text: 'first', state: 'settled' },
      { id: 2, submissionSequence: 2, text: 'second', state: 'settled' }
    ];

    const entries = composeTranscriptRows(queue, [notice(1, 1, 'Unknown command: /hepl')]);

    expect(entries.map((entry) => entry.text)).toEqual([
      'first',
      'Unknown command: /hepl',
      'second'
    ]);
  });

  it('orders a notice submitted while a turn streams after that turn', () => {
    const queue: QueueItem[] = [
      { id: 1, submissionSequence: 0, text: 'streaming', state: 'active' }
    ];

    const entries = composeTranscriptRows(
      queue,
      [notice(1, 1, 'Unknown command: /nope')],
      new Map([[1, 'partial reply']])
    );

    expect(entries.map((entry) => entry.text)).toEqual([
      'streaming',
      'partial reply',
      'Unknown command: /nope'
    ]);
  });
});
