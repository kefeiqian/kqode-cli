import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { HEADER_ROWS, HIDDEN_HEADER_ROWS } from '@libs/tui/layout.ts';
import { bodyEntriesAtom } from '@state/ui/body.ts';
import { bodyTopAtom, visibleBodyRowsAtom } from '@state/ui/bodyViewport.ts';

describe('bodyViewport atoms', () => {
  it('reports the body top as the header height', () => {
    const store = createStore();
    expect(store.get(bodyTopAtom)).toBe(HEADER_ROWS);
  });

  it('reports the body top as the first row when body content hides the header', () => {
    const store = createStore();
    store.set(bodyEntriesAtom, [{ kind: BodyEntryKind.Success, text: 'content' }]);

    expect(store.get(bodyTopAtom)).toBe(HIDDEN_HEADER_ROWS);
  });

  it('derives a body-row window from transcript state', () => {
    const store = createStore();
    const window = store.get(visibleBodyRowsAtom);

    expect(Array.isArray(window.allRows)).toBe(true);
    expect(Array.isArray(window.visibleRows)).toBe(true);
    expect(typeof window.startIndex).toBe('number');
  });
});
