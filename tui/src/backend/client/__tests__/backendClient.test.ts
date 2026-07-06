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
  SUBMIT_STATUS_STREAMING
} from '@contracts/backend/index.ts';
import {
  messageSubmitRequest,
  backendReadyNotification,
  tokenDeltaNotification,
  turnEndNotification
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
import type { ModelListResult, SetKeyResult } from '@contracts/backend/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const INTEGRATION_TIMEOUT_MS = 180_000;

type FakeBackend = {
  launched: LaunchedBackend;
  disposed: () => boolean;
  emitExit: () => void;
};

let openServers: MessageConnection[] = [];

// A fake backend that streams the submitted text back as one delta then ends
// the turn, so `submitStreaming` resolves `completed` with that exact text.
function ack(server: MessageConnection): void {
  server.onRequest(messageSubmitRequest, ({ text, turnId }) => {
    queueMicrotask(async () => {
      if (text.length > 0) {
        await server.sendNotification(tokenDeltaNotification, { turnId, delta: text });
      }
      await server.sendNotification(turnEndNotification, { turnId, finishReason: 'stop' });
    });
    return { turnId, status: SUBMIT_STATUS_STREAMING };
  });
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
    void server.sendNotification(backendReadyNotification, { sessionId: 'test-session' });
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

    const result = await client.submitStreaming({ text: 'hello' }, { onDelta: () => {} });
    expect(result).toEqual({ kind: 'completed', text: 'hello', finishReason: 'stop' });
    expect(launch).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('starts idle and becomes ready after a successful submit', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    expect(client.getState()).toBe(BackendLifecycleState.Idle);
    const result = await client.submitStreaming({ text: 'hello' }, { onDelta: () => {} });

    expect(result).toEqual({ kind: 'completed', text: 'hello', finishReason: 'stop' });
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

    await expect(
      client.submitStreaming({ text: 'x' }, { onDelta: () => {} })
    ).rejects.toMatchObject({
      kind: BackendErrorKind.Protocol
    });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(fake.disposed()).toBe(false);

    await expect(
      client.submitStreaming({ text: 'y' }, { onDelta: () => {} })
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
      client.submitStreaming({ text: 'first' }, { onDelta: () => {} })
    ).rejects.toMatchObject({
      kind: BackendErrorKind.Timeout
    });
    expect(client.getState()).toBe(BackendLifecycleState.Dead);
    expect(hung.disposed()).toBe(true);

    const result = await client.submitStreaming({ text: 'second' }, { onDelta: () => {} });
    expect(result).toEqual({ kind: 'completed', text: 'second', finishReason: 'stop' });
    expect(client.getState()).toBe(BackendLifecycleState.Ready);
    expect(launch).toHaveBeenCalledTimes(2);
    client.dispose();
  });

  it('marks the client dead when the backend process exits', async () => {
    const fake = makeFakeBackend(ack);
    const client = createBackendClient({ launch: async () => fake.launched });

    await client.submitStreaming({ text: 'alive' }, { onDelta: () => {} });
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
      client.submitStreaming({ text: 'after dispose' }, { onDelta: () => {} })
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

    const submit = client.submitStreaming({ text: 'race' }, { onDelta: () => {} });
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
      // finds no KIMI_API_KEY and deterministically returns needsConfiguration —
      // regardless of a developer's real `.env` at the repo root.
      const workspaceCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-src-client-'));
      const client = createSourceBackendClient({ repoRoot, workspaceCwd });
      try {
        const outcome = await client.submitStreaming({ text: 'hello' }, { onDelta: () => {} });
        expect(outcome).toEqual({ kind: 'needsConfiguration' });
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
    },
    INTEGRATION_TIMEOUT_MS
  );
});
