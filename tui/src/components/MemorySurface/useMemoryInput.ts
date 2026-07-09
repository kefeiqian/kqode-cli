import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  MemoryMode,
  MemoryStatus,
  highlightedInboxEntryAtom,
  highlightedMemoryItemAtom,
  memoryDetailBodyAtom,
  memoryModeAtom,
  memoryStatusAtom,
  moveMemoryHighlightAtom,
  setMemoryDetailAtom,
  switchMemoryModeAtom
} from '@state/ui/memory/index.ts';

/** Backend actions the surface input dispatches to (see `useMemoryBackend`). */
export type MemoryInputActions = {
  refresh: () => Promise<void>;
  showDetail: (item: MemoryItem) => Promise<void>;
  forgetItem: (item: MemoryItem) => Promise<void>;
  applyInbox: (entryId: string, action: 'approve' | 'reject' | 'stale') => Promise<void>;
  undoInbox: (entryId: string) => Promise<void>;
};

export function useMemoryInput(actions: MemoryInputActions) {
  const mode = useLatest(useAtomValue(memoryModeAtom));
  const status = useLatest(useAtomValue(memoryStatusAtom));
  const item = useLatest<MemoryItem | null>(useAtomValue(highlightedMemoryItemAtom));
  const entry = useLatest<MemoryInboxEntry | null>(useAtomValue(highlightedInboxEntryAtom));
  const detail = useLatest(useAtomValue(memoryDetailBodyAtom));
  const moveHighlight = useSetAtom(moveMemoryHighlightAtom);
  const switchMode = useSetAtom(switchMemoryModeAtom);
  const setDetail = useSetAtom(setMemoryDetailAtom);

  useInput((input, key) => {
    if (isMouseInput(input)) {
      return;
    }
    if (status.current === MemoryStatus.Loading || status.current === MemoryStatus.Busy) {
      return;
    }
    // While an item detail is open, enter/q closes it and other keys are inert
    // (esc still falls through to the global handler that closes the surface).
    if (detail.current !== null) {
      if (key.return || input === 'q') {
        setDetail(null);
      }
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
      handleActiveKey(input, key, item.current, actions);
    } else {
      handleInboxKey(input, entry.current, actions);
    }
  });
}

function handleActiveKey(
  input: string,
  key: { return: boolean },
  item: MemoryItem | null,
  actions: MemoryInputActions
): void {
  if (item === null) {
    return;
  }
  if (key.return) {
    void actions.showDetail(item);
    return;
  }
  if (input === 'x') {
    void actions.forgetItem(item);
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
