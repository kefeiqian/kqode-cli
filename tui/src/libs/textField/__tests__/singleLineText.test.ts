import { describe, expect, it } from 'vitest';
import {
  deleteCodePointBackward,
  insertText,
  moveCursor,
  printableFieldInput
} from '@libs/textField/singleLineText.ts';

describe('insertText', () => {
  it('inserts printable text at the caret and advances past it', () => {
    expect(insertText({ value: 'ab', cursorIndex: 1 }, 'X')).toEqual({
      value: 'aXb',
      cursorIndex: 2
    });
  });

  it('strips bracketed-paste delimiters from pasted input', () => {
    expect(insertText({ value: '', cursorIndex: 0 }, '\u001B[200~https://x/v1\u001B[201~')).toEqual({
      value: 'https://x/v1',
      cursorIndex: 12
    });
  });

  it('ignores non-printable key sequences', () => {
    const state = { value: 'ab', cursorIndex: 2 };
    expect(insertText(state, '\u001B[D')).toBe(state);
  });
});

describe('deleteCodePointBackward', () => {
  it('removes one Unicode code point before the caret', () => {
    expect(deleteCodePointBackward({ value: 'a😀b', cursorIndex: 3 })).toEqual({
      value: 'ab',
      cursorIndex: 1
    });
  });

  it('is a no-op at the start of the value', () => {
    const state = { value: 'ab', cursorIndex: 0 };
    expect(deleteCodePointBackward(state)).toBe(state);
  });
});

describe('moveCursor', () => {
  it('moves across a surrogate pair as one step', () => {
    expect(moveCursor({ value: 'a😀b', cursorIndex: 3 }, 'backward')).toEqual({
      value: 'a😀b',
      cursorIndex: 1
    });
  });

  it('clamps at the value boundaries', () => {
    const atEnd = { value: 'ab', cursorIndex: 2 };
    expect(moveCursor(atEnd, 'forward')).toBe(atEnd);
    const atStart = { value: 'ab', cursorIndex: 0 };
    expect(moveCursor(atStart, 'backward')).toBe(atStart);
  });
});

describe('printableFieldInput', () => {
  it('drops arrow-key escape sequences', () => {
    expect(printableFieldInput('\u001B[C')).toBe('');
  });
});
