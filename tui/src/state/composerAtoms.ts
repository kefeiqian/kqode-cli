import { atom } from 'jotai';

export const PROMPT_MAX_BYTES = 64 * 1024;

export type ComposerState = {
  text: string;
  cursorIndex: number;
  validationError: string | null;
};

type SubmitValidation =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'over-limit'; message: string };

type InsertTextOptions = {
  maxBytes?: number;
  text: string;
};

type OptionalMaxBytes = {
  maxBytes?: number;
};

export const initialComposerState: ComposerState = {
  text: '',
  cursorIndex: 0,
  validationError: null
};

export const composerStateAtom = atom<ComposerState>(initialComposerState);

export const insertComposerTextAtom = atom(
  null,
  (_get, set, { maxBytes = PROMPT_MAX_BYTES, text: insertedText }: InsertTextOptions) => {
    if (insertedText.length === 0) {
      return;
    }

    set(composerStateAtom, (state) => {
      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      const text = state.text.slice(0, cursorIndex) + insertedText + state.text.slice(cursorIndex);

      return {
        text,
        cursorIndex: cursorIndex + insertedText.length,
        validationError: overLimitMessage(text, maxBytes)
      };
    });
  }
);

export const deleteComposerBackwardAtom = atom(
  null,
  (_get, set, { maxBytes = PROMPT_MAX_BYTES }: OptionalMaxBytes = {}) => {
    set(composerStateAtom, (state) => {
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
        validationError: overLimitMessage(text, maxBytes)
      };
    });
  }
);

export const moveComposerCursorBackwardAtom = atom(null, (_get, set) => {
  set(composerStateAtom, (state) => {
    const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
    if (cursorIndex === 0) {
      return state;
    }

    return {
      ...state,
      cursorIndex: previousCodePointStart(state.text, cursorIndex)
    };
  });
});

export const moveComposerCursorForwardAtom = atom(null, (_get, set) => {
  set(composerStateAtom, (state) => {
    const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
    if (cursorIndex >= state.text.length) {
      return state;
    }

    return {
      ...state,
      cursorIndex: nextCodePointEnd(state.text, cursorIndex)
    };
  });
});

export const clearComposerAtom = atom(null, (_get, set) => {
  set(composerStateAtom, (state) => {
    if (state.text.length === 0 && state.validationError === null) {
      return state;
    }

    return initialComposerState;
  });
});

export const setComposerValidationErrorAtom = atom(null, (_get, set, message: string | null) => {
  set(composerStateAtom, (state) => {
    if (state.validationError === message) {
      return state;
    }

    return {
      ...state,
      validationError: message
    };
  });
});

const textEncoder = new TextEncoder();

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
