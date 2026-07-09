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

export const MemoryFormMode = {
  Add: 'add',
  Edit: 'edit'
} as const;

export type MemoryFormMode = (typeof MemoryFormMode)[keyof typeof MemoryFormMode];

export const MemoryFormField = {
  Title: 'title',
  Body: 'body'
} as const;

export type MemoryFormField = (typeof MemoryFormField)[keyof typeof MemoryFormField];

export type MemoryFormState = {
  mode: MemoryFormMode;
  item: MemoryItem | null;
  title: string;
  body: string;
  activeField: MemoryFormField;
  titleCursor: number;
  bodyCursor: number;
  titleError: string | null;
  submitError: string | null;
};

export const PendingMemoryItemAction = {
  Edit: 'edit',
  Forget: 'forget'
} as const;

export type PendingMemoryItemAction =
  (typeof PendingMemoryItemAction)[keyof typeof PendingMemoryItemAction];

export const memoryModeAtom = atom<MemoryMode>(MemoryMode.Active);
export const memoryItemsAtom = atom<MemoryItem[]>([]);
export const memoryInboxAtom = atom<MemoryInboxEntry[]>([]);
export const memoryStatusAtom = atom<MemoryStatus>(MemoryStatus.Loading);
export const memoryErrorAtom = atom<string | null>(null);
export const memoryHighlightIndexAtom = atom(0);
export const memoryWindowOffsetAtom = atom(0);
export const memoryVisibleRowsAtom = atom(1);
export const memoryDetailBodyAtom = atom<string | null>(null);
export const memoryFormAtom = atom<MemoryFormState | null>(null);
export const pendingMemoryItemActionAtom = atom<PendingMemoryItemAction | null>(null);

export const memorySurfaceConsumesEscAtom = atom(
  (get) => get(memoryFormAtom) !== null || get(pendingMemoryItemActionAtom) !== null
);

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
  set(memoryFormAtom, null);
  set(pendingMemoryItemActionAtom, null);
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
  // Only recompute loaded/empty from the new mode's list; preserve a Failed (or
  // in-flight) status so switching tabs after a load failure keeps the error.
  const current = get(memoryStatusAtom);
  if (current === MemoryStatus.Loaded || current === MemoryStatus.Empty) {
    set(memoryStatusAtom, statusForMode(get(memoryItemsAtom), get(memoryInboxAtom), mode));
  }
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

export const openAddMemoryFormAtom = atom(null, (_get, set) => {
  set(pendingMemoryItemActionAtom, null);
  set(memoryFormAtom, {
    mode: MemoryFormMode.Add,
    item: null,
    title: '',
    body: '',
    activeField: MemoryFormField.Title,
    titleCursor: 0,
    bodyCursor: 0,
    titleError: null,
    submitError: null
  });
});

export const openEditMemoryFormAtom = atom(null, (_get, set, data: { item: MemoryItem; body: string }) => {
  set(pendingMemoryItemActionAtom, null);
  set(memoryFormAtom, {
    mode: MemoryFormMode.Edit,
    item: data.item,
    title: data.item.title,
    body: data.body,
    activeField: MemoryFormField.Title,
    titleCursor: data.item.title.length,
    bodyCursor: data.body.length,
    titleError: null,
    submitError: null
  });
});

export const closeMemoryFormAtom = atom(null, (_get, set) => {
  set(memoryFormAtom, null);
});

export const setPendingMemoryItemActionAtom = atom(
  null,
  (_get, set, action: PendingMemoryItemAction | null) => {
    set(pendingMemoryItemActionAtom, action);
    set(memoryHighlightIndexAtom, 0);
    set(memoryWindowOffsetAtom, 0);
    set(memoryDetailBodyAtom, null);
  }
);

export const setMemoryFormFieldAtom = atom(null, (get, set, field: MemoryFormField) => {
  const form = get(memoryFormAtom);
  if (form !== null) {
    set(memoryFormAtom, { ...form, activeField: field });
  }
});

export const setMemoryFormTitleAtom = atom(
  null,
  (get, set, update: { title: string; cursor: number }) => {
    const form = get(memoryFormAtom);
    if (form !== null) {
      set(memoryFormAtom, { ...form, title: update.title, titleCursor: update.cursor, titleError: null, submitError: null });
    }
  }
);

export const setMemoryFormBodyAtom = atom(null, (get, set, update: { body: string; cursor: number }) => {
  const form = get(memoryFormAtom);
  if (form !== null) {
    set(memoryFormAtom, { ...form, body: update.body, bodyCursor: update.cursor, submitError: null });
  }
});

export const setMemoryFormErrorAtom = atom(
  null,
  (get, set, error: { titleError?: string | null; submitError?: string | null }) => {
    const form = get(memoryFormAtom);
    if (form !== null) {
      set(memoryFormAtom, { ...form, ...error });
    }
  }
);
