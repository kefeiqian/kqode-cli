export const PROMPT_MAX_BYTES = 64 * 1024;

type ComposerState = {
  text: string;
  cursorIndex: number;
  validationError: string | null;
};

type ComposerAction =
  | { type: 'insert'; text: string; maxBytes?: number }
  | { type: 'deleteBackward'; maxBytes?: number }
  | { type: 'moveCursorBackward' }
  | { type: 'moveCursorForward' }
  | { type: 'clear' }
  | { type: 'setValidationError'; message: string | null };

export const initialComposerState: ComposerState = {
  text: '',
  cursorIndex: 0,
  validationError: null
};

const textEncoder = new TextEncoder();

type SubmitValidation =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'over-limit'; message: string };

export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case 'insert': {
      if (action.text.length === 0) {
        return state;
      }

      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      const text =
        state.text.slice(0, cursorIndex) + action.text + state.text.slice(cursorIndex);

      return {
        text,
        cursorIndex: cursorIndex + action.text.length,
        validationError: overLimitMessage(text, action.maxBytes ?? PROMPT_MAX_BYTES)
      };
    }
    case 'deleteBackward': {
      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      if (cursorIndex === 0) {
        return state;
      }

      const previousCursorIndex = previousCodePointStart(state.text, cursorIndex);
      const text = state.text.slice(0, previousCursorIndex) + state.text.slice(cursorIndex);
      if (text === state.text) {
        return state;
      }

      return {
        text,
        cursorIndex: previousCursorIndex,
        validationError: overLimitMessage(text, action.maxBytes ?? PROMPT_MAX_BYTES)
      };
    }
    case 'moveCursorBackward': {
      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      if (cursorIndex === 0) {
        return state;
      }

      return {
        ...state,
        cursorIndex: previousCodePointStart(state.text, cursorIndex)
      };
    }
    case 'moveCursorForward': {
      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      if (cursorIndex >= state.text.length) {
        return state;
      }

      return {
        ...state,
        cursorIndex: nextCodePointEnd(state.text, cursorIndex)
      };
    }
    case 'clear':
      if (state.text.length === 0 && state.validationError === null) {
        return state;
      }

      return initialComposerState;
    case 'setValidationError':
      if (state.validationError === action.message) {
        return state;
      }

      return {
        ...state,
        validationError: action.message
      };
  }
}

export function printableInput(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, '');
}

export function validateComposerSubmit(
  text: string,
  maxBytes = PROMPT_MAX_BYTES
): SubmitValidation {
  if (text.trim().length === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: ''
    };
  }

  const byteLength = textEncoder.encode(text).length;
  const limitMessage = overLimitMessage(text, maxBytes);
  if (limitMessage !== null) {
    return {
      ok: false,
      reason: 'over-limit',
      message: limitMessage
    };
  }

  return {
    ok: true,
    text
  };
}

function clampCursorIndex(text: string, cursorIndex: number): number {
  return Math.max(0, Math.min(cursorIndex, text.length));
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

function overLimitMessage(text: string, maxBytes: number): string | null {
  const byteLength = textEncoder.encode(text).length;
  if (byteLength <= maxBytes) {
    return null;
  }

  return `Prompt is ${byteLength} bytes; maximum is ${maxBytes} bytes.`;
}
