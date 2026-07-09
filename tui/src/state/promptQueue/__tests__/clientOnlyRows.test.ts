import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  appendUnknownCommandNoticeAtom,
  clientOnlyRowsAtom,
  enqueuePromptAtom,
  newTurnIdAtom,
  promptQueueAtom,
  streamingTextByIdAtom
} from '@state/promptQueue/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { submittedPromptEntriesAtom } from '@state/ui/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { memoryBackendStub } from '@test/backendMemoryStub.ts';
import { themeBackendStub } from '@test/backendThemeStub.ts';

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

describe('appendUnknownCommandNoticeAtom', () => {
  it('posts an error notice without adding a fake backend turn', () => {
    const store = createStore();

    store.set(appendUnknownCommandNoticeAtom, { text: '/nope arg1 arg2', submissionSequence: 0 });

    expect(store.get(submittedPromptEntriesAtom).map((entry) => entry.kind)).toEqual(['error']);
    expect(store.get(promptQueueAtom)).toEqual([]);
    expect(store.get(clientOnlyRowsAtom)).toHaveLength(1);
  });

  it('composes a notice submitted during a streaming turn after that turn', async () => {
    const store = createStore();
    store.set(newTurnIdAtom, { newTurnId: () => 'turn-1' });
    store.set(backendClientAtom, clientWithSubmit(async () => undefined));

    await store.set(enqueuePromptAtom, { text: 'hello', submissionSequence: 0 });
    store.set(streamingTextByIdAtom, new Map([[0, 'partial']]));
    store.set(appendUnknownCommandNoticeAtom, { text: '/hepl', submissionSequence: 1 });

    expect(store.get(submittedPromptEntriesAtom).map((entry) => entry.text)).toEqual([
      'hello',
      'partial',
      'Unknown command: /hepl'
    ]);
  });
});
