import { createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  columnsTestOverrideAtom,
  rowsAtom,
  rowsTestOverrideAtom,
  terminalTooSmallAtom,
  windowColumnsAtom,
  windowRowsAtom
} from '@state/ui/dimensions.ts';

describe('terminalTooSmallAtom', () => {
  beforeEach(() => {
    vi.stubEnv('TERM_PROGRAM', 'Windows_Terminal');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reserves one row in WezTerm to stay below Ink fullscreen rendering', () => {
    vi.stubEnv('TERM_PROGRAM', 'WezTerm');
    const store = createStore();
    store.set(windowRowsAtom, 24);

    expect(store.get(rowsAtom)).toBe(23);
  });

  it('keeps the full terminal height outside WezTerm', () => {
    const store = createStore();
    store.set(windowRowsAtom, 24);

    expect(store.get(rowsAtom)).toBe(24);
  });

  it('includes the WezTerm guard row in the minimum usable height', () => {
    vi.stubEnv('TERM_PROGRAM', 'WezTerm');
    const store = createStore();
    store.set(windowColumnsAtom, 80);
    store.set(windowRowsAtom, 15);

    expect(store.get(terminalTooSmallAtom)).toBe(true);
  });

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
