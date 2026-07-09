import { atom } from 'jotai';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import { clamp } from '@libs/math/clamp.ts';

/** Internal tabs of the `/memory` surface. */
export const MemoryMode = {
  Active: 'active',
  Inbox: 'inbox'
} as const;

export type MemoryMode = (typeof MemoryMode)[keyof typeof MemoryMode];

/** Load/interaction status of the `/memory` surface. */
export const MemoryStatus = {
  Loading: 'loading',
  Loaded: 'loaded',
  Empty: 'empty',
  Busy: 'busy',
  Failed: 'failed'
} as const;

export type MemoryStatus = (typeof MemoryStatus)[keyof typeof MemoryStatus];

export const memoryModeAtom = atom<MemoryMode>(MemoryMode.Active);
export const memoryItemsAtom = atom<MemoryItem[]>([]);
export const memoryInboxAtom = atom<MemoryInboxEntry[]>([]);
export const memoryStatusAtom = atom<MemoryStatus>(MemoryStatus.Loading);
export const memoryErrorAtom = atom<string | null>(null);
export const memoryHighlightIndexAtom = atom(0);
export const memoryWindowOffsetAtom = atom(0);
export const memoryVisibleRowsAtom = atom(1);
export const memoryDetailBodyAtom = atom<string | null>(null);

const currentListLengthAtom = atom((get) =>
  get(memoryModeAtom) === MemoryMode.Active ? get(memoryItemsAtom).length : get(memoryInboxAtom).length
);

export const highlightedMemoryItemAtom = atom(
  (get) => get(memoryItemsAtom)[get(memoryHighlightIndexAtom)] ?? null
);

export const highlightedInboxEntryAtom = atom(
  (get) => get(memoryInboxAtom)[get(memoryHighlightIndexAtom)] ?? null
);

export const visibleMemoryItemsAtom = atom((get) => {
  const items = get(memoryItemsAtom);
  const offset = get(memoryWindowOffsetAtom);
  return items.slice(offset, offset + get(memoryVisibleRowsAtom));
});

export const visibleInboxEntriesAtom = atom((get) => {
  const entries = get(memoryInboxAtom);
  const offset = get(memoryWindowOffsetAtom);
  return entries.slice(offset, offset + get(memoryVisibleRowsAtom));
});

function statusForMode(items: MemoryItem[], inbox: MemoryInboxEntry[], mode: MemoryMode): MemoryStatus {
  const length = mode === MemoryMode.Active ? items.length : inbox.length;
  return length === 0 ? MemoryStatus.Empty : MemoryStatus.Loaded;
}

export const resetMemorySurfaceAtom = atom(null, (_get, set) => {
  set(memoryItemsAtom, []);
  set(memoryInboxAtom, []);
  set(memoryStatusAtom, MemoryStatus.Loading);
  set(memoryErrorAtom, null);
  set(memoryHighlightIndexAtom, 0);
  set(memoryWindowOffsetAtom, 0);
  set(memoryDetailBodyAtom, null);
});

export const setMemoryDataAtom = atom(
  null,
  (get, set, data: { items: MemoryItem[]; inbox: MemoryInboxEntry[] }) => {
    set(memoryItemsAtom, data.items);
    set(memoryInboxAtom, data.inbox);
    set(memoryStatusAtom, statusForMode(data.items, data.inbox, get(memoryModeAtom)));
    set(memoryErrorAtom, null);
    set(memoryHighlightIndexAtom, 0);
    set(memoryWindowOffsetAtom, 0);
    set(memoryDetailBodyAtom, null);
  }
);

export const setMemoryFailureAtom = atom(null, (_get, set, message: string) => {
  set(memoryStatusAtom, MemoryStatus.Failed);
  set(memoryErrorAtom, message);
});

export const setMemoryBusyAtom = atom(null, (_get, set) => {
  set(memoryStatusAtom, MemoryStatus.Busy);
  set(memoryErrorAtom, null);
});

export const switchMemoryModeAtom = atom(null, (get, set, mode: MemoryMode) => {
  if (get(memoryModeAtom) === mode) {
    return;
  }
  set(memoryModeAtom, mode);
  set(memoryHighlightIndexAtom, 0);
  set(memoryWindowOffsetAtom, 0);
  set(memoryDetailBodyAtom, null);
  set(memoryStatusAtom, statusForMode(get(memoryItemsAtom), get(memoryInboxAtom), mode));
});

export const moveMemoryHighlightAtom = atom(null, (get, set, delta: number) => {
  const length = get(currentListLengthAtom);
  if (length === 0 || get(memoryStatusAtom) !== MemoryStatus.Loaded) {
    return;
  }
  const nextIndex = clamp(get(memoryHighlightIndexAtom) + delta, 0, length - 1);
  set(memoryHighlightIndexAtom, nextIndex);
  const visible = get(memoryVisibleRowsAtom);
  const maxOffset = Math.max(0, length - visible);
  const offset = get(memoryWindowOffsetAtom);
  set(
    memoryWindowOffsetAtom,
    clamp(nextIndex < offset ? nextIndex : Math.max(offset, nextIndex - visible + 1), 0, maxOffset)
  );
});

export const setMemoryDetailAtom = atom(null, (_get, set, body: string | null) => {
  set(memoryDetailBodyAtom, body);
});
