import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { commandMenuDismissedAtom, resetCommandHighlightAtom } from '@state/ui/commands/index.ts';
import { printableInput } from '@libs/composer/promptText.ts';
import {
  deleteComposerBackwardAtom,
  insertComposerTextAtom
} from '@state/ui/composer/index.ts';

/**
 * Lowest-priority text editing: Backspace/Delete removes a code point, Tab is a
 * consumed no-op (it never inserts a literal tab), and printable input is
 * inserted. Editing the text re-opens/re-filters the menu by clearing the Esc
 * dismissal and resetting the highlight. Unhandled keys fall through as a no-op.
 */
export const handleTextEdit: ComposerKeyHandler = (context) => {
  const { input, key, maxBytes, store } = context;

  if (key.backspace || key.delete) {
    store.set(deleteComposerBackwardAtom, { maxBytes });
    store.set(resetCommandHighlightAtom);
    store.set(commandMenuDismissedAtom, false);
    return true;
  }

  if (key.tab) {
    return true;
  }

  const printable = printableInput(input);
  if (printable.length > 0) {
    store.set(insertComposerTextAtom, { maxBytes, text: printable });
    store.set(resetCommandHighlightAtom);
    store.set(commandMenuDismissedAtom, false);
    return true;
  }

  return false;
};
