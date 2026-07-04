import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  composerStateAtom,
  deleteComposerBackwardAtom,
  insertComposerTextAtom,
  moveComposerCursorBackwardAtom,
  moveComposerCursorForwardAtom
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
});
