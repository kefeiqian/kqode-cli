import { printableInput } from '@libs/composer/promptText.ts';

const BRACKETED_PASTE_START = '\u001B[200~';
const BRACKETED_PASTE_END = '\u001B[201~';

type MaskedInputTextState = {
  value: string;
  cursorIndex: number;
};

/**
 * Returns printable text from a raw Ink input event, including bracketed paste
 * payloads with their terminal delimiters removed.
 */
export function printableMaskedInput(input: string): string {
  return printableInput(stripBracketedPaste(input));
}

/**
 * Inserts printable text at the current cursor without echoing it to the UI.
 */
export function insertMaskedText(
  state: MaskedInputTextState,
  input: string
): MaskedInputTextState {
  const text = printableMaskedInput(input);
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
export function deleteMaskedCodePointBackward(state: MaskedInputTextState): MaskedInputTextState {
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

/** Moves the masked input cursor by one code point. */
export function moveMaskedCursor(
  state: MaskedInputTextState,
  direction: 'backward' | 'forward'
): MaskedInputTextState {
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
