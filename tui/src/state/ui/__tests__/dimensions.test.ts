import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  columnsTestOverrideAtom,
  rowsTestOverrideAtom,
  terminalTooSmallAtom
} from '@state/ui/dimensions.ts';

describe('terminalTooSmallAtom', () => {
  it('is false while the window size is unmeasured', () => {
    const store = createStore();
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });

  it('is true below the minimum usable height', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, 14);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('is true below the minimum usable width', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 59);
    store.set(rowsTestOverrideAtom, 24);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('is false at or above the minimum usable size', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 60);
    store.set(rowsTestOverrideAtom, 15);
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });

  it('gates on height even when width is unmeasured', () => {
    const store = createStore();
    store.set(rowsTestOverrideAtom, 8);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });
});
