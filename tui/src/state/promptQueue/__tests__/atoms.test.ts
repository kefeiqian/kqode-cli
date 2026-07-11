import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

const { mockSetTerminalWindowTitle } = vi.hoisted(() => ({
  mockSetTerminalWindowTitle: vi.fn()
}));

vi.mock('@libs/terminal/windowTitle.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@libs/terminal/windowTitle.ts')>()),
  setTerminalWindowTitle: mockSetTerminalWindowTitle
}));

import {
  appendUnknownCommandNoticeAtom,
  clientOnlyRowsAtom,
  clearTranscriptAtom,
  enqueuePromptAtom,
  hydrateResumedTranscriptAtom,
  newTurnIdAtom,
  promptQueueAtom,
  resetTranscriptMirrorAtom,
  restoreComposerDraftAtom,
  transcriptEventAtom
} from '@state/promptQueue/index.ts';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  PROVIDER_NOT_CONFIGURED_MESSAGE
} from '@libs/promptQueue/promptQueue.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { backendClientAtom, currentSessionIdAtom, productVersionAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom, Surface } from '@state/ui/index.ts';
import {
  SETTLED_KIND_NEEDS_CONFIGURATION,
  type BackendClient,
  type TranscriptEvent
} from '@contracts/backend/index.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';
import { PRODUCT_NAME } from '@constants/product.ts';

function clientWithSubmit(submit: BackendClient['submit']): BackendClient {
  return {
    ...memoryBackendStub(),
    ...themeBackendStub(),
    submit,
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus: async () => null,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => undefined,
    clearProviderKey: async () => undefined,
    setProviderKey: async () => ({ outcome: 'unreachable', selectedModel: null }),
    listModels: async () => ({ status: 'failed', models: [] }),
    listSessions: async () => ({ sessions: [] }),
    resumeSession: async () => ({
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\workspace',
      canonicalWorkspaceCwd: 'C:\\workspace',
      turns: []
    })
  };
}

const needsConfiguration = (turnId: string): TranscriptEvent => ({
  type: 'settled',
  turnId,
  result: {
    kind: SETTLED_KIND_NEEDS_CONFIGURATION,
    text: null,
    finishReason: null,
    errorKind: null,
    message: PROVIDER_NOT_CONFIGURED_MESSAGE
  }
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

  it('keeps unconfigured turns on the home screen without opening a surface', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'configure me');
    store.set(transcriptEventAtom, needsConfiguration('turn-1'));

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
    expect(store.get(restoreComposerDraftAtom)).toBe('');
    expect(store.get(promptQueueAtom)).toHaveLength(1);
    expect(store.get(submittedPromptEntriesAtom)).toContainEqual(
      expect.objectContaining({ kind: BodyEntryKind.System, text: PROVIDER_NOT_CONFIGURED_MESSAGE })
    );
  });

  it('leaves repeated unconfigured turns on the home screen with an empty draft', async () => {
    const store = createStore();
    let nextId = 0;
    store.set(newTurnIdAtom, { newTurnId: () => `turn-${++nextId}` });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'first');
    await store.set(enqueuePromptAtom, 'second');
    store.set(transcriptEventAtom, needsConfiguration('turn-1'));
    store.set(transcriptEventAtom, needsConfiguration('turn-2'));

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
    expect(store.get(restoreComposerDraftAtom)).toBe('');
    expect(
      store
        .get(submittedPromptEntriesAtom)
        .filter((entry) => entry.kind === BodyEntryKind.System)
    ).toHaveLength(2);
  });

  it('routes auth errors to Connect, restores the prompt, and records the error', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, 'retry after key');
    store.set(transcriptEventAtom, {
      type: 'settled',
      turnId: 'turn-1',
      result: { kind: 'error', text: null, finishReason: null, errorKind: 'auth', message: 'key rejected' }
    });

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Connect);
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

  it('resets the terminal title to the product version', () => {
    const store = createStore();
    store.set(productVersionAtom, '1.2.3');

    store.set(clearTranscriptAtom);

    expect(mockSetTerminalWindowTitle).toHaveBeenCalledWith(PRODUCT_NAME, '1.2.3');
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

describe('currentSessionIdAtom lifecycle', () => {
  it('hydrateResumedTranscriptAtom sets the current session id from the resumed payload', () => {
    const store = createStore();
    store.set(hydrateResumedTranscriptAtom, {
      sessionId: 'conv-7',
      workspaceCwd: 'w',
      canonicalWorkspaceCwd: 'w',
      turns: []
    });
    expect(store.get(currentSessionIdAtom)).toBe('conv-7');
  });

  it('clearTranscriptAtom clears the current session id', () => {
    const store = createStore();
    store.set(currentSessionIdAtom, 'conv-1');
    store.set(clearTranscriptAtom);
    expect(store.get(currentSessionIdAtom)).toBeUndefined();
  });

  it('resetTranscriptMirrorAtom clears the current session id', () => {
    const store = createStore();
    store.set(currentSessionIdAtom, 'conv-1');
    store.set(resetTranscriptMirrorAtom);
    expect(store.get(currentSessionIdAtom)).toBeUndefined();
  });
});
