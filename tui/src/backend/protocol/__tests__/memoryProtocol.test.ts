import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCodes, type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import {
  MEMORY_ADD_METHOD,
  MEMORY_EDIT_METHOD,
  MEMORY_FORGET_METHOD,
  MEMORY_INBOX_APPLY_METHOD,
  MEMORY_INBOX_LIST_METHOD,
  MEMORY_INBOX_UNDO_METHOD,
  MEMORY_LIST_METHOD,
  MEMORY_RELOAD_METHOD,
  MEMORY_SHOW_METHOD
} from '@contracts/backend/index.ts';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import {
  memoryAddRequest,
  memoryInboxUndoRequest,
  memoryListRequest,
  memoryReloadRequest
} from '@backend/protocol/memoryProtocol.ts';

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

function sampleItem(id: string): MemoryItem {
  return {
    id,
    scope: 'user',
    scopeId: null,
    memoryType: 'user',
    title: 'Prefer tabs',
    active: true,
    source: 'manual',
    sourceSessionId: null,
    sourceTurnStart: null,
    sourceTurnEnd: null,
    contentHash: 'abc',
    createdAt: 1,
    updatedAt: 2
  };
}

function sampleEntry(status: MemoryInboxEntry['status']): MemoryInboxEntry {
  return {
    id: 'entry-1',
    status,
    scope: 'user',
    scopeId: null,
    targetItemId: 'item-1',
    memoryType: 'project',
    title: 'Setup',
    confidence: 0.9,
    reason: null,
    createdAt: 1,
    updatedAt: 2
  };
}

afterEach(() => {
  for (const pair of openPairs) pair.dispose();
  openPairs = [];
});

describe('memory protocol descriptors', () => {
  it('mirror the Rust method names exactly', () => {
    expect(MEMORY_LIST_METHOD).toBe('kqode.memory.list');
    expect(MEMORY_SHOW_METHOD).toBe('kqode.memory.show');
    expect(MEMORY_ADD_METHOD).toBe('kqode.memory.add');
    expect(MEMORY_EDIT_METHOD).toBe('kqode.memory.edit');
    expect(MEMORY_FORGET_METHOD).toBe('kqode.memory.forget');
    expect(MEMORY_RELOAD_METHOD).toBe('kqode.memory.reload');
    expect(MEMORY_INBOX_LIST_METHOD).toBe('kqode.memory.inbox.list');
    expect(MEMORY_INBOX_APPLY_METHOD).toBe('kqode.memory.inbox.apply');
    expect(MEMORY_INBOX_UNDO_METHOD).toBe('kqode.memory.inbox.undo');
  });

  it('round-trips add params and returns the created item', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(memoryAddRequest, (params) => {
      expect(params).toMatchObject({ scope: 'user', memoryType: 'user', title: 'Prefer tabs' });
      return { item: sampleItem('item-1') };
    });

    const result = await createMessageConnectionClient(client).addMemory({
      scope: 'user',
      memoryType: 'user',
      title: 'Prefer tabs',
      body: 'Use tabs.'
    });
    expect(result.item.id).toBe('item-1');
  });

  it('round-trips list and reload results', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(memoryListRequest, () => ({ items: [sampleItem('a'), sampleItem('b')] }));
    server.onRequest(memoryReloadRequest, () => ({ items: [sampleItem('a')] }));

    const backend = createMessageConnectionClient(client);
    await expect(backend.listMemory({})).resolves.toMatchObject({ items: [{ id: 'a' }, { id: 'b' }] });
    await expect(backend.reloadMemory()).resolves.toMatchObject({ items: [{ id: 'a' }] });
  });

  it('round-trips inbox undo with the restored flag', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(memoryInboxUndoRequest, ({ entryId }) => ({
      entry: sampleEntry(entryId === 'entry-1' ? 'undone' : 'failed'),
      restored: entryId === 'entry-1'
    }));

    const result = await createMessageConnectionClient(client).undoMemoryInbox({ entryId: 'entry-1' });
    expect(result.restored).toBe(true);
    expect(result.entry.status).toBe('undone');
  });

  it('surfaces a JSON-RPC error as a typed protocol client error', async () => {
    const { client, server } = pairedConnections();
    server.onRequest(memoryAddRequest, () => {
      throw new ResponseError(ErrorCodes.InvalidParams, 'memory content blocked as sensitive: api_token');
    });

    const add = createMessageConnectionClient(client).addMemory({
      scope: 'user',
      memoryType: 'reference',
      title: 'token',
      body: 'secret'
    });
    await expect(add).rejects.toBeInstanceOf(BackendClientError);
    await expect(add).rejects.toMatchObject({ kind: BackendErrorKind.Protocol });
  });
});
