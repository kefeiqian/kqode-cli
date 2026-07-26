import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  bodySelectionAtom,
  clearBodySelectionAtom,
  startBodySelectionAtom,
  updateBodySelectionAtom
} from '@state/ui/selection.ts';

describe('body selection state', () => {
  it('starts, extends, and clears a selection', () => {
    const store = createStore();
    store.set(startBodySelectionAtom, { rowIndex: 2, column: 5 });
    store.set(updateBodySelectionAtom, { rowIndex: 4, column: 1 });

    expect(store.get(bodySelectionAtom)).toEqual({
      anchor: { rowIndex: 2, column: 5 },
      focus: { rowIndex: 4, column: 1 }
    });

    store.set(clearBodySelectionAtom);
    expect(store.get(bodySelectionAtom)).toBeNull();
  });
});
