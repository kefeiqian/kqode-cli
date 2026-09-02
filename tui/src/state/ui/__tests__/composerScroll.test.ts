import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { composerScrollOffsetRowsAtom, composerStateAtom } from '@state/ui/composer/index.ts';
import { composerCanScrollAtom, scrollComposerByRowsAtom, scrollComposerCursorIntoViewAtom } from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

const overflowingText = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');

const seed = (store: Store, text: string): void => {
  store.set(columnsTestOverrideAtom, 60);
  store.set(rowsTestOverrideAtom, 24);
  store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });
};

describe('composer scroll atoms', () => {
  it('reports canScroll true when the prompt overflows the cap', () => {
    const store = createStore();
    seed(store, overflowingText);
    expect(store.get(composerCanScrollAtom)).toBe(true);
  });

  it('reports canScroll false for a short prompt', () => {
    const store = createStore();
    seed(store, 'short');
    expect(store.get(composerCanScrollAtom)).toBe(false);
  });

  it('clamps the scroll offset within the resolver bounds', () => {
    const store = createStore();
    seed(store, overflowingText);

    store.set(scrollComposerByRowsAtom, 5);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(5);

    // Wheel far past the top: clamps up to maxOffset.
    store.set(scrollComposerByRowsAtom, 999);
    expect(store.get(composerScrollOffsetRowsAtom)).toBeGreaterThan(5);

    // Wheel far past the bottom: clamps down to minOffset (0 with cursor at end).
    store.set(scrollComposerByRowsAtom, -999);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(0);
  });
});

describe('scrollComposerCursorIntoViewAtom', () => {
  it('snaps the caret back into view when it is scrolled off-window', () => {
    const store = createStore();
    seed(store, overflowingText);
    // Scroll far toward the top so the caret (at the end) falls below the window.
    store.set(scrollComposerByRowsAtom, 999);
    expect(store.get(composerScrollOffsetRowsAtom)).toBeGreaterThan(0);

    store.set(scrollComposerCursorIntoViewAtom);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(0); // caret pinned to the bottom edge
  });

  it('leaves the offset untouched when the caret is already visible', () => {
    const store = createStore();
    seed(store, overflowingText); // caret at end, offset 0 -> visible at the bottom
    store.set(scrollComposerCursorIntoViewAtom);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(0);
  });
});
