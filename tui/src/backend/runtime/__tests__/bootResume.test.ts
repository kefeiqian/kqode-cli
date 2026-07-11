import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_STATUS_IDLE } from '@contracts/backend/index.ts';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { currentSessionIdAtom, workspaceCwdAtom } from '@state/global/index.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';
import { BootResumeError } from '@backend/runtime/sessionResume.ts';
import { applyBootResume, bootResumeErrorMessage } from '@backend/runtime/bootResume.ts';

function fakeClient(overrides: Partial<RuntimeBackendClient> = {}): RuntimeBackendClient {
  return {
    listSessions: vi.fn(),
    resumeSession: vi.fn(),
    relaunch: vi.fn(async () => undefined),
    gitStatus: vi.fn().mockResolvedValue(null),
    ...overrides
  } as unknown as RuntimeBackendClient;
}

describe('applyBootResume', () => {
  it('throws BootResumeError and tears down for an unknown id (covers R11)', async () => {
    const client = fakeClient({ listSessions: vi.fn(async () => ({ sessions: [] })) });
    const onFailure = vi.fn();

    await expect(
      applyBootResume({ store: createStore(), client, resumeSessionId: 'nope', onFailure })
    ).rejects.toBeInstanceOf(BootResumeError);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('treats a blank id as an error without hitting the backend', async () => {
    const client = fakeClient({ listSessions: vi.fn() });
    const onFailure = vi.fn();

    await expect(
      applyBootResume({ store: createStore(), client, resumeSessionId: '   ', onFailure })
    ).rejects.toBeInstanceOf(BootResumeError);
    expect(client.listSessions).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('no-ops when no resume id is given (covers R10)', async () => {
    const client = fakeClient({ listSessions: vi.fn() });
    const onFailure = vi.fn();

    await applyBootResume({ store: createStore(), client, resumeSessionId: undefined, onFailure });

    expect(client.listSessions).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('resumes a valid id and seeds the current session id (covers R6, R8)', async () => {
    const store = createStore();
    store.set(workspaceCwdAtom, 'C:\\old');
    const session: SessionSummary = {
      sessionId: 'conv-1',
      summary: 's',
      status: SESSION_STATUS_IDLE,
      modifiedAt: 0,
      createdAt: 0,
      folder: 'C:\\new'
    };
    const client = fakeClient({
      listSessions: vi.fn(async () => ({ sessions: [session] })),
      resumeSession: vi.fn(async () => ({
        sessionId: 'conv-1',
        workspaceCwd: 'C:\\new',
        canonicalWorkspaceCwd: 'C:\\new',
        turns: []
      }))
    });
    const onFailure = vi.fn();

    await applyBootResume({ store, client, resumeSessionId: 'conv-1', onFailure });

    expect(store.get(currentSessionIdAtom)).toBe('conv-1');
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('bootResumeErrorMessage', () => {
  it('names the offending id and points at the /resume recovery path', () => {
    const message = bootResumeErrorMessage(new BootResumeError('conv-x'));
    expect(message).toContain('conv-x');
    expect(message).toContain('/resume');
  });
});
