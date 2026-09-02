import { useInput } from 'ink';
import { useStore } from 'jotai';
import { handleCursorMove } from '@components/PromptComposer/input/handleCursorMove.ts';
import { handleCopyLastResponse } from '@components/PromptComposer/input/handleCopyLastResponse.ts';
import { handleEscCancelTurn } from '@components/PromptComposer/input/handleEscCancelTurn.ts';
import { handleEscArmedClear } from '@components/PromptComposer/input/handleEscArmedClear.ts';
import { handleHistoryRecall } from '@components/PromptComposer/input/handleHistoryRecall.ts';
import { handleNewline } from '@components/PromptComposer/input/handleNewline.ts';
import { handlePaste } from '@components/PromptComposer/input/handlePaste.ts';
import { handleSubmit } from '@components/PromptComposer/input/handleSubmit.ts';
import { handleTextEdit } from '@components/PromptComposer/input/handleTextEdit.ts';
import type {
  ComposerInputState,
  ComposerKeyContext,
  ComposerKeyHandler
} from '@components/PromptComposer/input/types.ts';
import { handleMenuKey } from '@components/SlashCommandMenu/handleMenuKey.ts';
import { isModifierOnlyKeyEvent } from '@libs/keyboard/clipboardShortcuts.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import type { CommandActions } from '@libs/commands/executeCommand.ts';
import { armedActionAtom } from '@state/ui/index.ts';

type PromptComposerInputOptions = {
  isActive: boolean;
  maxBytes: number;
  onSubmit: (prompt: string, submissionSequence?: number) => void;
  state: ComposerInputState;
  commandActions: CommandActions;
};

/**
 * Priority-ordered branches of the composer's single `useInput`. The dispatcher
 * runs them in order and stops at the first that reports it handled the key, so
 * the order is behavior: newline (incl. modified Enter) precedes the open menu,
 * which precedes active-turn Esc-cancel, Esc-clear, cursor moves, bare-Enter
 * submit, and text editing.
 * Adding a key is a new handler plus one entry here — not more lines in the hook.
 */
const COMPOSER_KEY_HANDLERS: readonly ComposerKeyHandler[] = [
  handleNewline,
  handleMenuKey,
  handleEscCancelTurn,
  handleEscArmedClear,
  handleHistoryRecall,
  handleCursorMove,
  handlePaste,
  handleCopyLastResponse,
  handleSubmit,
  handleTextEdit
];

/**
 * The composer's only keyboard entry point. It reads the Jotai store once and
 * hands each keypress to the ordered handlers as a {@link ComposerKeyContext};
 * handlers do their own `store.get`/`store.set`. There is intentionally no second
 * `useInput`: Ink delivers every key to every active handler, so one dispatcher
 * prevents double-handling. Ctrl+C is owned by `useGlobalKeys` and ignored here.
 */
export function usePromptComposerInput({
  isActive,
  maxBytes,
  onSubmit,
  state,
  commandActions
}: PromptComposerInputOptions): void {
  const store = useStore();

  useInput(
    (input, key) => {
      if (isMouseInput(input)) {
        return;
      }

      if (isModifierOnlyKeyEvent(input, key)) {
        return;
      }

      // Ctrl+C is owned by the global two-step-exit hook; never handle it here.
      if (key.ctrl === true && input === 'c') {
        return;
      }

      // Any real key other than Esc cancels a pending two-step confirmation.
      if (key.escape !== true) {
        store.set(armedActionAtom, null);
      }

      const context: ComposerKeyContext = {
        input,
        key,
        state,
        maxBytes,
        onSubmit,
        commandActions,
        store
      };

      for (const handle of COMPOSER_KEY_HANDLERS) {
        if (handle(context)) {
          return;
        }
      }
    },
    { isActive }
  );
}
