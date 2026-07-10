import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  MemoryMode,
  MemoryStatus,
  PendingMemoryItemAction,
  forgetConfirmAtom,
  highlightedInboxEntryAtom,
  highlightedMemoryItemAtom,
  memoryDetailBodyAtom,
  memoryModeAtom,
  memoryStatusAtom,
  moveMemoryHighlightAtom,
  scrollMemoryDetailAtom,
  setMemoryDetailAtom,
  memoryFormAtom,
  pendingMemoryItemActionAtom,
  setForgetConfirmAtom,
  setPendingMemoryItemActionAtom,
  switchMemoryModeAtom
} from '@state/ui/memory/index.ts';

/** Backend actions the surface input dispatches to (see `useMemoryBackend`). */
export type MemoryInputActions = {
  refresh: () => Promise<void>;
  showDetail: (item: MemoryItem) => Promise<void>;
  forgetItem: (item: MemoryItem) => Promise<void>;
  beginEdit: (item: MemoryItem) => Promise<void>;
  applyInbox: (entryId: string, action: 'approve' | 'reject' | 'stale') => Promise<void>;
  undoInbox: (entryId: string) => Promise<void>;
};

export function useMemoryInput(actions: MemoryInputActions) {
  const mode = useLatest(useAtomValue(memoryModeAtom));
  const status = useLatest(useAtomValue(memoryStatusAtom));
  const item = useLatest<MemoryItem | null>(useAtomValue(highlightedMemoryItemAtom));
  const entry = useLatest<MemoryInboxEntry | null>(useAtomValue(highlightedInboxEntryAtom));
  const detail = useLatest(useAtomValue(memoryDetailBodyAtom));
  const form = useLatest(useAtomValue(memoryFormAtom));
  const pendingAction = useLatest(useAtomValue(pendingMemoryItemActionAtom));
  const forgetConfirm = useLatest(useAtomValue(forgetConfirmAtom));
  const moveHighlight = useSetAtom(moveMemoryHighlightAtom);
  const switchMode = useSetAtom(switchMemoryModeAtom);
  const setDetail = useSetAtom(setMemoryDetailAtom);
  const scrollDetail = useSetAtom(scrollMemoryDetailAtom);
  const setPendingAction = useSetAtom(setPendingMemoryItemActionAtom);
  const setForgetConfirm = useSetAtom(setForgetConfirmAtom);

  useInput((input, key) => {
    if (isMouseInput(input)) {
      return;
    }
    if (form.current !== null) {
      return;
    }
    if (status.current === MemoryStatus.Loading || status.current === MemoryStatus.Busy) {
      return;
    }
    if (forgetConfirm.current !== null) {
      if (input.toLowerCase() === 'y') {
        void actions.forgetItem(forgetConfirm.current);
      }
      if (key.return || key.escape || input.toLowerCase() === 'n' || input.toLowerCase() === 'y') {
        setForgetConfirm(null);
      }
      return;
    }
    // While an item detail is open, up/down scroll it, enter/q closes it, and
    // other keys are inert (esc still falls through to the global close handler).
    if (detail.current !== null) {
      if (key.upArrow) {
        scrollDetail(-1);
        return;
      }
      if (key.downArrow) {
        scrollDetail(1);
        return;
      }
      if (key.return || input === 'q') {
        setDetail(null);
      }
      return;
    }
    if (key.escape && pendingAction.current !== null) {
      setPendingAction(null);
      return;
    }
    if (key.upArrow) {
      moveHighlight(-1);
      return;
    }
    if (key.downArrow) {
      moveHighlight(1);
      return;
    }
    if (key.tab) {
      switchMode(mode.current === MemoryMode.Active ? MemoryMode.Inbox : MemoryMode.Active);
      return;
    }
    if (input === 'r') {
      void actions.refresh();
      return;
    }
    if (mode.current === MemoryMode.Active) {
      handleActiveKey(input, key, item.current, pendingAction.current, actions, setForgetConfirm);
    } else {
      handleInboxKey(input, entry.current, actions);
    }
  });
}

function handleActiveKey(
  input: string,
  key: { return: boolean },
  item: MemoryItem | null,
  pendingAction: PendingMemoryItemAction | null,
  actions: MemoryInputActions,
  setForgetConfirm: (item: MemoryItem | null) => void
): void {
  if (item === null) {
    return;
  }
  if (pendingAction === PendingMemoryItemAction.Edit && key.return) {
    void actions.beginEdit(item);
    return;
  }
  if (pendingAction === PendingMemoryItemAction.Forget && key.return) {
    setForgetConfirm(item);
    return;
  }
  if (key.return) {
    void actions.showDetail(item);
    return;
  }
  if (input === 'x') {
    setForgetConfirm(item);
  }
}

function handleInboxKey(
  input: string,
  entry: MemoryInboxEntry | null,
  actions: MemoryInputActions
): void {
  if (entry === null) {
    return;
  }
  if (input === 'a') {
    void actions.applyInbox(entry.id, 'approve');
  } else if (input === 'j') {
    void actions.applyInbox(entry.id, 'reject');
  } else if (input === 's') {
    void actions.applyInbox(entry.id, 'stale');
  } else if (input === 'u') {
    void actions.undoInbox(entry.id);
  }
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
