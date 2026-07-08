import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { gitStatusLabelAtom, refreshGitStatusAtom } from '@state/ui/gitStatus.ts';

function clientWithGitStatus(gitStatus: BackendClient['gitStatus']): BackendClient {
  return {
    submit: vi.fn(),
    onTranscriptEvent: () => () => undefined,
    clearConversation: async () => undefined,
    cancelTurn: async () => undefined,
    gitStatus,
    listProviders: async () => ({ providers: [] }),
    getActiveSelection: async () => ({ providerId: null, modelId: null }),
    setActiveSelection: async () => {},
    clearProviderKey: async () => {},
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

describe('refreshGitStatusAtom', () => {
  it('stores the label the backend returns', async () => {
    const store = createStore();
    store.set(backendClientAtom, clientWithGitStatus(async () => '⎇ main*'));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusLabelAtom)).toBe('⎇ main*');
  });

  it('clears the label to undefined when the workspace is not a git repository', async () => {
    const store = createStore();
    store.set(gitStatusLabelAtom, '⎇ main');
    store.set(backendClientAtom, clientWithGitStatus(async () => null));

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusLabelAtom)).toBeUndefined();
  });

  it('keeps the last known label when the request fails', async () => {
    const store = createStore();
    store.set(gitStatusLabelAtom, '⎇ main');
    store.set(
      backendClientAtom,
      clientWithGitStatus(async () => {
        throw new Error('transport died');
      })
    );

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusLabelAtom)).toBe('⎇ main');
  });

  it('is a no-op when no backend client is wired', async () => {
    const store = createStore();

    await store.set(refreshGitStatusAtom);

    expect(store.get(gitStatusLabelAtom)).toBeUndefined();
  });
});
