import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { SessionResumeResult } from '@contracts/backend/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { resumeSessionIntoRuntime } from '@backend/runtime/sessionResume.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';

function fakeClient(overrides: Partial<RuntimeBackendClient> = {}): RuntimeBackendClient {
  return {
    submit: vi.fn(),
    onTranscriptEvent: vi.fn(() => () => undefined),
    clearConversation: vi.fn(),
    cancelTurn: vi.fn(),
    gitStatus: vi.fn().mockResolvedValue('main'),
    listProviders: vi.fn(),
    getActiveSelection: vi.fn(),
    setActiveSelection: vi.fn(),
    clearProviderKey: vi.fn(),
    setProviderKey: vi.fn(),
    listModels: vi.fn(),
    listSessions: vi.fn(),
    resumeSession: vi.fn(),
    onReady: vi.fn(),
    ensureStarted: vi.fn(),
    relaunch: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  } as unknown as RuntimeBackendClient;
}

function resumed(
  workspaceCwd: string,
  sessionId = 'sess-1'
): SessionResumeResult {
  return {
    sessionId,
    workspaceCwd,
    canonicalWorkspaceCwd: workspaceCwd,
    turns: []
  };
}

describe('resumeSessionIntoRuntime', () => {
  it('relaunches into a different workspace before resuming and updates cwd state on success', async () => {
    const store = createStore();
    store.set(workspaceCwdAtom, 'C:\\old');
    const client = fakeClient({
      relaunch: vi.fn(async () => undefined),
      resumeSession: vi.fn(async () => resumed('C:\\new'))
    });

    const result = await resumeSessionIntoRuntime({
      store,
      client,
      sessionId: 'sess-1',
      workspaceCwd: 'C:\\new'
    });

    expect(client.relaunch).toHaveBeenCalledWith('C:\\new');
    expect(client.resumeSession).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    expect(store.get(workspaceCwdAtom)).toBe('C:\\new');
    expect(result.workspaceCwd).toBe('C:\\new');
  });

  it('rolls back to the previous workspace when resume fails after a relaunch', async () => {
    const store = createStore();
    store.set(workspaceCwdAtom, 'C:\\old');
    store.set(gitStatusLabelAtom, 'main');
    const client = fakeClient({
      relaunch: vi.fn(async () => undefined),
      resumeSession: vi.fn(async () => {
        throw new Error('resume failed');
      }),
      gitStatus: vi.fn().mockResolvedValue('main')
    });

    await expect(
      resumeSessionIntoRuntime({
        store,
        client,
        sessionId: 'sess-1',
        workspaceCwd: 'C:\\new'
      })
    ).rejects.toThrow('resume failed');

    expect(client.relaunch).toHaveBeenNthCalledWith(1, 'C:\\new');
    expect(client.relaunch).toHaveBeenNthCalledWith(2, 'C:\\old');
    expect(store.get(workspaceCwdAtom)).toBe('C:\\old');
  });
});
