import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  SETTLED_KIND_CANCELLED,
  SETTLED_KIND_COMPLETED,
  SETTLED_KIND_NEEDS_CONFIGURATION,
  TURN_STATE_ACTIVE,
  TURN_STATE_PENDING
} from '@contracts/backend/index.ts';
import type { TranscriptEvent } from '@contracts/backend/index.ts';
import type { SettledKind } from '@contracts/backend/index.ts';
import type { TranscriptReducerState } from '@libs/promptQueue/transcriptReducer.ts';
import { reduceTranscriptEvent } from '@libs/promptQueue/transcriptReducer.ts';

const base = (): TranscriptReducerState => ({
  queue: [{ id: 0, turnId: 'turn-1', text: 'hello', state: 'active' }],
  streamingTextById: new Map(),
  generationByTurnId: new Map(),
  settledTurnIds: new Set(),
  nextQueueItemId: 1
});

const settled = (turnId = 'turn-1', kind: SettledKind = SETTLED_KIND_COMPLETED): TranscriptEvent => ({
  type: 'settled',
  turnId,
  result: { kind, text: 'done', finishReason: 'stop', errorKind: null, message: null }
});

function reduceAll(events: TranscriptEvent[], generation = 0) {
  return events.reduce(
    (state, event) => reduceTranscriptEvent(state, event, generation).state,
    base()
  );
}

describe('reduceTranscriptEvent', () => {
  it('streams a happy path into a final assistant row', () => {
    const state = reduceAll([
      { type: 'enqueued', turnId: 'turn-1', seq: 1, state: TURN_STATE_ACTIVE },
      { type: 'tokenDelta', turnId: 'turn-1', delta: 'do' },
      { type: 'tokenDelta', turnId: 'turn-1', delta: 'ne' },
      settled()
    ]);

    expect(state.streamingTextById.size).toBe(0);
    expect(state.queue[0]).toMatchObject({
      state: 'settled',
      result: { kind: BodyEntryKind.Assistant, text: 'done' }
    });
  });

  it('lazily creates a turn for tokenDelta before activation', () => {
    const state = reduceTranscriptEvent(
      { ...base(), queue: [], nextQueueItemId: 0 },
      { type: 'tokenDelta', turnId: 'late', delta: 'hi' },
      0
    ).state;

    expect(state.queue[0]).toMatchObject({ id: 0, turnId: 'late', state: 'active' });
    expect(state.streamingTextById.get(0)).toBe('hi');
  });

  it('keeps duplicate activated and settled events idempotent', () => {
    const activated: TranscriptEvent = { type: 'activated', turnId: 'turn-1' };
    let state = reduceAll([activated, activated, settled()]);
    state = reduceTranscriptEvent(state, settled(), 0).state;

    expect(state.queue).toHaveLength(1);
    expect(state.queue.filter((item) => item.state === 'active')).toHaveLength(0);
    expect(state.queue[0]?.result?.text).toBe('done');
  });

  it('drops events for a prior stamped generation', () => {
    const state = reduceTranscriptEvent(
      { ...base(), generationByTurnId: new Map([['turn-1', 0]]) },
      { type: 'tokenDelta', turnId: 'turn-1', delta: 'stale' },
      1
    ).state;

    expect(state.streamingTextById.size).toBe(0);
  });

  it('lazy-stamps a respawn-triggering submit under the current generation', () => {
    const state = reduceTranscriptEvent(
      base(),
      { type: 'tokenDelta', turnId: 'turn-1', delta: 'fresh' },
      1
    ).state;

    expect(state.generationByTurnId.get('turn-1')).toBe(1);
    expect(state.streamingTextById.get(0)).toBe('fresh');
  });

  it('drops all post-settled events for a turn', () => {
    let state = reduceAll([settled()]);
    state = reduceTranscriptEvent(state, { type: 'tokenDelta', turnId: 'turn-1', delta: 'late' }, 0).state;

    expect(state.queue[0]?.result?.text).toBe('done');
    expect(state.streamingTextById.size).toBe(0);
  });

  it('renders settled(cancelled) as a muted result', () => {
    const state = reduceAll([
      { type: 'enqueued', turnId: 'turn-1', seq: 1, state: TURN_STATE_PENDING },
      settled('turn-1', SETTLED_KIND_CANCELLED)
    ]);

    expect(state.queue[0]?.result).toEqual({ kind: BodyEntryKind.Muted, text: 'Cancelled' });
  });

  it('keeps needsConfiguration in the transcript as system guidance', () => {
    const state = reduceTranscriptEvent(
      base(),
      {
        type: 'settled',
        turnId: 'turn-1',
        result: {
          kind: SETTLED_KIND_NEEDS_CONFIGURATION,
          text: null,
          finishReason: null,
          errorKind: 'needsConfiguration',
          message: 'Use /connect to add a provider.'
        }
      },
      0
    ).state;

    expect(state.queue[0]?.result).toEqual({
      kind: BodyEntryKind.System,
      text: 'Use /connect to add a provider.'
    });
  });
});
