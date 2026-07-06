import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import {
  appendUnknownCommandAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  promptQueueAtom,
  restoreComposerDraftAtom
} from '@state/promptQueue/atoms.ts';
import { BACKEND_UNAVAILABLE_MESSAGE } from '@libs/promptQueue/promptQueue.ts';
import { backendClientAtom } from '@state/global/index.ts';
import {
  activeSurfaceAtom,
  bodyScrollOffsetRowsAtom,
  submittedPromptEntriesAtom,
  Surface
} from '@state/ui/index.ts';
import type {
  BackendClient,
  StreamCallbacks,
  StreamOutcome,
  StreamSubmitParams
} from '@contracts/backend/index.ts';

function clientWithSubmit(
  submitStreaming: BackendClient['submitStreaming']
): BackendClient {
  return {
    gitStatus: async () => null,
    listProviders: async () => ({ persistenceAvailable: true, providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    submitStreaming
  };
}

describe('enqueuePromptAtom', () => {
  it('settles a visible error entry when no backend client is wired into the seam', async () => {
    const store = createStore();

    await store.set(enqueuePromptAtom, 'hello');

    const entries = store.get(submittedPromptEntriesAtom);
    const errorEntry = entries.find((entry) => entry.kind === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.text).toContain(BACKEND_UNAVAILABLE_MESSAGE);
  });

  it('routes needsConfiguration to login and restores the prompt without transcript error', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWithSubmit(async () => ({ kind: 'needsConfiguration' }))
    );

    await store.set(enqueuePromptAtom, 'configure me');

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('configure me');
    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
  });

  it('opens login once and stops draining when multiple queued prompts need configuration', async () => {
    const store = createStore();
    let resolveFirst: ((outcome: StreamOutcome) => void) | undefined;
    const submitStreaming = vi.fn(
      (_params: StreamSubmitParams, _callbacks: StreamCallbacks) =>
        new Promise<StreamOutcome>((resolve) => {
          resolveFirst = resolve;
        })
    );
    store.set(backendClientAtom, clientWithSubmit(submitStreaming));

    const first = store.set(enqueuePromptAtom, 'first');
    await store.set(enqueuePromptAtom, 'second');
    await store.set(enqueuePromptAtom, 'third');
    resolveFirst?.({ kind: 'needsConfiguration' });
    await first;

    expect(submitStreaming).toHaveBeenCalledTimes(1);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('first');
    expect(store.get(promptQueueAtom)).toEqual([]);
  });

  it('routes auth errors to login, restores the prompt, and records the error', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWithSubmit(async () => ({
        kind: 'error',
        errorKind: 'auth',
        message: 'key rejected at chat'
      }))
    );

    await store.set(enqueuePromptAtom, 'retry after key');

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Login);
    expect(store.get(restoreComposerDraftAtom)).toBe('retry after key');
    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.map((entry) => entry.kind)).toEqual(['user', 'error']);
    expect(entries.at(-1)?.text).toContain('key rejected at chat');
  });

  it('streams connected submits to completion', async () => {
    const store = createStore();
    store.set(
      backendClientAtom,
      clientWithSubmit(async ({ text }, { onDelta }) => {
        onDelta(`reply: ${text}`);
        return { kind: 'completed', text: `reply: ${text}`, finishReason: 'stop' };
      })
    );

    await store.set(enqueuePromptAtom, 'hello');

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
    expect(store.get(restoreComposerDraftAtom)).toBe('');
    expect(store.get(submittedPromptEntriesAtom).at(-1)).toMatchObject({
      kind: 'assistant',
      text: 'reply: hello'
    });
  });
});

describe('clearTranscriptAtom', () => {
  it('empties the queue and entries and resets scroll', async () => {
    const store = createStore();
    await store.set(enqueuePromptAtom, 'hello');
    store.set(bodyScrollOffsetRowsAtom, 5);
    expect(store.get(submittedPromptEntriesAtom).length).toBeGreaterThan(0);

    store.set(clearTranscriptAtom);

    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });
});

describe('appendUnknownCommandAtom', () => {
  it('posts the raw command as a prompt entry and a red error entry without a backend call', () => {
    const store = createStore();

    store.set(appendUnknownCommandAtom, '/nope arg1 arg2');

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.map((entry) => ({ kind: entry.kind, text: entry.text }))).toEqual([
      { kind: 'user', text: '/nope arg1 arg2' },
      { kind: 'error', text: 'Unknown command: /nope' }
    ]);
    expect(store.get(promptQueueAtom).every((item) => item.state === 'settled')).toBe(true);
  });

  it('resets the scroll offset so the newest entry stays visible', () => {
    const store = createStore();
    store.set(bodyScrollOffsetRowsAtom, 5);

    store.set(appendUnknownCommandAtom, '/nope');

    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);
  });
});
