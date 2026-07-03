import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { rowsTestOverrideAtom, terminalTooSmallAtom } from '@state/global/dimensions.ts';

describe('terminalTooSmallAtom', () => {
  it('is false while the window height is unmeasured', () => {
    const store = createStore();
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });

  it('is true below the minimum usable height', () => {
    const store = createStore();
    store.set(rowsTestOverrideAtom, 8);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('is false at or above the minimum usable height', () => {
    const store = createStore();
    store.set(rowsTestOverrideAtom, 12);
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });
});
