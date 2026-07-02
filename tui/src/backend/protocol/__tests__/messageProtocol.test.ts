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
import { ACK_MESSAGE } from '@contracts/backend/index.ts';
import { messageSubmitRequest } from '@backend/protocol/messageProtocol.ts';

type PairedConnections = {
  client: MessageConnection;
  server: MessageConnection;
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
    dispose: () => {
      client.dispose();
      server.dispose();
    }
  };
  openPairs.push(pair);
  return pair;
}

function ackingServer(server: MessageConnection): void {
  server.onRequest(messageSubmitRequest, ({ text }) => ({
    message: ACK_MESSAGE,
    receivedText: text
  }));
}

afterEach(() => {
  for (const pair of openPairs) {
    pair.dispose();
  }
  openPairs = [];
});

describe('message protocol client', () => {
  it('sends kqode.message.submit and receives an ACK success response', async () => {
    const { client, server } = pairedConnections();
    ackingServer(server);

    const result = await createMessageConnectionClient(client).submitMessage({
      text: 'hello from tui'
    });

    expect(result.message).toBe(ACK_MESSAGE);
    expect(result.receivedText).toBe('hello from tui');
  });

  it('preserves Unicode, surrounding spaces, and newlines in receivedText', async () => {
    const { client, server } = pairedConnections();
    ackingServer(server);

    const text = '  café\n☕ 日本語  ';
    const result = await createMessageConnectionClient(client).submitMessage({ text });

    expect(result.receivedText).toBe(text);
  });

  it('surfaces JSON-RPC method errors as typed protocol client errors', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(messageSubmitRequest, () => {
      throw new ResponseError(ErrorCodes.InvalidParams, 'invalid message submit params');
    });

    const submit = createMessageConnectionClient(client).submitMessage({ text: 'boom' });

    await expect(submit).rejects.toBeInstanceOf(BackendClientError);
    await expect(submit).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });
});
