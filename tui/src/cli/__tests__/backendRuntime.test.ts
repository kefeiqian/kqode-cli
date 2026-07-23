import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BACKEND_LOADING_HINT } from '@constants/statusHint.ts';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { startupStatusHintAtom } from '@state/ui/statusHint.ts';
import { enqueuePromptAtom } from '@state/promptQueue/index.ts';
import { submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { startBackendRuntime } from '@/cli/backendRuntime.ts';
import type { RuntimeBackendClient } from '@/cli/backendRuntime.ts';

function fakeClient(overrides: Partial<RuntimeBackendClient> = {}): RuntimeBackendClient {
  return {
    submit: vi.fn(),
    gitStatus: vi.fn().mockResolvedValue(null),
    pullRequest: vi.fn().mockResolvedValue(null),
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    ...overrides
  } as unknown as RuntimeBackendClient;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('startBackendRuntime', () => {
  it('injects the client and eagerly starts it behind the loading hint', async () => {
    const store = createStore();
    const client = fakeClient();

    const dispose = startBackendRuntime(store, client);

    expect(store.get(backendClientAtom)).toBe(client);
    expect(client.ensureStarted).toHaveBeenCalledTimes(1);
    expect(store.get(startupStatusHintAtom)).toEqual(BACKEND_LOADING_HINT);

    await flushMicrotasks();

    expect(store.get(startupStatusHintAtom)).toBeUndefined();
    expect(store.get(backendClientAtom)).toBe(client);

    // The working-tree label refreshes once at bootstrap, then the static PR
    // lookup runs once for the session.
    expect(client.gitStatus).toHaveBeenCalledTimes(1);
    expect(client.pullRequest).toHaveBeenCalledTimes(1);

    dispose();
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(store.get(backendClientAtom)).toBeUndefined();
  });

  it('keeps the Dead-state client in the seam when eager start fails so submits can retry', async () => {
    const store = createStore();
    const client = fakeClient({
      ensureStarted: vi.fn().mockRejectedValue(new Error('launch failed'))
    });

    const dispose = startBackendRuntime(store, client);
    expect(store.get(backendClientAtom)).toBe(client);

    await flushMicrotasks();

    // A failed start must not silently drop the seam: the client stays so the
    // next submit retries via ensureSession() instead of vanishing.
    expect(client.dispose).not.toHaveBeenCalled();
    expect(store.get(backendClientAtom)).toBe(client);
    expect(store.get(startupStatusHintAtom)).toBeUndefined();

    dispose();
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(store.get(backendClientAtom)).toBeUndefined();
  });

  it('settles a visible error entry for a submit after a failed start (no silent drop)', async () => {
    const store = createStore();
    const failure = new BackendClientError(BackendErrorKind.Launch, 'backend unavailable');
    const client = fakeClient({
      ensureStarted: vi.fn().mockRejectedValue(failure),
      submit: vi.fn().mockRejectedValue(failure)
    });

    startBackendRuntime(store, client);
    await flushMicrotasks();
    expect(store.get(backendClientAtom)).toBe(client);

    await store.set(enqueuePromptAtom, 'still here?');

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.some((entry) => entry.kind === 'error')).toBe(true);
    expect(client.submit).toHaveBeenCalledWith({ text: 'still here?' });
  });
});
