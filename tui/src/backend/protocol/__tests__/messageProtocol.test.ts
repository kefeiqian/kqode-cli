import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCodes, type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import {
  SETTLED_KIND_COMPLETED,
  SETTLED_KIND_ERROR,
  SUBMIT_STATUS_NEEDS_CONFIGURATION,
  SUBMIT_STATUS_STREAMING,
  TURN_STATE_ACTIVE
} from '@contracts/backend/index.ts';
import {
  conversationClearRequest,
  gitStatusRequest,
  messageSubmitRequest,
  tokenDeltaNotification,
  turnActivatedNotification,
  turnCancelRequest,
  turnEndNotification,
  turnEnqueuedNotification,
  turnErrorNotification,
  turnSettledNotification
} from '@backend/protocol/messageProtocol.ts';

type PairedConnections = { client: MessageConnection; server: MessageConnection; dispose: () => void };
let openPairs: PairedConnections[] = [];

function pairedConnections(): PairedConnections {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  const client = createMessageConnection(new StreamMessageReader(serverToClient), new StreamMessageWriter(clientToServer));
  const server = createMessageConnection(new StreamMessageReader(clientToServer), new StreamMessageWriter(serverToClient));
  client.listen();
  server.listen();
  const pair = { client, server, dispose: () => { client.dispose(); server.dispose(); } };
  openPairs.push(pair);
  return pair;
}

function streamingServer(server: MessageConnection, deltas: readonly string[]): void {
  server.onRequest(messageSubmitRequest, ({ turnId }) => {
    queueMicrotask(async () => {
      await server.sendNotification(turnEnqueuedNotification, { turnId, seq: 1, state: TURN_STATE_ACTIVE });
      for (const delta of deltas) await server.sendNotification(tokenDeltaNotification, { turnId, delta });
      await server.sendNotification(turnSettledNotification, {
        turnId,
        result: { kind: SETTLED_KIND_COMPLETED, text: deltas.join(''), finishReason: 'stop', errorKind: null, message: null }
      });
    });
    return { turnId, status: SUBMIT_STATUS_STREAMING };
  });
}

afterEach(() => {
  for (const pair of openPairs) pair.dispose();
  openPairs = [];
});

describe('message protocol client', () => {
  it('streams token deltas and resolves completed with the concatenated text', async () => {
    const { client, server } = pairedConnections();
    streamingServer(server, ['Hello', ', ', 'world']);
    const deltas: string[] = [];
    const events: unknown[] = [];
    const backend = createMessageConnectionClient(client);
    backend.onTranscriptEvent((event) => {
      events.push(event);
      if (event.type === 'tokenDelta') deltas.push(event.delta);
    });

    await backend.submit({ turnId: 'turn-1', text: 'hello from tui' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(deltas).toEqual(['Hello', ', ', 'world']);
    expect(events.at(-1)).toMatchObject({ type: 'settled', turnId: 'turn-1' });
  });

  it('preserves Unicode and whitespace across streamed deltas', async () => {
    const { client, server } = pairedConnections();
    streamingServer(server, ['  café\n', '☕ 日本語  ']);

    const events: string[] = [];
    const backend = createMessageConnectionClient(client);
    backend.onTranscriptEvent((event) => {
      if (event.type === 'tokenDelta') events.push(event.delta);
    });

    await backend.submit({ turnId: 'turn-1', text: 'unicode' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events.join('')).toBe('  café\n☕ 日本語  ');
  });

  it('dispatches token deltas that arrive before the submit ack resolves', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => {
      void server.sendNotification(tokenDeltaNotification, { turnId, delta: 'early' });
      return { turnId, status: SUBMIT_STATUS_STREAMING };
    });
    const backend = createMessageConnectionClient(client);
    const deltas: string[] = [];
    backend.onTranscriptEvent((event) => {
      if (event.type === 'tokenDelta') deltas.push(event.delta);
    });

    await backend.submit({ turnId: 'turn-early', text: 'race' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(deltas).toEqual(['early']);
  });

  it('dispatches an error event when the backend emits turnSettled(error)', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => {
      queueMicrotask(() => void server.sendNotification(turnSettledNotification, {
        turnId,
        result: {
          kind: SETTLED_KIND_ERROR,
          text: null,
          finishReason: null,
          errorKind: 'auth',
          message: 'Kimi rejected the API key'
        }
      }));
      return { turnId, status: SUBMIT_STATUS_STREAMING };
    });
    const backend = createMessageConnectionClient(client);
    const settled = new Promise((resolve) => backend.onTranscriptEvent(resolve));

    await backend.submit({ turnId: 'turn-1', text: 'boom' });

    await expect(settled).resolves.toMatchObject({ type: 'settled', turnId: 'turn-1' });
  });

  it('dispatches needs-configuration from the settled event when the ack reports no key', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => {
      queueMicrotask(() => void server.sendNotification(turnSettledNotification, {
        turnId,
        result: {
          kind: SUBMIT_STATUS_NEEDS_CONFIGURATION,
          text: null,
          finishReason: null,
          errorKind: null,
          message: null
        }
      }));
      return { turnId, status: SUBMIT_STATUS_NEEDS_CONFIGURATION };
    });
    const backend = createMessageConnectionClient(client);
    const settled = new Promise((resolve) => backend.onTranscriptEvent(resolve));

    await backend.submit({ turnId: 'turn-1', text: 'no key' });

    await expect(settled).resolves.toMatchObject({
      type: 'settled',
      result: { kind: SUBMIT_STATUS_NEEDS_CONFIGURATION }
    });
  });

  it('surfaces JSON-RPC method errors as typed protocol client errors', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, () => {
      throw new ResponseError(ErrorCodes.InvalidParams, 'invalid message submit params');
    });

    const submit = createMessageConnectionClient(client).submit({ turnId: 'turn-1', text: 'boom' });

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });
});

