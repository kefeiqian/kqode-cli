import { printableInput } from '@libs/composer/promptText.ts';

const BRACKETED_PASTE_START = '\u001B[200~';
const BRACKETED_PASTE_END = '\u001B[201~';

/** Editable value plus caret position (UTF-16 code-unit index) for one line. */
export type SingleLineTextState = {
  value: string;
  cursorIndex: number;
};

/**
 * Returns printable text from a raw Ink input event, including bracketed paste
 * payloads with their terminal delimiters removed. Shared by masked key entry
 * and plain provider fields so pasted URLs never keep their paste markers.
 */
export function printableFieldInput(input: string): string {
  return printableInput(stripBracketedPaste(input));
}

/** Inserts printable text at the current cursor, advancing the caret past it. */
export function insertText(state: SingleLineTextState, input: string): SingleLineTextState {
  const text = printableFieldInput(input);
  if (text.length === 0) {
    return state;
  }

  const cursorIndex = clampCursorIndex(state.value, state.cursorIndex);
  return {
    value: state.value.slice(0, cursorIndex) + text + state.value.slice(cursorIndex),
    cursorIndex: cursorIndex + text.length
  };
}

/** Deletes exactly one Unicode code point before the cursor. */
export function deleteCodePointBackward(state: SingleLineTextState): SingleLineTextState {
  const cursorIndex = clampCursorIndex(state.value, state.cursorIndex);
  if (cursorIndex === 0) {
    return state;
  }

  const previousCursorIndex = previousCodePointStart(state.value, cursorIndex);
  return {
    value: state.value.slice(0, previousCursorIndex) + state.value.slice(cursorIndex),
    cursorIndex: previousCursorIndex
  };
}

/** Moves the caret by one code point without changing the value. */
export function moveCursor(
  state: SingleLineTextState,
  direction: 'backward' | 'forward'
): SingleLineTextState {
  const cursorIndex = clampCursorIndex(state.value, state.cursorIndex);
  const nextIndex =
    direction === 'backward'
      ? previousCodePointStart(state.value, cursorIndex)
      : nextCodePointEnd(state.value, cursorIndex);

  return nextIndex === cursorIndex ? state : { ...state, cursorIndex: nextIndex };
}

function stripBracketedPaste(input: string): string {
  return input.replaceAll(BRACKETED_PASTE_START, '').replaceAll(BRACKETED_PASTE_END, '');
}

function clampCursorIndex(text: string, cursorIndex: number): number {
  return Math.max(0, Math.min(text.length, cursorIndex));
}

function previousCodePointStart(text: string, cursorIndex: number): number {
  const previousIndex = cursorIndex - 1;
  const previousCodeUnit = text.charCodeAt(previousIndex);
  const offset = previousCodeUnit >= 0xdc00 && previousCodeUnit <= 0xdfff ? 2 : 1;
  return Math.max(0, cursorIndex - offset);
}

function nextCodePointEnd(text: string, cursorIndex: number): number {
  const currentCodeUnit = text.charCodeAt(cursorIndex);
  const offset = currentCodeUnit >= 0xd800 && currentCodeUnit <= 0xdbff ? 2 : 1;
  return Math.min(text.length, cursorIndex + offset);
}
