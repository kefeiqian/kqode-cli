import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  bodySelectionAtom,
  clearBodySelectionAtom,
  startBodySelectionAtom,
  updateBodySelectionAtom
} from '@state/ui/selection.ts';

describe('bodySelection atoms', () => {
  it('starts a collapsed selection at the press point', () => {
    const store = createStore();
    store.set(startBodySelectionAtom, { rowIndex: 2, column: 5 });

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 2, column: 5 },
      focus: { rowIndex: 2, column: 5 }
    });
  });

  it('extends the focus while keeping the anchor fixed', () => {
    const store = createStore();
    store.set(startBodySelectionAtom, { rowIndex: 2, column: 5 });
    store.set(updateBodySelectionAtom, { rowIndex: 4, column: 1 });

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 2, column: 5 },
      focus: { rowIndex: 4, column: 1 }
    });
  });

  it('begins a selection when updated with none active', () => {
    const store = createStore();
    store.set(updateBodySelectionAtom, { rowIndex: 1, column: 1 });

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 1, column: 1 },
      focus: { rowIndex: 1, column: 1 }
    });
  });

  it('clears the active selection', () => {
    const store = createStore();
    store.set(startBodySelectionAtom, { rowIndex: 0, column: 0 });
    store.set(clearBodySelectionAtom);

    expect(store.get(bodySelectionAtom)).toBeNull();
  });
});
