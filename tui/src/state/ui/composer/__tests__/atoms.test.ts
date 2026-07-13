import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  clearComposerAtom,
  composerCaretRefreshTickAtom,
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  deleteComposerBackwardAtom,
  insertComposerTextAtom,
  moveComposerCursorBackwardAtom,
  moveComposerCursorDownAtom,
  moveComposerCursorForwardAtom,
  moveComposerCursorUpAtom,
  setComposerCursorWithOffsetAtom
} from '@state/ui/composer/index.ts';

describe('composerAtoms', () => {
  it('appends printable text and deletes the last character', () => {
    const store = createStore();

    store.set(insertComposerTextAtom, { text: 'abc' });
    store.set(deleteComposerBackwardAtom, {});

    expect(store.get(composerStateAtom).text).toBe('ab');
    expect(store.get(composerStateAtom).cursorIndex).toBe(2);
  });

  it('moves the cursor left and right for middle insertion and deletion', () => {
    const store = createStore();

    store.set(insertComposerTextAtom, { text: 'abc' });
    store.set(moveComposerCursorBackwardAtom);
    store.set(insertComposerTextAtom, { text: 'X' });
    const inserted = store.get(composerStateAtom);
    store.set(deleteComposerBackwardAtom, {});
    const deleted = store.get(composerStateAtom);
    store.set(insertComposerTextAtom, { text: 'X' });
    store.set(moveComposerCursorForwardAtom);
    store.set(insertComposerTextAtom, { text: 'Y' });

    expect(inserted.text).toBe('abXc');
    expect(inserted.cursorIndex).toBe(3);
    expect(deleted.text).toBe('abc');
    expect(deleted.cursorIndex).toBe(2);
    expect(store.get(composerStateAtom).text).toBe('abXcY');
  });

  it('moves and deletes by grapheme cluster for emoji and combining marks', () => {
    const store = createStore();
    const text = '👍🏽e\u0301x';
    store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });

    store.set(moveComposerCursorBackwardAtom);
    expect(store.get(composerStateAtom).cursorIndex).toBe(text.length - 1);

    store.set(moveComposerCursorBackwardAtom);
    expect(store.get(composerStateAtom).cursorIndex).toBe('👍🏽'.length);

    store.set(moveComposerCursorBackwardAtom);
    expect(store.get(composerStateAtom).cursorIndex).toBe(0);

    store.set(moveComposerCursorForwardAtom);
    expect(store.get(composerStateAtom).cursorIndex).toBe('👍🏽'.length);

    store.set(deleteComposerBackwardAtom, {});
    expect(store.get(composerStateAtom)).toMatchObject({
      text: 'e\u0301x',
      cursorIndex: 0
    });
  });
});

describe('composer scroll offset preservation', () => {
  it('preserves the scroll offset across text edits and cursor moves', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: 'aaa\nbbb\nccc', cursorIndex: 5, validationError: null });
    const actions = [
      () => store.set(insertComposerTextAtom, { text: 'x' }),
      () => store.set(deleteComposerBackwardAtom, {}),
      () => store.set(moveComposerCursorBackwardAtom),
      () => store.set(moveComposerCursorForwardAtom)
    ];

    for (const action of actions) {
      store.set(composerScrollOffsetRowsAtom, 4);
      action();
      expect(store.get(composerScrollOffsetRowsAtom)).toBe(4);
    }
  });

  it('resets the scroll offset when the composer is cleared', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: 'aaa\nbbb', cursorIndex: 3, validationError: null });
    store.set(composerScrollOffsetRowsAtom, 3);
    store.set(clearComposerAtom);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(0);
  });
});

describe('composer vertical cursor movement', () => {
  it('moves the cursor up and down between visual lines and preserves the offset', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: 'aaa\nbbb\nccc', cursorIndex: 11, validationError: null });
    store.set(composerScrollOffsetRowsAtom, 3);

    store.set(moveComposerCursorUpAtom, { columns: 40 });
    expect(store.get(composerStateAtom).cursorIndex).toBe(7);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(3);

    store.set(moveComposerCursorDownAtom, { columns: 40 });
    expect(store.get(composerStateAtom).cursorIndex).toBe(11);
  });

  it('is a no-op at the first visual line and preserves the offset', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: 'aaa\nbbb', cursorIndex: 1, validationError: null });
    store.set(composerScrollOffsetRowsAtom, 2);

    store.set(moveComposerCursorUpAtom, { columns: 40 });
    expect(store.get(composerStateAtom).cursorIndex).toBe(1); // unchanged
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(2); // preserved
  });

  it('preserves the visual column across grapheme clusters', () => {
    const store = createStore();
    store.set(composerStateAtom, {
      text: '👍🏽a\n👍🏽b',
      cursorIndex: '👍🏽a'.length,
      validationError: null
    });

    store.set(moveComposerCursorDownAtom, { columns: 40 });
    expect(store.get(composerStateAtom).cursorIndex).toBe('👍🏽a\n👍🏽b'.length);
  });
});

describe('composer click-to-position', () => {
  it('sets the clamped cursor index and the given scroll offset (no snap-back)', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: 'hello', cursorIndex: 5, validationError: null });
    store.set(composerScrollOffsetRowsAtom, 2);

    store.set(setComposerCursorWithOffsetAtom, { index: 2, offset: -1 });
    expect(store.get(composerStateAtom).cursorIndex).toBe(2);
    expect(store.get(composerScrollOffsetRowsAtom)).toBe(-1);

    store.set(setComposerCursorWithOffsetAtom, { index: 999, offset: 0 }); // clamps to text length
    expect(store.get(composerStateAtom).cursorIndex).toBe(5);
  });

  it('snaps clicked indices back to grapheme boundaries', () => {
    const store = createStore();
    store.set(composerStateAtom, { text: '👍🏽a', cursorIndex: 0, validationError: null });

    store.set(setComposerCursorWithOffsetAtom, { index: 2, offset: 0 });
    expect(store.get(composerStateAtom).cursorIndex).toBe(0);
  });
});

describe('composer caret refresh tick', () => {
  it('defaults to zero', () => {
    const store = createStore();
    expect(store.get(composerCaretRefreshTickAtom)).toBe(0);
  });
});
