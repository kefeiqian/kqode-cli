import type { ComposerKeyContext, ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { appendUnknownCommandNoticeAtom } from '@state/promptQueue/index.ts';
import { executeMenuSelection } from '@libs/commands/executeCommand.ts';
import { exactCommandMatch } from '@libs/commands/matchCommand.ts';
import { entryFullName } from '@libs/commands/subcommands.ts';
import { captureComposerSubmit, SubmitCaptureKind } from '@libs/composer/submitCapture.ts';
import { validateComposerSubmit } from '@libs/composer/promptText.ts';
import {
  clearComposerAtom,
  setComposerValidationErrorAtom
} from '@state/ui/composer/index.ts';

/**
 * Bare Enter with the menu closed. Reached only after the newline and menu
 * branches decline, so a modified Enter or an open-menu Enter never lands here.
 */
export const handleSubmit: ComposerKeyHandler = (context) => {
  if (context.key.return !== true) {
    return false;
  }

  submitPrompt(context);
  return true;
};

/**
 * Validates the composer text, then either surfaces an over-limit error, runs an
 * exactly matched slash command (a prefix is not enough here — the menu's Enter
 * handles highlighted prefixes), posts an unknown command, or submits the prompt.
 */
function submitPrompt({ state, maxBytes, onSubmit, commandActions, store }: ComposerKeyContext): void {
  const validation = validateComposerSubmit(state.text, maxBytes);
  if (!validation.ok) {
    if (validation.reason === 'over-limit') {
      store.set(setComposerValidationErrorAtom, validation.message);
    }
    return;
  }

  if (validation.text.startsWith('/')) {
    const entry = exactCommandMatch(validation.text);
    if (entry !== undefined) {
      captureComposerSubmit({ kind: SubmitCaptureKind.ValidCommand, text: entryFullName(entry) });
      executeMenuSelection(entry, commandActions);
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
    return;
  }

  const captured = captureComposerSubmit({ kind: SubmitCaptureKind.Prompt, text: validation.text });
  onSubmit(validation.text, captured.sequence);
  store.set(clearComposerAtom);
}
