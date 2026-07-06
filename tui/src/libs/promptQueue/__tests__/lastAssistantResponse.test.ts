import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { lastAssistantResponse } from '@libs/promptQueue/lastAssistantResponse.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';

type BackendResultKind = NonNullable<QueueItem['result']>['kind'];

describe('lastAssistantResponse', () => {
  it('returns the last settled assistant text', () => {
    expect(
      lastAssistantResponse([
        item(1, 'settled', BodyEntryKind.Assistant, 'first'),
        item(2, 'settled', BodyEntryKind.Error, 'failed'),
        item(3, 'settled', BodyEntryKind.Assistant, 'latest')
      ])
    ).toBe('latest');
  });

  it('returns undefined when only user, error, or pending items exist', () => {
    expect(
      lastAssistantResponse([
        { id: 1, text: 'user', state: 'settled' },
        item(2, 'settled', BodyEntryKind.Error, 'failed'),
        item(3, 'active', BodyEntryKind.Assistant, 'not done')
      ])
    ).toBeUndefined();
  });

  it('chooses the newest assistant among multiple settled results', () => {
    expect(
      lastAssistantResponse([
        item(1, 'settled', BodyEntryKind.Assistant, 'old'),
        item(2, 'settled', BodyEntryKind.Assistant, 'new')
      ])
    ).toBe('new');
  });
});

function item(
  id: number,
  state: QueueItem['state'],
  kind: BackendResultKind,
  text: string
): QueueItem {
  return { id, text: `prompt ${id}`, state, result: { kind, text } };
}
