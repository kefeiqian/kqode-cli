import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import {
  MemoryMode,
  MemoryStatus,
  highlightedMemoryItemAtom,
  memoryErrorAtom,
  memoryHighlightIndexAtom,
  memoryItemsAtom,
  memoryModeAtom,
  memoryStatusAtom,
  memoryVisibleRowsAtom,
  moveMemoryHighlightAtom,
  resetMemorySurfaceAtom,
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
