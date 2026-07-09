import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import {
  MemoryMode,
  MemoryStatus,
  PendingMemoryItemAction,
  closeMemoryFormAtom,
  highlightedMemoryItemAtom,
  memoryErrorAtom,
  memoryFormAtom,
  memoryHighlightIndexAtom,
  memoryItemsAtom,
  memoryModeAtom,
  pendingMemoryItemActionAtom,
  memoryStatusAtom,
  memoryVisibleRowsAtom,
  moveMemoryHighlightAtom,
  openEditMemoryFormAtom,
  openAddMemoryFormAtom,
  resetMemorySurfaceAtom,
  setMemoryFormBodyAtom,
  setMemoryFormErrorAtom,
  setMemoryFormFieldAtom,
  setPendingMemoryItemActionAtom,
  setMemoryFormTitleAtom,
  setMemoryDataAtom,
  setMemoryFailureAtom,
  switchMemoryModeAtom,
  visibleMemoryItemsAtom
} from '@state/ui/memory/index.ts';

function item(id: string): MemoryItem {
  return {
    id,
    scope: 'user',
    scopeId: null,
    memoryType: 'user',
    title: id,
    active: true,
    source: 'manual',
    sourceSessionId: null,
    sourceTurnStart: null,
    sourceTurnEnd: null,
    contentHash: '',
    createdAt: 0,
    updatedAt: 0
  };
}

function entry(id: string): MemoryInboxEntry {
  return {
    id,
    status: 'candidate',
    scope: 'user',
    scopeId: null,
    targetItemId: null,
    memoryType: null,
    title: id,
    confidence: null,
    reason: null,
    createdAt: 0,
    updatedAt: 0
  };
}

describe('memory surface atoms', () => {
  it('loads items and marks the surface loaded in active mode', () => {
    const store = createStore();
    store.set(setMemoryDataAtom, { items: [item('a'), item('b')], inbox: [] });
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Loaded);
    expect(store.get(memoryItemsAtom)).toHaveLength(2);
    expect(store.get(highlightedMemoryItemAtom)?.id).toBe('a');
  });

  it('is empty when the active list is empty even if the inbox has entries', () => {
    const store = createStore();
    store.set(setMemoryDataAtom, { items: [], inbox: [entry('e')] });
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Empty);
  });

  it('clamps highlight movement to the current list', () => {
    const store = createStore();
    store.set(memoryVisibleRowsAtom, 10);
    store.set(setMemoryDataAtom, { items: [item('a'), item('b'), item('c')], inbox: [] });

    store.set(moveMemoryHighlightAtom, 5);
    expect(store.get(memoryHighlightIndexAtom)).toBe(2);
    store.set(moveMemoryHighlightAtom, -10);
    expect(store.get(memoryHighlightIndexAtom)).toBe(0);
  });

  it('switching mode resets highlight and recomputes status for that list', () => {
    const store = createStore();
    store.set(setMemoryDataAtom, { items: [item('a')], inbox: [] });
    store.set(memoryHighlightIndexAtom, 0);

    store.set(switchMemoryModeAtom, MemoryMode.Inbox);
    expect(store.get(memoryModeAtom)).toBe(MemoryMode.Inbox);
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Empty);
    expect(store.get(memoryHighlightIndexAtom)).toBe(0);
  });

  it('reset clears data but preserves the selected mode', () => {
    const store = createStore();
    store.set(memoryModeAtom, MemoryMode.Inbox);
    store.set(setMemoryDataAtom, { items: [item('a')], inbox: [entry('e')] });

    store.set(resetMemorySurfaceAtom);

    expect(store.get(memoryModeAtom)).toBe(MemoryMode.Inbox);
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Loading);
    expect(store.get(memoryItemsAtom)).toEqual([]);
  });

  it('opens, edits, errors, and resets the memory form', () => {
    const store = createStore();

    store.set(openAddMemoryFormAtom);
    store.set(setMemoryFormTitleAtom, { title: 'T', cursor: 1 });
    store.set(setMemoryFormBodyAtom, { body: 'B', cursor: 1 });
    store.set(setMemoryFormErrorAtom, { titleError: 'bad', submitError: 'boom' });

    expect(store.get(memoryFormAtom)).toMatchObject({
      title: 'T',
      body: 'B',
      titleError: 'bad',
      submitError: 'boom'
    });

    store.set(resetMemorySurfaceAtom);
    expect(store.get(memoryFormAtom)).toBeNull();

    store.set(openAddMemoryFormAtom);
    store.set(closeMemoryFormAtom);
    expect(store.get(memoryFormAtom)).toBeNull();
  });

  it('tracks pick-to-edit state and opens a prefilled edit form', () => {
    const store = createStore();
    const selected = item('edit-me');

    store.set(setPendingMemoryItemActionAtom, PendingMemoryItemAction.Edit);
    expect(store.get(pendingMemoryItemActionAtom)).toBe(PendingMemoryItemAction.Edit);

    store.set(openEditMemoryFormAtom, { item: selected, body: 'full body' });
    expect(store.get(pendingMemoryItemActionAtom)).toBeNull();
    expect(store.get(memoryFormAtom)).toMatchObject({
      mode: 'edit',
      item: selected,
      title: selected.title,
      body: 'full body'
    });
  });

  it('preserves a failed status and error when switching modes', () => {
    const store = createStore();
    store.set(setMemoryFailureAtom, 'backend down');

    store.set(switchMemoryModeAtom, MemoryMode.Inbox);
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Failed);
    expect(store.get(memoryErrorAtom)).toBe('backend down');
  });

  it('scrolls the window to keep the highlight visible for a header-reserved viewport', () => {
    const store = createStore();
    store.set(memoryVisibleRowsAtom, 2);
    store.set(setMemoryDataAtom, {
      items: [item('a'), item('b'), item('c'), item('d'), item('e')],
      inbox: []
    });

    store.set(moveMemoryHighlightAtom, 4);
    expect(store.get(memoryHighlightIndexAtom)).toBe(4);
    expect(store.get(visibleMemoryItemsAtom).map((entry) => entry.id)).toEqual(['d', 'e']);
  });
});
