import { MODIFIED_ENTER_INPUTS } from '@constants/ui.ts';
import type { ComposerKeyContext, ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { deleteComposerBackwardAtom, insertComposerTextAtom } from '@state/ui/composer/index.ts';

type PromptNewlineInput = 'insert-newline' | 'replace-backslash';

/**
 * Inserts a literal newline instead of submitting for modified Enter
 * (`MODIFIED_ENTER_INPUTS`, or Shift/Ctrl/Meta + Enter) and for the trailing-`\`
 * + bare Enter fallback, which first deletes the `\`. Runs before the menu and
 * submit branches so a multiline edit works even while a command is being typed.
 */
export const handleNewline: ComposerKeyHandler = (context) => {
  const kind = classifyNewlineInput(context);
  if (kind === null) {
    return false;
  }

  const { store, maxBytes } = context;
  if (kind === 'replace-backslash') {
    store.set(deleteComposerBackwardAtom, { maxBytes });
  }
  store.set(insertComposerTextAtom, { maxBytes, text: '\n' });
  return true;
};

function classifyNewlineInput({ input, key, state }: ComposerKeyContext): PromptNewlineInput | null {
  if (MODIFIED_ENTER_INPUTS.includes(input)) {
    return 'insert-newline';
  }

  if (key.return !== true) {
    return null;
  }

  if (key.shift === true || key.ctrl === true || key.meta === true) {
    return 'insert-newline';
  }

  return state.cursorIndex > 0 && state.text.at(state.cursorIndex - 1) === '\\'
    ? 'replace-backslash'
    : null;
}
