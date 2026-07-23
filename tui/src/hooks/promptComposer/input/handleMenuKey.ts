import type { ComposerKeyHandler } from '@hooks/promptComposer/input/types.ts';
import { appendUnknownCommandAtom } from '@state/promptQueue/index.ts';
import { executeCommand } from '@libs/commands/executeCommand.ts';
import {
  commandMenuDismissedAtom,
  commandMenuOpenAtom,
  highlightedCommandAtom,
  moveCommandHighlightAtom
} from '@state/ui/commands/index.ts';
import { clearComposerAtom, insertComposerTextAtom } from '@state/ui/composer/index.ts';

/**
 * Keyboard behavior for the slash-command menu, colocated with its rendering.
 * Only acts while the menu is open; ↑/↓ move the highlight, Tab completes the
 * highlighted name into the composer, Esc dismisses (keeping the text), and Enter
 * runs the highlighted command or posts an unknown-command entry, then clears.
 *
 * Returns `false` for any other key (e.g. ←/→) so the composer's dispatcher can
 * keep handling it — the menu is an overlay on the composer, not a separate focus.
 */
export const handleMenuKey: ComposerKeyHandler = (context) => {
  const { key, state, maxBytes, commandActions, store } = context;

  if (!store.get(commandMenuOpenAtom)) {
    return false;
  }

  const highlightedCommand = store.get(highlightedCommandAtom);

  if (key.upArrow) {
    store.set(moveCommandHighlightAtom, -1);
    return true;
  }

  if (key.downArrow) {
    store.set(moveCommandHighlightAtom, 1);
    return true;
  }

  if (key.tab) {
    if (highlightedCommand !== undefined) {
      store.set(clearComposerAtom);
      store.set(insertComposerTextAtom, { maxBytes, text: highlightedCommand.name });
    }
    return true;
  }

  if (key.escape) {
    store.set(commandMenuDismissedAtom, true);
    return true;
  }

  if (key.return) {
    if (highlightedCommand !== undefined) {
      executeCommand(highlightedCommand.id, commandActions);
    } else {
      store.set(appendUnknownCommandAtom, state.text);
    }
    store.set(clearComposerAtom);
    return true;
  }

  return false;
};
