import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { PROMPT_PREFIX } from '@constants/ui.ts';
import { resolveVerticalCursorIndex } from '@libs/composer/composerWindow.ts';
import { overLimitMessage } from '@libs/composer/promptText.ts';
import { columnsAtom } from '@state/ui/index.ts';
import { commandMenuDismissedAtom, commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import {
  composerScrollOffsetRowsAtom,
  composerStateAtom,
  recallNextComposerSubmitAtom,
  recallPreviousComposerSubmitAtom
} from '@state/ui/composer/index.ts';

/**
 * Recalls submitted composer history only at the vertical movement boundary.
 */
export const handleHistoryRecall: ComposerKeyHandler = (context) => {
  const { key, maxBytes, store } = context;
  if (!key.upArrow && !key.downArrow) {
    return false;
  }

  if (store.get(commandMenuOpenAtom)) {
    return false;
  }

  const direction = key.upArrow ? 'up' : 'down';
  const columns = Math.max(1, store.get(columnsAtom) - PROMPT_PREFIX.length);
  const state = store.get(composerStateAtom);
  const target = resolveVerticalCursorIndex(state.text, columns, state.cursorIndex, direction);
  if (target !== null) {
    return false;
  }

  const recalledText = key.upArrow
    ? store.set(recallPreviousComposerSubmitAtom, state.text)
    : store.set(recallNextComposerSubmitAtom);
  if (recalledText !== null) {
    store.set(composerScrollOffsetRowsAtom, 0);
    store.set(composerStateAtom, {
      text: recalledText,
      cursorIndex: recalledText.length,
      validationError: overLimitMessage(recalledText, maxBytes)
    });
    store.set(commandMenuDismissedAtom, true);
  }
  return true;
};
