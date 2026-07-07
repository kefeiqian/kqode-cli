import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
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
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED,
  MODEL_LIST_STATUS_LOADED,
  SET_KEY_OUTCOME_CONNECTED,
  SET_KEY_OUTCOME_UNREACHABLE,
  SETTLED_KIND_CANCELLED,
  SETTLED_KIND_COMPLETED
} from '@contracts/backend/index.ts';
import {
  messageSubmitRequest,
  backendReadyNotification,
  tokenDeltaNotification,
  turnCancelRequest,
  turnSettledNotification
} from '@backend/protocol/messageProtocol.ts';
import {
  providerModelsRequest,
  providerSetKeyRequest
} from '@backend/protocol/providerProtocol.ts';
import type { MessageSubmitResult } from '@contracts/backend/index.ts';
import {
  BackendLifecycleState,
  createBackendClient
} from '@backend/client/backendClient.ts';
import { createSourceBackendClient } from '@backend/client/sourceBackendClient.ts';
import type { ModelListResult, SetKeyResult, TranscriptEvent } from '@contracts/backend/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

type FakeBackend = {
  launched: LaunchedBackend;
  disposed: () => boolean;
  emitExit: (exit?: { code: number | null; signal: NodeJS.Signals | null }) => void;
  closeServer: () => void;
};

let openServers: MessageConnection[] = [];

// A fake backend that streams the submitted text back as one delta then settles.
function ack(server: MessageConnection): void {
  server.onRequest(messageSubmitRequest, ({ text, turnId }) => {
    queueMicrotask(async () => {
      if (text.length > 0) {
        await server.sendNotification(tokenDeltaNotification, { turnId, delta: text });
      }
      await server.sendNotification(turnSettledNotification, {
        turnId,
        result: { kind: SETTLED_KIND_COMPLETED, text, finishReason: 'stop', errorKind: null, message: null }
      });
    });
    return { turnId };
  });
}

function makeFakeBackend(
  configure: (server: MessageConnection) => void,
  options: { signalReady?: boolean; stderrText?: string } = {}
): FakeBackend {
  const { signalReady = true, stderrText = '' } = options;
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
    void server.sendNotification(backendReadyNotification, { sessionId: 'test-session' });
  }
  openServers.push(server);

  return {
    launched: {
      pid: 4321,
      stdin: backendStdin,
      stdout: backendStdout,
      stderr: new PassThrough(),
      stderrText: () => stderrText,
      onExit: (listener) => {
        exitListeners.push(listener);
      },
      dispose: () => {
        disposed = true;
      }
    },
    disposed: () => disposed,
    emitExit: (exit = { code: 1, signal: null }) => {
      for (const listener of exitListeners) {
        listener(exit);
      }
    },
    closeServer: () => {
      server.dispose();
      backendStdout.destroy();
      backendStdin.destroy();
    }
  };
}

afterEach(() => {
  for (const server of openServers) {
    server.dispose();
  }
  openServers = [];
});

