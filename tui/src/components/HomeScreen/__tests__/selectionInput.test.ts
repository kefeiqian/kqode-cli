import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import {
  createSelectionGestureState,
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

  it('finalizes the selection on release without copying', async () => {
    const store = seededStore();
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    handleSelectionGesture(store, { kind: 'press', row: 3, column: 1 });
    handleSelectionGesture(store, { kind: 'drag', row: 3, column: 40 });
    handleSelectionGesture(store, { kind: 'release', row: 3, column: 40 });
    await flushPromises();

    // Copying is a manual right-click now; a drag-release only highlights.
    expect(writeText).not.toHaveBeenCalled();
    const selection = store.get(bodySelectionAtom);
    expect(selection?.anchor).toEqual({ rowIndex: 0, column: 0 });
    expect(selection?.focus).not.toEqual(selection?.anchor);
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
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 24);

    // SGR row 1 → zero-based row 0, the visible header row above the transcript.
    expect(resolveGestureRegion(store, 1)).toBeNull();
  });

  it('returns null while a docked panel owns the screen', () => {
    const store = seededStore();
    store.set(openResumePanelAtom);

    expect(resolveGestureRegion(store, store.get(bodyTopAtom) + 1)).toBeNull();
  });
});

describe('handleSelectionGesture multi-click', () => {
  function multiClickStore(text: string, kind: BodyEntryKind = BodyEntryKind.Success) {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 24);
    store.set(bodyEntriesAtom, [{ kind, text }]);
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    return { store, writeText };
  }

  // Drives a click at the given 1-based SGR cell: press then release, advancing
  // the injected clock so successive calls classify as a multi-click cycle.
  function clickAt(
    store: ReturnType<typeof createStore>,
    ctx: { state: ReturnType<typeof createSelectionGestureState>; now: () => number },
    column: number,
    releaseColumn = column
  ): void {
    handleSelectionGesture(store, { kind: 'press', row: 2, column }, ctx);
    handleSelectionGesture(store, { kind: 'release', row: 2, column: releaseColumn }, ctx);
  }

  it('selects the whitespace-delimited word on a double-click (AE5)', async () => {
    const { store, writeText } = multiClickStore('error in src/main.rs line 4');
    const state = createSelectionGestureState();
    let clock = 0;
    const ctx = { state, now: () => clock };

    // '/' inside 'src/main.rs' is display column 12 → SGR column 13.
    clickAt(store, ctx, 13);
    clock = 120;
    clickAt(store, ctx, 13);
    await flushPromises();

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 0, column: 9 },
      focus: { rowIndex: 0, column: 20 }
    });
    // The word is highlighted, not copied — copying is a manual right-click.
    expect(writeText).not.toHaveBeenCalled();
  });

  it('selects the whole rendered line on a triple-click (AE5)', async () => {
    const { store, writeText } = multiClickStore('error in src/main.rs line 4');
    const state = createSelectionGestureState();
    let clock = 0;
    const ctx = { state, now: () => clock };

    clickAt(store, ctx, 13);
    clock = 100;
    clickAt(store, ctx, 13);
    clock = 200;
    clickAt(store, ctx, 13);
    await flushPromises();

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 27 }
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('keeps the locked word even when the release drifts off the press cell', async () => {
    const { store, writeText } = multiClickStore('error in src/main.rs line 4');
    const state = createSelectionGestureState();
    let clock = 0;
    const ctx = { state, now: () => clock };

    clickAt(store, ctx, 13);
    clock = 100;
    // The double-click's release lands one cell away; the locked word stands.
    clickAt(store, ctx, 13, 14);
    await flushPromises();

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 0, column: 9 },
      focus: { rowIndex: 0, column: 20 }
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('selects nothing when a double-click lands on whitespace', async () => {
    const { store, writeText } = multiClickStore('error in src/main.rs line 4');
    const state = createSelectionGestureState();
    let clock = 0;
    const ctx = { state, now: () => clock };

    // Display column 5 is the space after 'error' → SGR column 6.
    clickAt(store, ctx, 6);
    clock = 100;
    clickAt(store, ctx, 6);
    await flushPromises();

    expect(writeText).not.toHaveBeenCalled();
    const selection = store.get(bodySelectionAtom);
    expect(selection?.anchor).toEqual(selection?.focus);
  });

  it('offsets word bounds past the marker on a marker-bearing row', async () => {
    const { store, writeText } = multiClickStore('hello world', BodyEntryKind.Assistant);
    const state = createSelectionGestureState();
    let clock = 0;
    const ctx = { state, now: () => clock };

    // Assistant rows render a '• ' marker (2 cols); 'hello' renders at screen cols
    // [2, 7). Click 'e' at screen col 3 → SGR col 4.
    clickAt(store, ctx, 4);
    clock = 100;
    clickAt(store, ctx, 4);
    await flushPromises();

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 0, column: 2 },
      focus: { rowIndex: 0, column: 7 }
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});
