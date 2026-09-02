import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { appendUnknownCommandNoticeAtom } from '@state/promptQueue/index.ts';
import { executeMenuSelection } from '@libs/commands/executeCommand.ts';
import { entryFullName } from '@libs/commands/subcommands.ts';
import { validateComposerSubmit } from '@libs/composer/promptText.ts';
import { captureComposerSubmit, SubmitCaptureKind } from '@libs/composer/submitCapture.ts';
import {
  commandMenuDismissedAtom,
  commandMenuOpenAtom,
  highlightedEntryAtom,
  moveCommandHighlightAtom
} from '@state/ui/commands/index.ts';
import {
  clearComposerAtom,
  insertComposerTextAtom,
  setComposerValidationErrorAtom
} from '@state/ui/composer/index.ts';

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

  const highlightedEntry = store.get(highlightedEntryAtom);

  if (key.upArrow) {
    store.set(moveCommandHighlightAtom, -1);
    return true;
  }

  if (key.downArrow) {
    store.set(moveCommandHighlightAtom, 1);
    return true;
  }

  if (key.tab) {
    if (highlightedEntry !== undefined) {
      const fullName = entryFullName(highlightedEntry);
      if (state.text.trim() === fullName) {
        return true;
      }
      store.set(clearComposerAtom);
      store.set(insertComposerTextAtom, { maxBytes, text: fullName });
    }
    return true;
  }

  if (key.escape) {
    store.set(commandMenuDismissedAtom, true);
    return true;
  }

  if (key.return) {
    const validation = validateComposerSubmit(state.text, maxBytes);
    if (!validation.ok) {
      if (validation.reason === 'over-limit') {
        store.set(setComposerValidationErrorAtom, validation.message);
      }
      return true;
    }

    if (highlightedEntry !== undefined) {
      captureComposerSubmit({ kind: SubmitCaptureKind.MenuCommand, text: entryFullName(highlightedEntry) });
      executeMenuSelection(highlightedEntry, commandActions);
    } else {
      const captured = captureComposerSubmit({
        kind: SubmitCaptureKind.UnknownCommand,
        text: validation.text
      });
      store.set(appendUnknownCommandNoticeAtom, {
        text: validation.text,
        submissionSequence: captured.sequence
      });
    }
    store.set(clearComposerAtom);
    return true;
  }

  return false;
};