async function withTempHome<T>(run: () => Promise<T>): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-home-'));
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  const oldCargoHome = process.env.CARGO_HOME;
  const oldRustupHome = process.env.RUSTUP_HOME;
  const oldCustomApiKey = process.env.CUSTOM_API_KEY;
  const oldDebug = process.env.KQODE_DEBUG;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CUSTOM_API_KEY = '';
  process.env.KQODE_DEBUG = '0';
  if (oldHome !== undefined) {
    process.env.CARGO_HOME = oldCargoHome ?? path.join(oldHome, '.cargo');
    process.env.RUSTUP_HOME = oldRustupHome ?? path.join(oldHome, '.rustup');
  }
  try {
    return await run();
  } finally {
    restoreEnv('HOME', oldHome);
    restoreEnv('USERPROFILE', oldUserProfile);
    restoreEnv('CARGO_HOME', oldCargoHome);
    restoreEnv('RUSTUP_HOME', oldRustupHome);
    restoreEnv('CUSTOM_API_KEY', oldCustomApiKey);
    restoreEnv('KQODE_DEBUG', oldDebug);
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

function restoreEnv(
  name: 'HOME' | 'USERPROFILE' | 'CARGO_HOME' | 'RUSTUP_HOME' | 'CUSTOM_API_KEY' | 'KQODE_DEBUG',
  value: string | undefined
): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('createBackendClient (fake backend)', () => {
  it('can prelaunch the backend before the first submit', async () => {
    const fake = makeFakeBackend(ack);
    const launch = vi.fn(async () => fake.launched);
    const client = createBackendClient({ launch });

    await client.ensureStarted();

    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(launch).toHaveBeenCalledTimes(1);

    await client.submit({ turnId: 'turn-1', text: 'hello' });
    expect(launch).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('starts idle and becomes ready after a successful submit', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    expect(client.getState()).toBe(BackendLifecycleState.Idle);
    await client.submit({ turnId: 'turn-1', text: 'hello' });

    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    client.dispose();
  });

  it('fans transcript events from the connection in order', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });
    const events: string[] = [];
    client.onTranscriptEvent((event) => events.push(event.type));

    await client.submit({ turnId: 'turn-1', text: 'hello' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual(['tokenDelta', 'settled']);
    client.dispose();
  });

  it('reattaches transcript events and fires onReady after respawn', async () => {
    const hung = makeFakeBackend((server) =>
      server.onRequest(messageSubmitRequest, () => new Promise<MessageSubmitResult>(() => undefined))
    );
    const healthy = makeFakeBackend(ack);
    const backends = [hung, healthy];
    const launch = vi.fn(async () => backends.shift()?.launched as LaunchedBackend);
    const client = createBackendClient({ launch, requestTimeoutMs: 20 });
    const ready: string[] = [];
    const events: TranscriptEvent[] = [];
    client.onReady((sessionId) => ready.push(sessionId));
    client.onTranscriptEvent((event) => events.push(event));

    await expect(client.submit({ turnId: 'turn-1', text: 'hung' })).rejects.toMatchObject({
      kind: BackendErrorKind.Timeout
    });
    await client.submit({ turnId: 'turn-2', text: 'ok' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ready).toEqual(['test-session', 'test-session']);
    expect(events.some((event) => event.turnId === 'turn-2' && event.type === 'settled')).toBe(true);
    client.dispose();
  });

  it('sends cancelTurn and delivers the fake cancelled settlement', async () => {
    const fake = makeFakeBackend((server) => {
      server.onRequest(turnCancelRequest, ({ turnId }) => {
        queueMicrotask(() => void server.sendNotification(turnSettledNotification, {
          turnId,
          result: { kind: SETTLED_KIND_CANCELLED, text: null, finishReason: null, errorKind: null, message: null }
        }));
        return { ok: true };
      });
    });
    const client = createBackendClient({ launch: async () => fake.launched });
    const settled = new Promise((resolve) =>
      client.onTranscriptEvent((event) => {
        if (event.type === 'settled') {
          resolve(event);
        }
      })
    );

    await client.cancelTurn('turn-1');

    await expect(settled).resolves.toMatchObject({
      type: 'settled',
      turnId: 'turn-1',
      result: { kind: SETTLED_KIND_CANCELLED }
    });
    client.dispose();
  });

  it('synthesizes a terminal event for in-flight turns on fatal close', async () => {
    const fake = makeFakeBackend((server) => {
      server.onRequest(messageSubmitRequest, ({ turnId }) => ({ turnId }));
    });
    const client = createBackendClient({ launch: async () => fake.launched });
    const events: TranscriptEvent[] = [];
    client.onTranscriptEvent((event) => events.push(event));

    await client.submit({ turnId: 'turn-1', text: 'hang' });
    fake.emitExit();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const transportSettled = events.filter(
      (event) =>
        event.type === 'settled' &&
        event.turnId === 'turn-1' &&
        event.result.kind === 'error' &&
        event.result.errorKind === 'transport'
    );
    expect(transportSettled).toHaveLength(1);
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

  it('surfaces store-fatal stderr when the backend exits before readiness', async () => {
    const stderrText = 'KQODE_STORE_FATAL: delete /tmp/kqode.db and restart';
    const fake = makeFakeBackend(() => undefined, { signalReady: false, stderrText });
    const client = createBackendClient({ launch: async () => fake.launched, startupTimeoutMs: 200 });

    const start = client.ensureStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emitExit({ code: 75, signal: null });

    await expect(start).rejects.toMatchObject({
      kind: BackendErrorKind.Launch,
      message: stderrText
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    client.dispose();
  });

  it('uses a generic startup crash message without the store sentinel attribution', async () => {
    const fake = makeFakeBackend(() => undefined, {
      signalReady: false,
      stderrText: 'panic: unrelated'
    });
    const client = createBackendClient({ launch: async () => fake.launched, startupTimeoutMs: 200 });

    const start = client.ensureStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emitExit();

    await expect(start).rejects.toMatchObject({
      kind: BackendErrorKind.Launch,
      message: expect.stringContaining('backend exited before it reported readiness')
    });
    await expect(start).rejects.toMatchObject({
      message: expect.not.stringContaining('panic: unrelated')
    });
    client.dispose();
  });

  it('uses a generic signal-exit message without raw stderr attribution', async () => {
    const fake = makeFakeBackend(() => undefined, {
      signalReady: false,
      stderrText: 'panic: unrelated'
    });
    const client = createBackendClient({ launch: async () => fake.launched, startupTimeoutMs: 200 });

    const start = client.ensureStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.emitExit({ code: null, signal: 'SIGTERM' });

    await expect(start).rejects.toMatchObject({
      kind: BackendErrorKind.Launch,
      message: expect.stringContaining('signal SIGTERM')
    });
    await expect(start).rejects.toMatchObject({
      message: expect.not.stringContaining('panic: unrelated')
    });
    client.dispose();
  });

  it('fails fast when the startup transport closes before readiness', async () => {
    const fake = makeFakeBackend(() => undefined, {
      signalReady: false
    });
    const client = createBackendClient({
      launch: async () => fake.launched,
      startupTimeoutMs: 5_000
    });

    const start = client.ensureStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.closeServer();

    await expect(start).rejects.toMatchObject({
      kind: BackendErrorKind.Launch,
      message: 'backend connection closed before it reported readiness'
    });
    client.dispose();
  });

  it('surfaces store-fatal stderr if the transport closes before the process exit event', async () => {
    const stderrText = 'KQODE_STORE_FATAL: delete /tmp/kqode.db and restart';
    const fake = makeFakeBackend(() => undefined, {
      signalReady: false,
      stderrText
    });
    const client = createBackendClient({
      launch: async () => fake.launched,
      startupTimeoutMs: 5_000
    });

    const start = client.ensureStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.closeServer();

    await expect(start).rejects.toMatchObject({
      kind: BackendErrorKind.Launch,
      message: stderrText
    });
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

    await expect(
      client.submit({ turnId: 'turn-1', text: 'x' })
    ).rejects.toMatchObject({
      kind: BackendErrorKind.Protocol
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(fake.disposed()).toBe(false);

    await expect(
      client.submit({ turnId: 'turn-2', text: 'y' })
    ).rejects.toMatchObject({
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

    await expect(
      client.submit({ turnId: 'turn-1', text: 'first' })
    ).rejects.toMatchObject({
      kind: BackendErrorKind.Timeout
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    expect(hung.disposed()).toBe(true);

    await client.submit({ turnId: 'turn-2', text: 'second' });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(launch).toHaveBeenCalledTimes(2);
    client.dispose();
  });

  it('marks the client dead when the backend process exits', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    await client.submit({ turnId: 'turn-1', text: 'alive' });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);

    fake.emitExit();
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    client.dispose();
  });

  it('round-trips provider setKey outcomes', async () => {
    const fake = makeFakeBackend((server) => {
      server.onRequest(providerSetKeyRequest, ({ providerId, baseUrl, apiKey, label }) => {
        expect({ providerId, baseUrl, apiKey, label }).toEqual({
          providerId: 'custom',
          baseUrl: 'https://example.test/v1',
          apiKey: 'sk-test',
          label: 'Example'
        });
        return { outcome: SET_KEY_OUTCOME_CONNECTED, selectedModel: 'gpt-4o-mini' };
      });
    });
    const client = createBackendClient({ launch: async () => fake.launched });

    await expect(
      client.setProviderKey({
        providerId: 'custom',
        baseUrl: 'https://example.test/v1',
        apiKey: 'sk-test',
        label: 'Example'
      })
    ).resolves.toEqual({
      outcome: SET_KEY_OUTCOME_CONNECTED,
      selectedModel: 'gpt-4o-mini'
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    client.dispose();
  });

  it('round-trips model-list loaded empty and failed statuses', async () => {
    const responses: ModelListResult[] = [
      { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'gpt-4o-mini', ownedBy: null }] },
      { status: MODEL_LIST_STATUS_EMPTY, models: [] },
      { status: MODEL_LIST_STATUS_FAILED, models: [] }
    ];
    const fake = makeFakeBackend((server) => {
      server.onRequest(providerModelsRequest, ({ providerId }) => {
        expect(providerId).toBe('custom');
        return responses.shift() as ModelListResult;
      });
    });
    const client = createBackendClient({ launch: async () => fake.launched });

    await expect(client.listModels('custom')).resolves.toEqual({
      status: MODEL_LIST_STATUS_LOADED,
      models: [{ id: 'gpt-4o-mini', ownedBy: null }]
    });
    await expect(client.listModels('custom')).resolves.toEqual({
      status: MODEL_LIST_STATUS_EMPTY,
      models: []
    });
    await expect(client.listModels('custom')).resolves.toEqual({
      status: MODEL_LIST_STATUS_FAILED,
      models: []
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    client.dispose();
  });

  it('keeps validation timeouts recoverable without marking the backend dead', async () => {
    const fake = makeFakeBackend((server) => {
      server.onRequest(providerSetKeyRequest, () => new Promise<SetKeyResult>(() => undefined));
      server.onRequest(providerModelsRequest, () => new Promise<ModelListResult>(() => undefined));
    });
    const client = createBackendClient({
      launch: async () => fake.launched,
      validationRequestTimeoutMs: 20
    });

    await expect(
      client.setProviderKey({
        providerId: 'custom',
        baseUrl: 'https://example.test/v1',
        apiKey: 'sk-hung',
        label: null
      })
    ).resolves.toEqual({ outcome: SET_KEY_OUTCOME_UNREACHABLE, selectedModel: null });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(fake.disposed()).toBe(false);

    await expect(client.listModels('custom')).resolves.toEqual({
      status: MODEL_LIST_STATUS_FAILED,
      models: []
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(fake.disposed()).toBe(false);
    client.dispose();
  });

  it('rejects submits after dispose without spawning a new backend', async () => {
    const fake = makeFakeBackend(ack);
    const launch = vi.fn(async () => fake.launched);
    const client = createBackendClient({ launch });

    await client.ensureStarted();
    expect(launch).toHaveBeenCalledTimes(1);

    client.dispose();

    await expect(
      client.submit({ turnId: 'turn-1', text: 'after dispose' })
    ).rejects.toMatchObject({
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

    const submit = client.submit({ turnId: 'turn-1', text: 'race' });
    client.dispose();
    resolveLaunch?.(fake.launched);

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    expect(fake.disposed()).toBe(true);
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
  });
});

describe('createSourceBackendClient (integration)', () => {
  it(
    'builds and launches the Rust backend, routing to configuration without a key',
    async () => {
      // Run in a temp workspace whose ancestry has no `.env`, so the backend
      // finds no CUSTOM_API_KEY and deterministically returns needsConfiguration —
      // regardless of a developer's real `.env` at the repo root.
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-src-client-'));
      await withTempHome(async () => {
        const client = createSourceBackendClient({ repoRoot, workspaceCwd });
        try {
          await client.setActiveSelection('custom', 'test-model');
          const settled = new Promise((resolve) =>
            client.onTranscriptEvent((event) => {
              if (event.type === 'settled') {
                resolve(event);
              }
            })
          );
          await client.submit({ turnId: 'turn-1', text: 'hello' });
          await expect(settled).resolves.toMatchObject({
            type: 'settled',
            result: { kind: 'needsConfiguration' }
          });
        } finally {
          client.dispose();
          // Best-effort: on Windows the just-killed backend may still hold the cwd
          // handle briefly; the OS reclaims the temp dir regardless.
          try {
            fs.rmSync(workspaceCwd, { recursive: true, force: true });
          } catch {
            /* temp cleanup is best-effort */
          }
        }
      });
    },
    INTEGRATION_TIMEOUT_MS
  );
});
