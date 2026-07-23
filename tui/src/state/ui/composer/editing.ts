import { atom } from 'jotai';
import { INITIAL_COMPOSER_STATE } from '@constants/composer.ts';
import { clampComposerCursorIndex } from '@libs/composer/cursorIndex.ts';
import { overLimitMessage, PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import {
  clampToGraphemeBoundary,
  nextGraphemeEnd,
  previousGraphemeStart
} from '@libs/text/displayWidth.ts';
import { composerScrollOffsetRowsAtom } from '@state/ui/composer/scroll.ts';
import { composerStateAtom } from '@state/ui/composer/state.ts';

type InsertTextOptions = {
  maxBytes?: number;
  text: string;
};

type OptionalMaxBytes = {
  maxBytes?: number;
};

export const insertComposerTextAtom = atom(
  null,
  (_get, set, { maxBytes = PROMPT_MAX_BYTES, text: insertedText }: InsertTextOptions) => {
    if (insertedText.length === 0) return;

    set(composerStateAtom, (state) => {
      const cursorIndex = clampComposerCursorIndex(state.text, state.cursorIndex);
      const text = state.text.slice(0, cursorIndex) + insertedText + state.text.slice(cursorIndex);
      const insertedEnd = cursorIndex + insertedText.length;
      const nextCursorIndex =
        clampToGraphemeBoundary(text, insertedEnd) === insertedEnd
          ? insertedEnd
          : nextGraphemeEnd(text, insertedEnd);

      return {
        text,
        cursorIndex: nextCursorIndex,
        validationError: overLimitMessage(text, maxBytes)
      };
    });
  }
);

export const deleteComposerBackwardAtom = atom(
  null,
  (_get, set, { maxBytes = PROMPT_MAX_BYTES }: OptionalMaxBytes = {}) => {
    set(composerStateAtom, (state) => {
      const cursorIndex = clampComposerCursorIndex(state.text, state.cursorIndex);
      if (cursorIndex === 0) return state;

      const previousCursorIndex = previousGraphemeStart(state.text, cursorIndex);
      const text = state.text.slice(0, previousCursorIndex) + state.text.slice(cursorIndex);
      if (text === state.text) return state;

      return {
        text,
        cursorIndex: previousCursorIndex,
        validationError: overLimitMessage(text, maxBytes)
      };
    });
  }
);

export const clearComposerAtom = atom(null, (_get, set) => {
  set(composerScrollOffsetRowsAtom, 0);
  set(composerStateAtom, (state) =>
    state.text.length === 0 && state.validationError === null
      ? state
      : { ...INITIAL_COMPOSER_STATE }
  );
});

// Intentionally does not reset the scroll offset: its current caller re-sets an
// already-set over-limit message. A future independent caller should reconsider.
export const setComposerValidationErrorAtom = atom(null, (_get, set, message: string | null) => {
  set(composerStateAtom, (state) =>
    state.validationError === message ? state : { ...state, validationError: message }
  );
});
