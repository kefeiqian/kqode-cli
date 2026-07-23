import { atom } from 'jotai';
import { clampComposerCursorIndex } from '@libs/composer/cursorIndex.ts';
import { resolveVerticalCursorIndex } from '@libs/composer/composerWindow.ts';
import { nextGraphemeEnd, previousGraphemeStart } from '@libs/text/displayWidth.ts';
import { composerScrollOffsetRowsAtom } from '@state/ui/composer/scroll.ts';
import { composerStateAtom } from '@state/ui/composer/state.ts';

export const moveComposerCursorBackwardAtom = atom(null, (_get, set) => {
  set(composerStateAtom, (state) => {
    const cursorIndex = clampComposerCursorIndex(state.text, state.cursorIndex);
    return cursorIndex === 0
      ? state
      : { ...state, cursorIndex: previousGraphemeStart(state.text, cursorIndex) };
  });
});

export const moveComposerCursorForwardAtom = atom(null, (_get, set) => {
  set(composerStateAtom, (state) => {
    const cursorIndex = clampComposerCursorIndex(state.text, state.cursorIndex);
    return cursorIndex >= state.text.length
      ? state
      : { ...state, cursorIndex: nextGraphemeEnd(state.text, cursorIndex) };
  });
});

export const moveComposerCursorUpAtom = atom(null, (_get, set, { columns }: { columns: number }) => {
  set(composerStateAtom, (state) => {
    const target = resolveVerticalCursorIndex(state.text, columns, state.cursorIndex, 'up');
    return target === null ? state : { ...state, cursorIndex: target };
  });
});

export const moveComposerCursorDownAtom = atom(
  null,
  (_get, set, { columns }: { columns: number }) => {
    set(composerStateAtom, (state) => {
      const target = resolveVerticalCursorIndex(state.text, columns, state.cursorIndex, 'down');
      return target === null ? state : { ...state, cursorIndex: target };
    });
  }
);

/** Places the caret while explicitly preserving the caller-resolved window. */
export const setComposerCursorWithOffsetAtom = atom(
  null,
  (_get, set, { index, offset }: { index: number; offset: number }) => {
    set(composerScrollOffsetRowsAtom, offset);
    set(composerStateAtom, (state) => ({
      ...state,
      cursorIndex: clampComposerCursorIndex(state.text, index)
    }));
  }
);
