import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  composerStateAtom,
  deleteComposerBackwardAtom,
  insertComposerTextAtom,
  moveComposerCursorBackwardAtom,
  moveComposerCursorForwardAtom,
  printableInput,
  validateComposerSubmit
} from '@state/composerAtoms.js';

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

  it('keeps slash, mention, and help affordance characters printable', () => {
    expect(printableInput('/@?')).toBe('/@?');
  });

  it('strips control characters from pasted input while retaining printable text', () => {
    expect(printableInput('hello\nworld\t!')).toBe('helloworld!');
  });

  it('blocks empty and all-whitespace submit values', () => {
    expect(validateComposerSubmit('')).toEqual({ ok: false, reason: 'empty', message: '' });
    expect(validateComposerSubmit('   ')).toEqual({ ok: false, reason: 'empty', message: '' });
  });

  it('preserves the exact non-empty submit snapshot', () => {
    expect(validateComposerSubmit('  hello  ')).toEqual({ ok: true, text: '  hello  ' });
  });

  it('reports over-limit prompts before backend submission', () => {
    expect(validateComposerSubmit('hello', 4)).toEqual({
      ok: false,
      reason: 'over-limit',
      message: 'Prompt is 5 bytes; maximum is 4 bytes.'
    });
  });
});
