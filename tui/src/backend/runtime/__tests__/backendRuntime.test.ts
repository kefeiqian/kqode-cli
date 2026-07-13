import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

const { mockSetSessionWindowTitle } = vi.hoisted(() => ({
  mockSetSessionWindowTitle: vi.fn()
}));

vi.mock('@libs/terminal/windowTitle.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@libs/terminal/windowTitle.ts')>()),
  setSessionWindowTitle: mockSetSessionWindowTitle
}));

import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { SESSION_STATUS_CURRENT } from '@contracts/backend/index.ts';
import type { TranscriptEvent } from '@contracts/backend/index.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { currentSessionIdAtom } from '@state/global/session.ts';
import { BACKEND_LOADING_HINT, startupStatusHintAtom } from '@state/ui/statusHint.ts';
import { enqueuePromptAtom } from '@state/promptQueue/index.ts';
import { bodyScrollOffsetRowsAtom, submittedPromptEntriesAtom } from '@state/ui/index.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { startBackendRuntime } from '@backend/runtime/backendRuntime.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';

const SESSION_ID = '019f5a2b-15e0-7ef1-9ad2-10a132448b7';

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

  it('captures the durable session id from session.list on the first enqueued event', async () => {
    const store = createStore();
    let transcriptHandler: ((event: TranscriptEvent) => void) | undefined;
    const listSessions = vi.fn().mockResolvedValue({
      sessions: [
        {
          sessionId: SESSION_ID,
          summary: 's',
          status: SESSION_STATUS_CURRENT,
          modifiedAt: 0,
          createdAt: 0,
          folder: 'f'
        }
      ]
    });
    const client = fakeClient({
      onTranscriptEvent: vi.fn((handler: (event: TranscriptEvent) => void) => {
        transcriptHandler = handler;
        return () => undefined;
      }),
      listSessions
    });

    startBackendRuntime(store, client, fakeLogger());

    transcriptHandler?.({ type: 'enqueued', turnId: 't1', seq: 0, state: 'active' });
    await flushMicrotasks();

    expect(listSessions).toHaveBeenCalledTimes(1);
    expect(store.get(currentSessionIdAtom)).toBe(SESSION_ID);

    // A second enqueued while the id is known must not re-fetch.
    transcriptHandler?.({ type: 'enqueued', turnId: 't2', seq: 1, state: 'pending' });
    await flushMicrotasks();
    expect(listSessions).toHaveBeenCalledTimes(1);
  });

  it('leaves the session id unset when no session is Current', async () => {
    const store = createStore();
    let transcriptHandler: ((event: TranscriptEvent) => void) | undefined;
    const client = fakeClient({
      onTranscriptEvent: vi.fn((handler: (event: TranscriptEvent) => void) => {
        transcriptHandler = handler;
        return () => undefined;
      }),
      listSessions: vi.fn().mockResolvedValue({ sessions: [] })
    });

    startBackendRuntime(store, client, fakeLogger());
    transcriptHandler?.({ type: 'enqueued', turnId: 't1', seq: 0, state: 'active' });
    await flushMicrotasks();

    expect(store.get(currentSessionIdAtom)).toBeUndefined();
  });

  it('updates the terminal title when the generated session summary lands', () => {
    const store = createStore();
    let transcriptHandler: ((event: TranscriptEvent) => void) | undefined;
    const client = fakeClient({
      onTranscriptEvent: vi.fn((handler: (event: TranscriptEvent) => void) => {
        transcriptHandler = handler;
        return () => undefined;
      })
    });

    startBackendRuntime(store, client, fakeLogger());
    transcriptHandler?.({
      type: 'sessionSummaryUpdated',
      sessionId: SESSION_ID,
      summary: 'Hadamard 乘积'
    });

    expect(mockSetSessionWindowTitle).toHaveBeenCalledWith(PRODUCT_NAME, 'Hadamard 乘积');
  });
});
