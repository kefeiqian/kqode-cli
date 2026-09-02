import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { composerInputColumnsAtom } from '@state/ui/index.ts';
import {
  moveComposerCursorBackwardAtom,
  moveComposerCursorDownAtom,
  moveComposerCursorForwardAtom,
  moveComposerCursorUpAtom
} from '@state/ui/composer/index.ts';

/**
 * Left/Right move the composer cursor by one grapheme cluster; Up/Down move
 * between visual (wrapped) lines. The slash menu's Up/Down is handled earlier
 * in the dispatcher (handleMenuKey), so these only fire when the menu is
 * closed.
 */
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

  if (key.upArrow || key.downArrow) {
    const columns = store.get(composerInputColumnsAtom);
    store.set(key.upArrow ? moveComposerCursorUpAtom : moveComposerCursorDownAtom, { columns });
    return true;
  }

  return false;
};
