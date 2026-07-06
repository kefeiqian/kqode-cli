import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import {
  appendUnknownCommandNoticeAtom,
  clientOnlyRowsAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  newTurnIdAtom,
  promptQueueAtom,
  restoreComposerDraftAtom,
  transcriptEventAtom
} from '@state/promptQueue/index.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@libs/promptQueue/promptQueue.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom, Surface } from '@state/ui/index.ts';
import type { BackendClient, TranscriptEvent } from '@contracts/backend/index.ts';

function clientWithSubmit(submit: BackendClient['submit']): BackendClient {
  return {
    submit,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ persistenceAvailable: true, providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] })
  };
}

const needsConfiguration = (turnId: string): TranscriptEvent => ({
  type: 'settled',
  turnId,
  result: { kind: 'needsConfiguration', text: null, finishReason: null, errorKind: null, message: null }
});

describe('enqueuePromptAtom', () => {
  it('settles a visible error entry when no backend client is wired into the seam', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });

    await store.set(enqueuePromptAtom, 'hello');

    const errorEntry = store.get(submittedPromptEntriesAtom).find((entry) => entry.kind === 'error');
    expect(errorEntry?.text).toContain(BACKEND_UNAVAILABLE_MESSAGE);
    expect(store.get(clientOnlyRowsAtom)).toHaveLength(1);
  });

  it('optimistically appends the user row and submits a caller-minted turn id', async () => {
    const store = createStore();
    const submit = vi.fn(async () => undefined);
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(submit));

    await store.set(enqueuePromptAtom, 'hello');

    expect(submit).toHaveBeenCalledWith({ turnId: 'turn-1', text: 'hello' });
    expect(store.get(submittedPromptEntriesAtom)[0]).toMatchObject({ kind: 'user', text: 'hello' });
  });

  it('routes needsConfiguration settled events to login and restores the prompt', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'configure me');
    store.set(transcriptEventAtom, needsConfiguration('turn-1'));

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('configure me');
    expect(store.get(promptQueueAtom)).toEqual([]);
  });

  it('opens login once when multiple turns settle as unconfigured', async () => {
    const store = createStore();
    let nextId = 0;
    store.set(newTurnIdAtom, { newTurnId: () => `turn-${++nextId}` });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'first');
    await store.set(enqueuePromptAtom, 'second');
    store.set(transcriptEventAtom, needsConfiguration('turn-1'));
    store.set(transcriptEventAtom, needsConfiguration('turn-2'));

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('first');
  });

  it('routes auth errors to login, restores the prompt, and records the error', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'retry after key');
    store.set(transcriptEventAtom, {
      type: 'settled',
      turnId: 'turn-1',
      result: { kind: 'error', text: null, finishReason: null, errorKind: 'auth', message: 'key rejected' }
    });

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('retry after key');
    expect(store.get(submittedPromptEntriesAtom).at(-1)?.text).toContain('key rejected');
  });
});

describe('clearTranscriptAtom', () => {
  it('empties the queue and entries, resets scroll, and asks the backend to clear', async () => {
    const store = createStore();
    const clearConversation = vi.fn(async () => undefined);
    store.set(backendClientAtom, { ...clientWithSubmit(async () => undefined), clearConversation });
    await store.set(enqueuePromptAtom, 'hello');
    store.set(bodyScrollOffsetRowsAtom, 5);

    store.set(clearTranscriptAtom);

    expect(clearConversation).toHaveBeenCalledTimes(1);
    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });

  it('drops delayed backend events for turns that were cleared', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));
    await store.set(enqueuePromptAtom, 'clear me');

    store.set(clearTranscriptAtom);
    store.set(transcriptEventAtom, { type: 'tokenDelta', turnId: 'turn-1', delta: 'late' });
    store.set(transcriptEventAtom, {
      type: 'settled',
      turnId: 'turn-1',
      result: { kind: 'completed', text: 'late', finishReason: 'stop', errorKind: null, message: null }
    });

    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });

  it('clears local rows and scroll when the backend is unavailable', () => {
    const store = createStore();
    store.set(appendUnknownCommandNoticeAtom, { text: '/hepl', submissionSequence: 0 });
    store.set(bodyScrollOffsetRowsAtom, 4);

    store.set(clearTranscriptAtom);

    expect(store.get(clientOnlyRowsAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });

  it('keeps the local clear when the backend clear RPC rejects', async () => {
    const store = createStore();
    const clearConversation = vi.fn(async () => {
      throw new Error('dead backend');
    });
    store.set(backendClientAtom, { ...clientWithSubmit(async () => undefined), clearConversation });
    await store.set(enqueuePromptAtom, 'hello');

    store.set(clearTranscriptAtom);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clearConversation).toHaveBeenCalledTimes(1);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });
});

describe('settled git status refresh', () => {
  it('refreshes git status after a completed turn settles', async () => {
    const store = createStore();
    const gitStatus = vi.fn(async () => 'main*');
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, { ...clientWithSubmit(async () => undefined), gitStatus });

    await store.set(enqueuePromptAtom, 'hello');
    store.set(transcriptEventAtom, {
      type: 'settled',
      turnId: 'turn-1',
      result: { kind: 'completed', text: 'done', finishReason: 'stop', errorKind: null, message: null }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gitStatus).toHaveBeenCalledTimes(1);
  });
});
