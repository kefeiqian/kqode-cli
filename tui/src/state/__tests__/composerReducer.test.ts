import { describe, expect, it } from 'vitest';
import {
  composerReducer,
  initialComposerState,
  printableInput,
  validateComposerSubmit
} from '@state/composerReducer.js';

describe('composerReducer', () => {
  it('appends printable text and deletes the last character', () => {
    const typed = composerReducer(initialComposerState, { type: 'insert', text: 'abc' });
    const deleted = composerReducer(typed, { type: 'deleteBackward' });

    expect(deleted.text).toBe('ab');
    expect(deleted.cursorIndex).toBe(2);
  });

  it('moves the cursor left and right for middle insertion and deletion', () => {
    const typed = composerReducer(initialComposerState, { type: 'insert', text: 'abc' });
    const movedLeft = composerReducer(typed, { type: 'moveCursorBackward' });
    const inserted = composerReducer(movedLeft, { type: 'insert', text: 'X' });
    const deleted = composerReducer(inserted, { type: 'deleteBackward' });
    const movedRight = composerReducer(inserted, { type: 'moveCursorForward' });
    const insertedAfterMoveRight = composerReducer(movedRight, { type: 'insert', text: 'Y' });

    expect(inserted.text).toBe('abXc');
    expect(inserted.cursorIndex).toBe(3);
    expect(deleted.text).toBe('abc');
    expect(deleted.cursorIndex).toBe(2);
    expect(insertedAfterMoveRight.text).toBe('abXcY');
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
