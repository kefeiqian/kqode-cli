import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { MemoryInboxEntry, MemoryItem } from '@contracts/backend/index.ts';
import {
  MemoryMode,
  MemoryStatus,
  PendingMemoryItemAction,
  closeMemoryFormAtom,
  forgetConfirmAtom,
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
  resetMemoryDataAtom,
  resetMemorySubStateAtom,
  resetMemorySurfaceAtom,
  setMemoryFormBodyAtom,
  setMemoryFormErrorAtom,
  setMemoryFormFieldAtom,
  setPendingMemoryItemActionAtom,
  setMemoryFormTitleAtom,
  setMemoryDataAtom,
  setForgetConfirmAtom,
  setMemoryFailureAtom,
  switchMemoryModeAtom,
  visibleMemoryItemsAtom,
  MEMORY_DOCK_LIST_CHROME_ROWS,
  MEMORY_DOCK_SUBSTATE_CHROME_ROWS,
  MEMORY_FORM_ROWS,
  memoryDesiredRowsAtom,
  memoryDetailOffsetAtom,
  memoryDetailVisibleRowsAtom,
  scrollMemoryDetailAtom,
  setMemoryDetailAtom
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

  it('resetMemoryData clears loaded data but preserves open-time sub-state', () => {
    // The surface's mount-time refresh() uses this reset; it must not wipe a
    // form/pick the composer opened just before the surface mounted.
    const store = createStore();
    store.set(setMemoryDataAtom, { items: [item('a')], inbox: [entry('e')] });
    store.set(openAddMemoryFormAtom);
    store.set(forgetConfirmAtom, item('f'));

    store.set(resetMemoryDataAtom);

    expect(store.get(memoryItemsAtom)).toEqual([]);
    expect(store.get(memoryStatusAtom)).toBe(MemoryStatus.Loading);
    expect(store.get(memoryFormAtom)).not.toBeNull();
    expect(store.get(forgetConfirmAtom)).not.toBeNull();
  });

  it('resetMemorySubState clears the form, pending action, and forget confirm', () => {
    const store = createStore();
    store.set(openAddMemoryFormAtom);
    store.set(pendingMemoryItemActionAtom, PendingMemoryItemAction.Edit);
    store.set(forgetConfirmAtom, item('f'));

    store.set(resetMemorySubStateAtom);

    expect(store.get(memoryFormAtom)).toBeNull();
    expect(store.get(pendingMemoryItemActionAtom)).toBeNull();
    expect(store.get(forgetConfirmAtom)).toBeNull();
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

  it('tracks forget confirmation and clears it on reset', () => {
    const store = createStore();
    const selected = item('forget-me');

    store.set(setForgetConfirmAtom, selected);
    expect(store.get(forgetConfirmAtom)).toEqual(selected);
    expect(store.get(pendingMemoryItemActionAtom)).toBeNull();

    store.set(resetMemorySurfaceAtom);
    expect(store.get(forgetConfirmAtom)).toBeNull();
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

  it('desires list chrome plus header and one row per item, or the sub-state height', () => {
    const store = createStore();
    store.set(setMemoryDataAtom, { items: [item('a'), item('b')], inbox: [] });
    expect(store.get(memoryDesiredRowsAtom)).toBe(MEMORY_DOCK_LIST_CHROME_ROWS + 1 + 2);

    store.set(openAddMemoryFormAtom);
    expect(store.get(memoryDesiredRowsAtom)).toBe(MEMORY_DOCK_SUBSTATE_CHROME_ROWS + MEMORY_FORM_ROWS);
  });

  it('scrolls the detail view within its line count and resets on open', () => {
    const store = createStore();
    store.set(memoryDetailVisibleRowsAtom, 2);
    store.set(setMemoryDetailAtom, 'l1\nl2\nl3\nl4');
    expect(store.get(memoryDetailOffsetAtom)).toBe(0);

    store.set(scrollMemoryDetailAtom, 5);
    expect(store.get(memoryDetailOffsetAtom)).toBe(2); // clamped to 4 lines - 2 visible

    store.set(scrollMemoryDetailAtom, -1);
    expect(store.get(memoryDetailOffsetAtom)).toBe(1);

    store.set(setMemoryDetailAtom, 'again');
    expect(store.get(memoryDetailOffsetAtom)).toBe(0);
  });
});