describe('message protocol descriptors', () => {
  it('round-trips queue lifecycle notifications', async () => {
    const { client, server } = pairedConnections();
    const enqueued = new Promise((resolve) => client.onNotification(turnEnqueuedNotification, resolve));
    const activated = new Promise((resolve) => client.onNotification(turnActivatedNotification, resolve));
    const settled = new Promise((resolve) => client.onNotification(turnSettledNotification, resolve));

    await server.sendNotification(turnEnqueuedNotification, { turnId: 'turn-1', seq: 1, state: TURN_STATE_ACTIVE });
    await server.sendNotification(turnActivatedNotification, { turnId: 'turn-1' });
    await server.sendNotification(turnSettledNotification, {
      turnId: 'turn-1',
      result: { kind: SETTLED_KIND_COMPLETED, text: 'done', finishReason: 'stop', errorKind: null, message: null }
    });

    await expect(enqueued).resolves.toEqual({ turnId: 'turn-1', seq: 1, state: TURN_STATE_ACTIVE });
    await expect(activated).resolves.toEqual({ turnId: 'turn-1' });
    await expect(settled).resolves.toEqual({
      turnId: 'turn-1',
      result: { kind: SETTLED_KIND_COMPLETED, text: 'done', finishReason: 'stop', errorKind: null, message: null }
    });
  });

  it('round-trips clear and cancel requests', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(conversationClearRequest, () => ({ ok: true }));
    server.onRequest(turnCancelRequest, ({ turnId }) => ({ ok: turnId === 'turn-1' }));

    await expect(client.sendRequest(conversationClearRequest)).resolves.toEqual({ ok: true });
    await expect(client.sendRequest(turnCancelRequest, { turnId: 'turn-1' })).resolves.toEqual({ ok: true });
  });

  it('keeps legacy turnEnd and turnError notifications round-tripping', async () => {
    const { client, server } = pairedConnections();
    const ended = new Promise((resolve) => client.onNotification(turnEndNotification, resolve));
    const errored = new Promise((resolve) => client.onNotification(turnErrorNotification, resolve));

    await server.sendNotification(turnEndNotification, { turnId: 'turn-1', finishReason: 'stop' });
    await server.sendNotification(turnErrorNotification, { turnId: 'turn-2', errorKind: 'provider', message: 'failed' });

    await expect(ended).resolves.toEqual({ turnId: 'turn-1', finishReason: 'stop' });
    await expect(errored).resolves.toEqual({ turnId: 'turn-2', errorKind: 'provider', message: 'failed' });
  });
});

describe('git status request', () => {
  it('resolves the formatted label the backend returns', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => ({ label: '⎇ main*' }));
    await expect(createMessageConnectionClient(client).gitStatus()).resolves.toBe('⎇ main*');
  });

  it('resolves null when the workspace is not a git repository', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => ({ label: null }));
    await expect(createMessageConnectionClient(client).gitStatus()).resolves.toBeNull();
  });

  it('surfaces a JSON-RPC error as a typed protocol client error', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => {
      throw new ResponseError(ErrorCodes.InternalError, 'git failed');
    });

    const status = createMessageConnectionClient(client).gitStatus();

    await expect(status).rejects.toBeInstanceOf(BackendClientError);
    await expect(status).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });
});
