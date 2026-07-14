import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node';
import { ErrorCodes, type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import {
  SUBMIT_STATUS_NEEDS_CONFIGURATION,
  SUBMIT_STATUS_STREAMING
} from '@contracts/backend/index.ts';
import {
  gitStatusRequest,
  messageSubmitRequest,
  tokenDeltaNotification,
  turnEndNotification,
  turnErrorNotification
} from '@backend/protocol/messageProtocol.ts';

type PairedConnections = {
  client: MessageConnection;
  server: MessageConnection;
  closeTransport: () => void;
  dispose: () => void;
};

let openPairs: PairedConnections[] = [];

function pairedConnections(): PairedConnections {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  const client = createMessageConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer)
  );
  const server = createMessageConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient)
  );
  client.listen();
  server.listen();

  const pair: PairedConnections = {
    client,
    server,
    closeTransport: () => {
      clientToServer.end();
      serverToClient.end();
    },
    dispose: () => {
      client.dispose();
      server.dispose();
    }
  };
  openPairs.push(pair);
  return pair;
}

function streamingServer(server: MessageConnection, deltas: readonly string[]): void {
  server.onRequest(messageSubmitRequest, ({ turnId }) => {
    queueMicrotask(async () => {
      for (const delta of deltas) {
        await server.sendNotification(tokenDeltaNotification, { turnId, delta });
      }
      await server.sendNotification(turnEndNotification, { turnId, finishReason: 'stop' });
    });
    return { turnId, status: SUBMIT_STATUS_STREAMING };
  });
}

afterEach(() => {
  for (const pair of openPairs) {
    pair.dispose();
  }
  openPairs = [];
});

describe('message protocol client', () => {
  it('streams token deltas and resolves completed with the concatenated text', async () => {
    const { client, server } = pairedConnections();
    streamingServer(server, ['Hello', ', ', 'world']);

    const deltas: string[] = [];
    const outcome = await createMessageConnectionClient(client).submitStreaming(
      { text: 'hello from tui' },
      { onDelta: (delta) => deltas.push(delta) }
    );

    expect(deltas).toEqual(['Hello', ', ', 'world']);
    expect(outcome).toEqual({ kind: 'completed', text: 'Hello, world', finishReason: 'stop' });
  });

  it('preserves Unicode and whitespace across streamed deltas', async () => {
    const { client, server } = pairedConnections();
    streamingServer(server, ['  café\n', '☕ 日本語  ']);

    const outcome = await createMessageConnectionClient(client).submitStreaming(
      { text: 'unicode' },
      { onDelta: () => {} }
    );

    expect(outcome).toEqual({
      kind: 'completed',
      text: '  café\n☕ 日本語  ',
      finishReason: 'stop'
    });
  });

  it('resolves an error outcome when the backend emits kqode/turnError', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => {
      queueMicrotask(() => {
        void server.sendNotification(turnErrorNotification, {
          turnId,
          errorKind: 'auth',
          message: 'Kimi rejected the API key'
        });
      });
      return { turnId, status: SUBMIT_STATUS_STREAMING };
    });

    const outcome = await createMessageConnectionClient(client).submitStreaming(
      { text: 'boom' },
      { onDelta: () => {} }
    );

    expect(outcome).toEqual({
      kind: 'error',
      errorKind: 'auth',
      message: 'Kimi rejected the API key'
    });
  });

  it('resolves a needs-configuration outcome when the ack reports no key', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => ({
      turnId,
      status: SUBMIT_STATUS_NEEDS_CONFIGURATION
    }));

    const outcome = await createMessageConnectionClient(client).submitStreaming(
      { text: 'no key' },
      { onDelta: () => {} }
    );

    expect(outcome).toEqual({ kind: 'needsConfiguration' });
  });

  it('surfaces JSON-RPC method errors as typed protocol client errors', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, () => {
      throw new ResponseError(ErrorCodes.InvalidParams, 'invalid message submit params');
    });

    const submit = createMessageConnectionClient(client).submitStreaming(
      { text: 'boom' },
      { onDelta: () => {} }
    );

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });

  it('rejects when a streamed turn idles after the ack', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => ({
      turnId,
      status: SUBMIT_STATUS_STREAMING
    }));

    const submit = createMessageConnectionClient(client, { streamIdleTimeoutMs: 20 }).submitStreaming(
      { text: 'wedged' },
      { onDelta: () => {} }
    );

    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Timeout });
  });

  it('rejects when the connection closes while a streamed turn is active', async () => {
    const { client, server, closeTransport } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => {
      queueMicrotask(closeTransport);
      return { turnId, status: SUBMIT_STATUS_STREAMING };
    });

    const submit = createMessageConnectionClient(client).submitStreaming(
      { text: 'crash' },
      { onDelta: () => {} }
    );

    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Transport });
  });
});

describe('git status request', () => {
  it('resolves the formatted label the backend returns', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => ({
      label: '⎇ main*',
      pullRequestLabel: '#3',
      pullRequestUrl: 'https://github.com/o/r/pull/3'
    }));

    const status = await createMessageConnectionClient(client).gitStatus();

    expect(status).toEqual({
      label: '⎇ main*',
      pullRequestLabel: '#3',
      pullRequestUrl: 'https://github.com/o/r/pull/3'
    });
  });

  it('resolves null when the workspace is not a git repository', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => ({
      label: null,
      pullRequestLabel: null,
      pullRequestUrl: null
    }));

    const status = await createMessageConnectionClient(client).gitStatus();

    expect(status).toBeNull();
  });

  it('surfaces a JSON-RPC error as a typed protocol client error', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(gitStatusRequest, () => {
      throw new ResponseError(ErrorCodes.InternalError, 'git failed');
    });

    const status = createMessageConnectionClient(client).gitStatus();

    await expect(status).rejects.toBeInstanceOf(BackendClientError);
    await expect(status).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
    await expect(status).rejects.toThrow('git status');
  });
});
