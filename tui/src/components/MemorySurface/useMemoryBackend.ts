import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import type { InboxAction, MemoryItem } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/index.ts';
import { backendErrorMessage } from '@libs/promptQueue/promptQueue.ts';
import {
  resetMemorySurfaceAtom,
  setMemoryBusyAtom,
  setMemoryDataAtom,
  setMemoryDetailAtom,
  setMemoryFailureAtom
} from '@state/ui/memory/index.ts';

/**
 * Backend-facing actions for the `/memory` surface. All mutation truth lives in
 * Rust; this hook only invokes `BackendClient` RPCs and repaints from the
 * refreshed backend view (KTD6), never editing memory files directly.
 */
export function useMemoryBackend() {
  const client = useAtomValue(backendClientAtom);
  const resetMemory = useSetAtom(resetMemorySurfaceAtom);
  const setMemoryData = useSetAtom(setMemoryDataAtom);
  const setMemoryFailure = useSetAtom(setMemoryFailureAtom);
  const setMemoryBusy = useSetAtom(setMemoryBusyAtom);
  const setMemoryDetail = useSetAtom(setMemoryDetailAtom);

  const refresh = useCallback(async () => {
    resetMemory();
    if (client === undefined) {
      setMemoryFailure('Rust backend unavailable');
      return;
    }
    try {
      const [items, inbox] = await Promise.all([
        client.listMemory({}),
        client.listMemoryInbox({})
      ]);
      setMemoryData({ items: items.items, inbox: inbox.entries });
    } catch (error) {
      setMemoryFailure(backendErrorMessage(error));
    }
  }, [client, resetMemory, setMemoryData, setMemoryFailure]);

  const showDetail = useCallback(
    async (item: MemoryItem) => {
      if (client === undefined) {
        return;
      }
      try {
        const result = await client.showMemory({
          scope: item.scope,
          scopeId: item.scopeId ?? undefined,
          id: item.id
        });
        setMemoryDetail(result.body);
      } catch (error) {
        setMemoryFailure(backendErrorMessage(error));
      }
    },
    [client, setMemoryDetail, setMemoryFailure]
  );

  const forgetItem = useCallback(
    async (item: MemoryItem) => {
      if (client === undefined) {
        return;
      }
      setMemoryBusy();
      try {
        await client.forgetMemory({
          scope: item.scope,
          scopeId: item.scopeId ?? undefined,
          id: item.id
        });
        await refresh();
      } catch (error) {
        setMemoryFailure(backendErrorMessage(error));
      }
    },
    [client, refresh, setMemoryBusy, setMemoryFailure]
  );

  const applyInbox = useCallback(
    async (entryId: string, action: InboxAction) => {
      if (client === undefined) {
        return;
      }
      setMemoryBusy();
      try {
        await client.applyMemoryInbox({ entryId, action });
        await refresh();
      } catch (error) {
        setMemoryFailure(backendErrorMessage(error));
      }
    },
    [client, refresh, setMemoryBusy, setMemoryFailure]
  );

  const undoInbox = useCallback(
    async (entryId: string) => {
      if (client === undefined) {
        return;
      }
      setMemoryBusy();
      try {
        await client.undoMemoryInbox({ entryId });
        await refresh();
      } catch (error) {
        setMemoryFailure(backendErrorMessage(error));
      }
    },
    [client, refresh, setMemoryBusy, setMemoryFailure]
  );

  return { refresh, showDetail, forgetItem, applyInbox, undoInbox };
}
