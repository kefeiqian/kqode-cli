import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  BACKEND_LOADING_HINT,
  inputLockedAtom,
  setTransientStatusHintAtom,
  startupStatusHintAtom
} from '@state/ui/index.ts';

describe('inputLockedAtom', () => {
  it('locks input for startup hints only', () => {
    const store = createStore();

    store.set(setTransientStatusHintAtom, { text: 'copied' });
    expect(store.get(inputLockedAtom)).toBe(false);

    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    expect(store.get(inputLockedAtom)).toBe(true);
  });
});
