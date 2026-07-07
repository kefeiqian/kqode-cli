import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { BACKEND_LOADING_HINT, startupStatusHintAtom } from '@state/ui/statusHint.ts';
import { enqueuePromptAtom } from '@state/promptQueue/index.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { startBackendRuntime } from '@backend/runtime/backendRuntime.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';

function fakeClient(overrides: Partial<RuntimeBackendClient> = {}): RuntimeBackendClient {
  return {
    submit: vi.fn(),
    onTranscriptEvent: vi.fn(() => () => undefined),
    clearConversation: vi.fn(),
    cancelTurn: vi.fn(),
    gitStatus: vi.fn().mockResolvedValue(null),
    onReady: vi.fn(),
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    ...overrides
  } as unknown as RuntimeBackendClient;
}

function fakeLogger() {
  return { log: vi.fn(), openSession: vi.fn(), openOrphan: vi.fn(), close: vi.fn() };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('startBackendRuntime', () => {
  it('injects the client and eagerly starts it behind the loading hint', async () => {
    const store = createStore();
    const client = fakeClient();
    const logger = fakeLogger();

    const dispose = startBackendRuntime(store, client, logger);

    expect(store.get(backendClientAtom)).toBe(client);
    expect(client.ensureStarted).toHaveBeenCalledTimes(1);
    expect(store.get(startupStatusHintAtom)).toEqual(BACKEND_LOADING_HINT);

    // The runtime registers a readiness listener; firing it opens the session.
    const onReadyListener = (client.onReady as unknown as {
      mock: { calls: Array<[(sessionId: string) => void]> };
    }).mock.calls[0][0];
    onReadyListener('sess-42');
    expect(logger.openSession).toHaveBeenCalledWith('sess-42');
    expect(logger.log).toHaveBeenCalledWith({ event: 'backendReady', sessionId: 'sess-42' });

    await flushMicrotasks();

    expect(store.get(startupStatusHintAtom)).toBeUndefined();
    expect(store.get(backendClientAtom)).toBe(client);

    dispose();
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(logger.close).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith({ event: 'sessionExit' });
    expect(store.get(backendClientAtom)).toBeUndefined();
  });

  it('keeps the Dead-state client in the seam when eager start fails so submits can retry', async () => {
    const store = createStore();
    const client = fakeClient({
      ensureStarted: vi.fn().mockRejectedValue(new Error('launch failed'))
    });
    const logger = fakeLogger();
    store.set(bodyScrollOffsetRowsAtom, 12);

    const dispose = startBackendRuntime(store, client, logger);
    expect(store.get(backendClientAtom)).toBe(client);

    await flushMicrotasks();

    // Startup failed without readiness: buffered events flush to an orphan session.
    expect(logger.openOrphan).toHaveBeenCalledTimes(1);
    expect(logger.openSession).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith({
      event: 'backendStartFailed',
      message: 'launch failed'
    });
    // A failed start must not silently drop the seam: the client stays so the
    // next submit retries via ensureSession() instead of vanishing.
    expect(client.dispose).not.toHaveBeenCalled();
    expect(store.get(backendClientAtom)).toBe(client);
    expect(store.get(startupStatusHintAtom)).toBeUndefined();
    expect(store.get(submittedPromptEntriesAtom)).toContainEqual(
      expect.objectContaining({ kind: 'error', text: 'launch failed' })
    );
    expect(store.get(bodyScrollOffsetRowsAtom)).toBe(0);

    dispose();
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(store.get(backendClientAtom)).toBeUndefined();
  });

  it('does not append startup errors after runtime disposal', async () => {
    const store = createStore();
    let rejectStart: ((error: Error) => void) | undefined;
    const client = fakeClient({
      ensureStarted: vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectStart = reject;
          })
      )
    });
    const logger = fakeLogger();

    const dispose = startBackendRuntime(store, client, logger);
    dispose();
    rejectStart?.(new Error('late launch failed'));
    await flushMicrotasks();

    expect(store.get(submittedPromptEntriesAtom)).toEqual([]);
    expect(logger.openOrphan).not.toHaveBeenCalled();
    expect(store.get(startupStatusHintAtom)).toBeUndefined();
  });

  it('does not refresh git status after startup resolves post-disposal', async () => {
    const store = createStore();
    let resolveStart: (() => void) | undefined;
    const client = fakeClient({
      ensureStarted: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          })
      ),
      gitStatus: vi.fn().mockResolvedValue('main')
    });

    const dispose = startBackendRuntime(store, client, fakeLogger());
    dispose();
    resolveStart?.();
    await flushMicrotasks();

    expect(client.gitStatus).not.toHaveBeenCalled();
    expect(store.get(startupStatusHintAtom)).toBeUndefined();
  });

  it('does not write git status after disposal while refresh is in flight', async () => {
    const store = createStore();
    let resolveStart: (() => void) | undefined;
    let resolveGitStatus: ((status: string) => void) | undefined;
    const client = fakeClient({
      ensureStarted: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          })
      ),
      gitStatus: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveGitStatus = resolve;
          })
      )
    });

    const dispose = startBackendRuntime(store, client, fakeLogger());
    resolveStart?.();
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.gitStatus).toHaveBeenCalledTimes(1);

    dispose();
    resolveGitStatus?.('main');
    await flushMicrotasks();

    expect(store.get(gitStatusLabelAtom)).toBeUndefined();
  });

  it('settles a visible error entry for a submit after a failed start (no silent drop)', async () => {
    const store = createStore();
    const failure = new BackendClientError(BackendErrorKind.Launch, 'backend unavailable');
    const client = fakeClient({
      ensureStarted: vi.fn().mockRejectedValue(failure),
      submit: vi.fn().mockRejectedValue(failure)
    });

    startBackendRuntime(store, client, fakeLogger());
    await flushMicrotasks();
    expect(store.get(backendClientAtom)).toBe(client);

    await store.set(enqueuePromptAtom, 'still here?');

    const entries = store.get(submittedPromptEntriesAtom);
    expect(entries.some((entry) => entry.kind === 'error')).toBe(true);
    expect(client.submit).toHaveBeenCalledWith({ turnId: expect.any(String), text: 'still here?' });
  });
});
