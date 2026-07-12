import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  handleSelectionGesture,
  resolveGestureRegion
} from '@components/HomeScreen/selectionInput.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  bodyEntriesAtom,
  bodySelectionAtom,
  bodyTopAtom,
  columnsTestOverrideAtom,
  composerTopAtom,
  openResumePanelAtom,
  rowsTestOverrideAtom
} from '@state/ui/index.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function seededStore() {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 80);
  store.set(rowsTestOverrideAtom, 24);
  store.set(bodyEntriesAtom, [{ kind: BodyEntryKind.Success, text: 'selectable line' }]);
  return store;
}

describe('handleSelectionGesture', () => {
  it('starts a collapsed selection on press and extends the focus on drag', () => {
    const store = seededStore();

    handleSelectionGesture(store, { kind: 'press', row: 3, column: 2 });
    const started = store.get(bodySelectionAtom);
    expect(started).not.toBeNull();
    expect(started?.anchor).toEqual(started?.focus);

    handleSelectionGesture(store, { kind: 'drag', row: 3, column: 6 });
    const dragged = store.get(bodySelectionAtom);
    expect(dragged?.anchor).toEqual(started?.anchor);
    // Column 6 (1-based SGR) maps to display column 5.
    expect(dragged?.focus.column).toBe(5);
  });

  it('copies the selection on release', async () => {
    const store = seededStore();
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    handleSelectionGesture(store, { kind: 'press', row: 3, column: 1 });
    handleSelectionGesture(store, { kind: 'drag', row: 3, column: 40 });
    handleSelectionGesture(store, { kind: 'release', row: 3, column: 40 });
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('selectable'));
  });

  it('ignores gestures when the transcript is empty', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 24);

    handleSelectionGesture(store, { kind: 'press', row: 3, column: 2 });

    expect(store.get(bodySelectionAtom)).toBeNull();
  });
});

describe('resolveGestureRegion', () => {
  it('routes a press over the transcript body to the body region', () => {
    const store = seededStore();
    // SGR row `bodyTop + 1` maps to the first zero-based body row (bodyTop).
    expect(resolveGestureRegion(store, store.get(bodyTopAtom) + 1)).toBe('body');
  });

  it('routes a press over the composer to the composer region', () => {
    const store = seededStore();
    // `composerTop + 2` (1-based) is a composer text row below the top padding.
    expect(resolveGestureRegion(store, store.get(composerTopAtom) + 2)).toBe('composer');
  });

  it('returns null for a press on inert chrome above the body', () => {
    const store = seededStore();
    // SGR row 1 → zero-based row 0, the header row above the transcript.
    expect(resolveGestureRegion(store, 1)).toBeNull();
  });

  it('returns null while a docked panel owns the screen', () => {
    const store = seededStore();
    store.set(openResumePanelAtom);

    expect(resolveGestureRegion(store, store.get(bodyTopAtom) + 1)).toBeNull();
  });
});
