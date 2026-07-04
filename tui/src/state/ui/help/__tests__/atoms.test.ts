import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  closeHelpAtom,
  helpScrollOffsetAtom,
  helpVisibleAtom,
  openHelpAtom,
  scrollHelpByRowsAtom
} from '@state/ui/help/atoms.ts';

describe('help atoms', () => {
  it('openHelpAtom shows the viewer and resets scroll to the top', () => {
    const store = createStore();
    store.set(helpScrollOffsetAtom, 7);

    store.set(openHelpAtom);

    expect(store.get(helpVisibleAtom)).toBe(true);
    expect(store.get(helpScrollOffsetAtom)).toBe(0);
  });

  it('closeHelpAtom hides the viewer and resets scroll to the top', () => {
    const store = createStore();
    store.set(helpVisibleAtom, true);
    store.set(helpScrollOffsetAtom, 4);

    store.set(closeHelpAtom);

    expect(store.get(helpVisibleAtom)).toBe(false);
    expect(store.get(helpScrollOffsetAtom)).toBe(0);
  });

  it('scrollHelpByRowsAtom clamps the offset to [0, maxOffset]', () => {
    const store = createStore();

    store.set(scrollHelpByRowsAtom, { delta: 3, maxOffset: 5 });
    expect(store.get(helpScrollOffsetAtom)).toBe(3);

    store.set(scrollHelpByRowsAtom, { delta: 10, maxOffset: 5 });
    expect(store.get(helpScrollOffsetAtom)).toBe(5);

    store.set(scrollHelpByRowsAtom, { delta: -100, maxOffset: 5 });
    expect(store.get(helpScrollOffsetAtom)).toBe(0);
  });
});
