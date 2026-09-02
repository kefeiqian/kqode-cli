import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  BACKEND_LOADING_HINT,
  setTransientStatusHintAtom,
  startupStatusHintAtom,
  statusHintAtom,
  transientStatusHintAtom
} from '@state/ui/statusHint.ts';

describe('statusHintAtom', () => {
  it('returns the transient hint when no startup hint is active', () => {
    const store = createStore();
    const hint = { text: 'copied' };

    store.set(setTransientStatusHintAtom, hint);

    expect(store.get(transientStatusHintAtom)).toBe(hint);
    expect(store.get(statusHintAtom)).toBe(hint);
  });

  it('prefers the startup hint over a transient hint', () => {
    const store = createStore();
    store.set(transientStatusHintAtom, { text: 'copied' });
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);

    expect(store.get(statusHintAtom)).toBe(BACKEND_LOADING_HINT);
  });
});
