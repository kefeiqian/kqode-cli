import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  columnsTestOverrideAtom,
  MIN_USABLE_TERMINAL_COLUMNS,
  MIN_USABLE_TERMINAL_ROWS,
  safeChromeColumnsAtom,
  rowsTestOverrideAtom,
  terminalTooSmallAtom,
  windowColumnsAtom,
  windowRowsAtom,
  rowsAtom
} from '@state/ui/dimensions.ts';
import { MIN_COLUMNS, MIN_ROWS, SAFE_CHROME_COLUMN_GUARD } from '@constants/ui.ts';

describe('terminalTooSmallAtom', () => {
  it('is false while the window size is unmeasured', () => {
    const store = createStore();
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });

  it('is true below the minimum usable height', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 80);
    store.set(rowsTestOverrideAtom, MIN_USABLE_TERMINAL_ROWS - 1);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('is true below the minimum usable width', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, MIN_USABLE_TERMINAL_COLUMNS - 1);
    store.set(rowsTestOverrideAtom, 24);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('is false at or above the minimum usable size', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, MIN_USABLE_TERMINAL_COLUMNS);
    store.set(rowsTestOverrideAtom, MIN_USABLE_TERMINAL_ROWS);
    expect(store.get(terminalTooSmallAtom)).toBe(false);
  });

  it('gates on height even when width is unmeasured', () => {
    const store = createStore();
    store.set(rowsTestOverrideAtom, 8);
    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

  it('subtracts the production row guard only from live window rows', () => {
    const store = createStore();
    store.set(windowRowsAtom, MIN_USABLE_TERMINAL_ROWS);
    expect(store.get(rowsAtom)).toBe(MIN_ROWS);

    store.set(rowsTestOverrideAtom, MIN_ROWS);
    expect(store.get(rowsAtom)).toBe(MIN_ROWS);
  });

  it('derives a safe chrome width from the raw terminal columns', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, MIN_COLUMNS + SAFE_CHROME_COLUMN_GUARD);
    expect(store.get(safeChromeColumnsAtom)).toBe(MIN_COLUMNS);
  });
});
