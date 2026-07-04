import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import {
  moveComposerCursorBackwardAtom,
  moveComposerCursorForwardAtom
} from '@state/ui/composer/index.ts';

/** Left/Right arrows move the composer cursor by one code point. */
export const handleCursorMove: ComposerKeyHandler = (context) => {
  const { key, store } = context;

  if (key.leftArrow) {
    store.set(moveComposerCursorBackwardAtom);
    return true;
  }

  if (key.rightArrow) {
    store.set(moveComposerCursorForwardAtom);
    return true;
  }

  return false;
};
