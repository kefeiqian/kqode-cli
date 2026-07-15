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
import { SUBMIT_STATUS_NEEDS_CONFIGURATION } from '@contracts/backend/index.ts';
import type { MessageSubmitResult } from '@contracts/backend/index.ts';
import { gitStatusRequest, messageSubmitRequest } from '@backend/protocol/messageProtocol.ts';

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

afterEach(() => {
  for (const pair of openPairs) {
    pair.dispose();
  }
  openPairs = [];
});

describe('message protocol client', () => {
  it('resolves needs-configuration when the ack reports no key', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => ({
      turnId,
      status: SUBMIT_STATUS_NEEDS_CONFIGURATION
    }));

    const outcome = await createMessageConnectionClient(client).submit({ text: 'no key' });

    expect(outcome).toEqual({ kind: 'needsConfiguration' });
  });

  it('sends the prompt text with a client-generated turnId the ack echoes', async () => {
    const { client, server } = pairedConnections();
    const received: Array<{ text: string; turnId: string }> = [];
    server.onRequest(messageSubmitRequest, (params) => {
      received.push(params);
      return { turnId: params.turnId, status: SUBMIT_STATUS_NEEDS_CONFIGURATION };
    });

    await createMessageConnectionClient(client).submit({ text: '  café ☕  ' });

    expect(received).toHaveLength(1);
    expect(received[0]?.text).toBe('  café ☕  ');
    expect(received[0]?.turnId).toMatch(/\S/);
  });

  it('rejects an unsupported ack status as a protocol error', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, ({ turnId }) => ({ turnId, status: 'streaming' }));

    const submit = createMessageConnectionClient(client).submit({ text: 'too early' });

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });

  it('surfaces JSON-RPC method errors as typed protocol client errors', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, () => {
      throw new ResponseError(ErrorCodes.InvalidParams, 'invalid message submit params');
    });

    const submit = createMessageConnectionClient(client).submit({ text: 'boom' });

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });

  it('rejects with a typed backend error when the connection is disposed mid-submit', async () => {
    const { client, server } = pairedConnections();
    // The backend never answers, so the request stays pending until the client
    // connection is disposed — mirroring how the backend client tears down a dead
    // connection (markDead → dispose), which rejects any in-flight request.
    // Classifying that death and marking the client dead is owned by the backend
    // client layer's fatal-teardown listeners; here we only assert the in-flight
    // submit surfaces a typed error rather than hanging or leaking a raw rejection.
    server.onRequest(messageSubmitRequest, () => new Promise<MessageSubmitResult>(() => undefined));

    const submit = createMessageConnectionClient(client).submit({ text: 'crash' });
    queueMicrotask(() => client.dispose());

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
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
