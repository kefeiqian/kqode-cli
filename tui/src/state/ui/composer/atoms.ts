import { atom } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { overLimitMessage, PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { resolveVerticalCursorIndex } from '@libs/composer/composerWindow.ts';
import {
  clampToGraphemeBoundary,
  nextGraphemeEnd,
  previousGraphemeStart
} from '@libs/text/displayWidth.ts';

export type ComposerState = {
  text: string;
  cursorIndex: number;
  validationError: string | null;
};

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

/**
 * Signed rows the composer view is scrolled away from its cursor-follow baseline
 * (+ up / - down). Text/cursor mutations below do NOT reset it; the composer
 * dispatches `scrollComposerCursorIntoViewAtom` on cursor changes to keep the
 * caret visible with minimal scrolling, so typing after a click preserves the
 * current view instead of snapping to the bottom. `clearComposerAtom` resets it
 * since the text (and any scroll) is gone.
 */
export const composerScrollOffsetRowsAtom = atom(0);

/**
 * True while the user is actively scrolling (wheel / page keys). The composer
 * hides its caret while this holds and re-shows it once scrolling settles, so
 * the terminal cursor's blink is not reset on every scrolled frame. Driven by
 * `useCaretScrollSuppression`.
 */
export const caretSuppressedWhileScrollingAtom = atom(false);

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

      const previousCursorIndex = previousGraphemeStart(state.text, cursorIndex);
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
      cursorIndex: previousGraphemeStart(state.text, cursorIndex)
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
      cursorIndex: nextGraphemeEnd(state.text, cursorIndex)
    };
  });
});

export const moveComposerCursorUpAtom = atom(null, (_get, set, { columns }: { columns: number }) => {
  set(composerStateAtom, (state) => {
    const target = resolveVerticalCursorIndex(state.text, columns, state.cursorIndex, 'up');
    return target === null ? state : { ...state, cursorIndex: target };
  });
});

export const moveComposerCursorDownAtom = atom(null, (_get, set, { columns }: { columns: number }) => {
  set(composerStateAtom, (state) => {
    const target = resolveVerticalCursorIndex(state.text, columns, state.cursorIndex, 'down');
    return target === null ? state : { ...state, cursorIndex: target };
  });
});

/**
 * Places the caret at `index` while setting the scroll `offset` explicitly. The
 * click path passes the offset that keeps the visible window fixed (see
 * `resolveClickResult`), so clicking to reposition the caret does not scroll the
 * composer.
 */
export const setComposerCursorWithOffsetAtom = atom(
  null,
  (_get, set, { index, offset }: { index: number; offset: number }) => {
    set(composerScrollOffsetRowsAtom, offset);
    set(composerStateAtom, (state) => ({
      ...state,
      cursorIndex: clampCursorIndex(state.text, index)
    }));
  }
);

export const clearComposerAtom = atom(null, (_get, set) => {
  set(composerScrollOffsetRowsAtom, 0);
  set(composerStateAtom, (state) => {
    if (state.text.length === 0 && state.validationError === null) {
      return state;
    }

    return initialComposerState;
  });
});

// Intentionally does NOT reset composerScrollOffsetRowsAtom: its only caller
// re-sets an already-set over-limit message (a guarded no-op). A future caller
// that sets/clears the error from a non-insert path while scrolled should reset.
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

function clampCursorIndex(text: string, cursorIndex: number): number {
  return clampToGraphemeBoundary(text, clamp(cursorIndex, 0, text.length));
}
