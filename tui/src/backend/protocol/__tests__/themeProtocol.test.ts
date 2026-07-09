import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node';
import { type MessageConnection } from 'vscode-jsonrpc';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import { themeGetRequest, themeSetRequest } from '@backend/protocol/themeProtocol.ts';
import {
  THEME_SET_OUTCOME_SAVED,
  THEME_SET_OUTCOME_STORE_FAILED
} from '@contracts/backend/index.ts';

type Pair = { client: MessageConnection; server: MessageConnection; dispose: () => void };

let openPairs: Pair[] = [];

function pairedConnections(): Pair {
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
  const pair = {
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

afterEach(() => {
  for (const pair of openPairs) {
    pair.dispose();
  }
  openPairs = [];
});

describe('theme protocol client', () => {
  it('reads the saved theme id', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(themeGetRequest, () => ({ themeId: 'nord' }));

    await expect(createMessageConnectionClient(client).getTheme()).resolves.toEqual({
      themeId: 'nord'
    });
  });

  it('reads a null theme id when unset', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(themeGetRequest, () => ({ themeId: null }));

    await expect(createMessageConnectionClient(client).getTheme()).resolves.toEqual({
      themeId: null
    });
  });

  it('sends the selected theme id and returns the saved outcome', async () => {
    const { client, server } = pairedConnections();
    const seen: Array<{ themeId: string }> = [];
    server.onRequest(themeSetRequest, (params) => {
      seen.push(params);
      return { outcome: THEME_SET_OUTCOME_SAVED };
    });

    await expect(createMessageConnectionClient(client).setTheme('gruvbox-dark')).resolves.toEqual({
      outcome: THEME_SET_OUTCOME_SAVED
    });
    expect(seen).toEqual([{ themeId: 'gruvbox-dark' }]);
  });

  it('surfaces a store-failed outcome without throwing', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(themeSetRequest, (params) => {
      expect(params).toEqual({ themeId: 'nord' });
      return { outcome: THEME_SET_OUTCOME_STORE_FAILED };
    });

    await expect(createMessageConnectionClient(client).setTheme('nord')).resolves.toEqual({
      outcome: THEME_SET_OUTCOME_STORE_FAILED
    });
  });
});
