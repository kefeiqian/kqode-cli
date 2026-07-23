import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { queueToBodyEntries } from '@libs/promptQueue/promptQueue.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

describe('queueToBodyEntries memoization', () => {
  it('returns identical entry references for an unchanged item', () => {
    const queue: QueueItem[] = [{ id: 1, text: 'hello', state: 'active' }];

    const first = queueToBodyEntries(queue);
    const second = queueToBodyEntries(queue);

    expect(second[0]).toBe(first[0]);
  });

  it('reuses both entries for a settled item across calls', () => {
    const item: QueueItem = {
      id: 2,
      text: 'done',
      state: 'settled',
      result: { kind: BodyEntryKind.Assistant, text: 'reply' }
    };

    const first = queueToBodyEntries([item]);
    const second = queueToBodyEntries([item]);

    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(first[1]).toMatchObject({ kind: BodyEntryKind.Assistant, text: 'reply' });
  });

  it('does not share cached entries between distinct item objects', () => {
    const a: QueueItem = { id: 4, text: 'x', state: 'active' };
    const b: QueueItem = { id: 4, text: 'x', state: 'active' };

    const entriesA = queueToBodyEntries([a]);
    const entriesB = queueToBodyEntries([b]);

    expect(entriesB[0]).not.toBe(entriesA[0]);
    expect(entriesB[0]).toEqual(entriesA[0]);
  });
});
