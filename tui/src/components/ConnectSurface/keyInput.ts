import type { Key } from 'ink';
import {
  deleteCodePointBackward,
  insertText,
  moveCursor
} from '@libs/textField/singleLineText.ts';
import type { SingleLineTextState } from '@libs/textField/singleLineText.ts';

const SHIFT_TAB_INPUT = '\u001B[Z';

/** True when the event is an Enter/Return key press. */
export function isReturn(input: string, key: Key): boolean {
  return key.return || input === '\r' || input === '\n';
}

/** True when the event is Shift+Tab, across the encodings Ink may report. */
export function isShiftTab(input: string, key: Key): boolean {
  const extendedKey = key as Key & { shift?: boolean; shiftTab?: boolean };
  return input === SHIFT_TAB_INPUT || extendedKey.shiftTab === true || (key.tab && extendedKey.shift === true);
}

/**
 * Applies one Ink key event to a single-line field: `←`/`→` move the caret,
 * backspace/delete removes the code point before it, and printable text is
 * inserted at the caret. Mirrors the masked key field so both editors behave
 * identically.
 */
export function editField(
  input: string,
  key: Key,
  state: SingleLineTextState,
  setValue: (value: string) => void,
  setCursor: (cursorIndex: number) => void
): void {
  if (key.leftArrow || key.rightArrow) {
    const next = moveCursor(state, key.leftArrow ? 'backward' : 'forward');
    if (next.cursorIndex !== state.cursorIndex) {
      setCursor(next.cursorIndex);
    }
    return;
  }
  if (key.backspace || key.delete) {
    const next = deleteCodePointBackward(state);
    setValue(next.value);
    setCursor(next.cursorIndex);
    return;
  }
  const next = insertText(state, input);
  if (next !== state) {
    setValue(next.value);
    setCursor(next.cursorIndex);
  }
}
