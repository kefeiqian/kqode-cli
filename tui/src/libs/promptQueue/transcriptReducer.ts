import {
  SETTLED_KIND_NEEDS_CONFIGURATION,
  TURN_STATE_ACTIVE
} from '@contracts/backend/index.ts';
import type { TranscriptEvent } from '@contracts/backend/index.ts';
import type { QueueItem } from '@libs/promptQueue/promptQueue.ts';
import { turnResultToBackendResult } from '@libs/promptQueue/promptQueue.ts';

/** Pure transcript reducer state owned by Jotai atoms at the state layer. */
export type TranscriptReducerState = {
  queue: QueueItem[];
  streamingTextById: ReadonlyMap<number, string>;
  generationByTurnId: ReadonlyMap<string, number>;
  settledTurnIds: ReadonlySet<string>;
  nextQueueItemId: number;
};

/** Result of reducing one backend transcript event. */
export type TranscriptReduceResult = {
  state: TranscriptReducerState;
  effect?: { type: 'needsConfiguration' | 'auth'; turnText: string };
};

/** Reduces one backend event into the queue-shaped transcript read-model. */
export function reduceTranscriptEvent(
  state: TranscriptReducerState,
  event: TranscriptEvent,
  currentGeneration: number
): TranscriptReduceResult {
  if (state.settledTurnIds.has(event.turnId)) {
    return { state };
  }
  const stamped = stampTurnGeneration(state, event.turnId, currentGeneration);
  if (stamped === undefined) {
    return { state };
  }
  const next = ensureTurn(stamped, event);

  if (event.type === 'enqueued') {
    return { state: setTurnState(next, event.turnId, event.state) };
  }
  if (event.type === 'activated') {
    return { state: activateTurn(next, event.turnId) };
  }
  if (event.type === 'tokenDelta') {
    return { state: appendDelta(next, event.turnId, event.delta) };
  }
  return settleTurn(next, event);
}

function stampTurnGeneration(
  state: TranscriptReducerState,
  turnId: string,
  currentGeneration: number
): TranscriptReducerState | undefined {
  const knownGeneration = state.generationByTurnId.get(turnId);
  if (knownGeneration !== undefined) {
    return knownGeneration === currentGeneration ? state : undefined;
  }
  const generationByTurnId = new Map(state.generationByTurnId);
  generationByTurnId.set(turnId, currentGeneration);
  return { ...state, generationByTurnId };
}

function ensureTurn(state: TranscriptReducerState, event: TranscriptEvent): TranscriptReducerState {
  if (state.queue.some((item) => item.turnId === event.turnId)) {
    return state;
  }
  const item: QueueItem = {
    id: state.nextQueueItemId,
    turnId: event.turnId,
    text: '',
    state: event.type === 'enqueued' ? queueState(event.state) : 'active'
  };
  return {
    ...state,
    nextQueueItemId: state.nextQueueItemId + 1,
    queue: [...state.queue, item]
  };
}

function setTurnState(
  state: TranscriptReducerState,
  turnId: string,
  backendState: string
): TranscriptReducerState {
  return backendState === TURN_STATE_ACTIVE
    ? activateTurn(state, turnId)
    : updateTurn(state, turnId, (item) => ({ ...item, state: queueState(backendState) }));
}

function activateTurn(state: TranscriptReducerState, turnId: string): TranscriptReducerState {
  return {
    ...state,
    queue: state.queue.map((item) => {
      if (item.state === 'settled') {
        return item;
      }
      return item.turnId === turnId ? { ...item, state: 'active' } : { ...item, state: 'queued' };
    })
  };
}

function appendDelta(
  state: TranscriptReducerState,
  turnId: string,
  delta: string
): TranscriptReducerState {
  const item = state.queue.find((candidate) => candidate.turnId === turnId);
  if (item === undefined || delta.length === 0) {
    return state;
  }
  const streamingTextById = new Map(state.streamingTextById);
  streamingTextById.set(item.id, `${streamingTextById.get(item.id) ?? ''}${delta}`);
  return { ...state, streamingTextById };
}

function settleTurn(
  state: TranscriptReducerState,
  event: Extract<TranscriptEvent, { type: 'settled' }>
): TranscriptReduceResult {
  const item = state.queue.find((candidate) => candidate.turnId === event.turnId);
  if (item === undefined) {
    return { state };
  }
  const settledTurnIds = new Set(state.settledTurnIds);
  settledTurnIds.add(event.turnId);
  const streamingTextById = new Map(state.streamingTextById);
  streamingTextById.delete(item.id);

  const nextState = updateTurn(
    { ...state, settledTurnIds, streamingTextById },
    event.turnId,
    (current) => ({ ...current, state: 'settled', result: turnResultToBackendResult(event.result) })
  );
  if (event.result.kind === SETTLED_KIND_NEEDS_CONFIGURATION) {
    return { state: nextState, effect: { type: 'needsConfiguration', turnText: item.text } };
  }
  if (event.result.kind === 'error' && event.result.errorKind === 'auth') {
    return { state: nextState, effect: { type: 'auth', turnText: item.text } };
  }
  return { state: nextState };
}

function updateTurn(
  state: TranscriptReducerState,
  turnId: string,
  update: (item: QueueItem) => QueueItem
): TranscriptReducerState {
  return {
    ...state,
    queue: state.queue.map((item) => (item.turnId === turnId ? update(item) : item))
  };
}

function queueState(backendState: string): QueueItem['state'] {
  return backendState === TURN_STATE_ACTIVE ? 'active' : 'queued';
}
