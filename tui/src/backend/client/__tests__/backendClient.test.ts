import { PassThrough } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { type LaunchedBackend } from '@backend/process/backendProcess.ts';
import { ACK_MESSAGE } from '@contracts/backend/index.ts';
import { messageSubmitRequest, backendReadyNotification } from '@backend/protocol/messageProtocol.ts';
import type { MessageSubmitResult } from '@contracts/backend/index.ts';
import {
  BackendLifecycleState,
  createBackendClient
} from '@backend/client/backendClient.ts';
import { createSourceBackendClient } from '@backend/client/sourceBackendClient.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

type FakeBackend = {
  launched: LaunchedBackend;
  disposed: () => boolean;
  emitExit: () => void;
};

let openServers: MessageConnection[] = [];

function ack(server: MessageConnection): void {
  server.onRequest(messageSubmitRequest, ({ text }) => ({ message: ACK_MESSAGE, receivedText: text }));
}

function makeFakeBackend(
  configure: (server: MessageConnection) => void,
  options: { signalReady?: boolean } = {}
): FakeBackend {
  const { signalReady = true } = options;
  const backendStdout = new PassThrough();
  const backendStdin = new PassThrough();
  const exitListeners: Array<(exit: { code: number | null; signal: NodeJS.Signals | null }) => void> = [];
  let disposed = false;

  const server = createMessageConnection(
    new StreamMessageReader(backendStdin),
    new StreamMessageWriter(backendStdout)
  );
  configure(server);
  server.listen();
  if (signalReady) {
    void server.sendNotification(backendReadyNotification);
  }
  openServers.push(server);

  return {
    launched: {
      pid: 4321,
      stdin: backendStdin,
      stdout: backendStdout,
      stderr: new PassThrough(),
      onExit: (listener) => {
        exitListeners.push(listener);
      },
      dispose: () => {
        disposed = true;
      }
    },
    disposed: () => disposed,
    emitExit: () => {
      for (const listener of exitListeners) {
        listener({ code: 1, signal: null });
      }
    }
  };
}

afterEach(() => {
  for (const server of openServers) {
    server.dispose();
  }
  openServers = [];
});

describe('createBackendClient (fake backend)', () => {
  it('can prelaunch the backend before the first submit', async () => {
    const fake = makeFakeBackend(ack);
    const launch = vi.fn(async () => fake.launched);
    const client = createBackendClient({ launch });

    await client.ensureStarted();

    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(launch).toHaveBeenCalledTimes(1);

    const result = await client.submitMessage({ text: 'hello' });
    expect(result).toEqual({ message: ACK_MESSAGE, receivedText: 'hello' });
    expect(launch).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('starts idle and becomes ready after a successful submit', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    expect(client.getState()).toBe(BackendLifecycleState.Idle);
    const result = await client.submitMessage({ text: 'hello' });

    expect(result).toEqual({ message: ACK_MESSAGE, receivedText: 'hello' });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    client.dispose();
  });

  it('rejects with a timeout error when the backend never reports readiness', async () => {
    // A backend that spawns and can answer requests but never emits the one-shot
    // ready notification models the "spawned but silent" failure mode that
    // startupTimeoutMs must guard.
    const fake = makeFakeBackend(ack, { signalReady: false });
    const client = createBackendClient({ launch: async () => fake.launched, startupTimeoutMs: 50 });

    await expect(client.ensureStarted()).rejects.toMatchObject({
      kind: BackendErrorKind.Timeout
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    expect(fake.disposed()).toBe(true);
    client.dispose();
  });

  it('keeps the backend alive after a recoverable JSON-RPC method error', async () => {
    const fake = makeFakeBackend((server) =>
      server.onRequest(messageSubmitRequest, () => {
        throw new ResponseError(ErrorCodes.InvalidParams, 'invalid message submit params');
      })
    );
    const launch = vi.fn(async () => fake.launched);
    const client = createBackendClient({ launch });

    await expect(client.submitMessage({ text: 'x' })).rejects.toMatchObject({
      kind: BackendErrorKind.Protocol
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(fake.disposed()).toBe(false);

    await expect(client.submitMessage({ text: 'y' })).rejects.toMatchObject({
      kind: BackendErrorKind.Protocol
    });
    expect(launch).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('times out a hung request, marks the client dead, and respawns on the next submit', async () => {
    const hung = makeFakeBackend((server) =>
      server.onRequest(messageSubmitRequest, () => new Promise<MessageSubmitResult>(() => undefined))
    );
    const healthy = makeFakeBackend(ack);
    const backends = [hung, healthy];
    const launch = vi.fn(async () => backends.shift()?.launched as LaunchedBackend);
    const client = createBackendClient({ launch, requestTimeoutMs: 100 });

    await expect(client.submitMessage({ text: 'first' })).rejects.toMatchObject({
      kind: BackendErrorKind.Timeout
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    expect(hung.disposed()).toBe(true);

    const result = await client.submitMessage({ text: 'second' });
    expect(result.receivedText).toBe('second');
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(launch).toHaveBeenCalledTimes(2);
    client.dispose();
  });

  it('marks the client dead when the backend process exits', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    await client.submitMessage({ text: 'alive' });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);

    fake.emitExit();
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    client.dispose();
  });

  it('rejects submits after dispose without spawning a new backend', async () => {
    const fake = makeFakeBackend(ack);
    const launch = vi.fn(async () => fake.launched);
    const client = createBackendClient({ launch });

    await client.ensureStarted();
    expect(launch).toHaveBeenCalledTimes(1);

    client.dispose();

    await expect(client.submitMessage({ text: 'after dispose' })).rejects.toMatchObject({
      kind: BackendErrorKind.Launch
    });
    // The disposed client is terminal: no fresh backend is launched.
    expect(launch).toHaveBeenCalledTimes(1);
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
  });

  it('reclaims a backend launched after disposal during startup', async () => {
    const fake = makeFakeBackend(ack);
    let resolveLaunch: ((backend: LaunchedBackend) => void) | undefined;
    const launch = vi.fn(
      () =>
        new Promise<LaunchedBackend>((resolve) => {
          resolveLaunch = resolve;
        })
    );
    const client = createBackendClient({ launch });

    const submit = client.submitMessage({ text: 'race' });
    client.dispose();
    resolveLaunch?.(fake.launched);

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    expect(fake.disposed()).toBe(true);
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
  });
});

describe('createSourceBackendClient (integration)', () => {
  it(
    'starts the Rust backend, submits, and receives the ACK with exact receivedText',
    async () => {
      const client = createSourceBackendClient({ repoRoot, workspaceCwd: repoRoot });
      try {
        const result = await client.submitMessage({ text: '  café\n☕  ' });
        expect(result.message).toBe(ACK_MESSAGE);
        expect(result.receivedText).toBe('  café\n☕  ');
      } finally {
        client.dispose();
      }
    },
    INTEGRATION_TIMEOUT_MS
  );
});
