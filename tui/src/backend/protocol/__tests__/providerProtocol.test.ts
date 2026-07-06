import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node';
import { type MessageConnection } from 'vscode-jsonrpc';
import { BackendErrorKind } from '@contracts/backend/index.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import {
  providerClearKeyRequest,
  providerListRequest,
  selectionGetRequest,
  selectionSetRequest
} from '@backend/protocol/providerProtocol.ts';

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

describe('provider protocol client', () => {
  it('lists providers from the backend result', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(providerListRequest, () => ({
      persistenceAvailable: true,
      providers: [
        {
          providerId: 'kimi',
          label: 'Kimi',
          baseUrl: 'https://api.moonshot.cn/v1',
          status: 'connected',
          credentialSource: 'keychain'
        }
      ]
    }));

    await expect(createMessageConnectionClient(client).listProviders()).resolves.toEqual({
      persistenceAvailable: true,
      providers: [
        {
          providerId: 'kimi',
          label: 'Kimi',
          baseUrl: 'https://api.moonshot.cn/v1',
          status: 'connected',
          credentialSource: 'keychain'
        }
      ]
    });
  });

  it('round-trips active selection get and set params', async () => {
    const { client, server } = pairedConnections();
    const seen: Array<{ providerId: string; modelId: string }> = [];
    server.onRequest(selectionGetRequest, () => ({ providerId: 'kimi', modelId: 'kimi-k2.7-code' }));
    server.onRequest(selectionSetRequest, (params) => {
      seen.push(params);
      return { ok: true };
    });
    const backend = createMessageConnectionClient(client);

    await expect(backend.getActiveSelection()).resolves.toEqual({
      providerId: 'kimi',
      modelId: 'kimi-k2.7-code'
    });
    await backend.setActiveSelection('custom', 'gpt-4o-mini');
    expect(seen).toEqual([{ providerId: 'custom', modelId: 'gpt-4o-mini' }]);
  });

  it('clears a provider key with the provider id param', async () => {
    const { client, server } = pairedConnections();
    const seen: string[] = [];
    server.onRequest(providerClearKeyRequest, ({ providerId }) => {
      seen.push(providerId);
      return { ok: true };
    });

    await createMessageConnectionClient(client).clearProviderKey('kimi');

    expect(seen).toEqual(['kimi']);
  });

  it('surfaces ok false as a protocol error', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(selectionSetRequest, () => ({ ok: false }));

    await expect(
      createMessageConnectionClient(client).setActiveSelection('unknown', 'model')
    ).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });
});
