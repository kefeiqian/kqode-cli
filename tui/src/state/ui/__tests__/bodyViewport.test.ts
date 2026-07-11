import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { HEADER_ROWS } from '@libs/tui/layout.ts';
import { bodyTopAtom, visibleBodyRowsAtom } from '@state/ui/bodyViewport.ts';

describe('bodyViewport atoms', () => {
  it('reports the body top as the header height', () => {
    const store = createStore();
    expect(store.get(bodyTopAtom)).toBe(HEADER_ROWS);
  });

  it('derives a body-row window from transcript state', () => {
    const store = createStore();
    const window = store.get(visibleBodyRowsAtom);

    expect(Array.isArray(window.allRows)).toBe(true);
    expect(Array.isArray(window.visibleRows)).toBe(true);
    expect(typeof window.startIndex).toBe('number');
  });
});
