import { useInput } from 'ink';
import { useSetAtom } from 'jotai';
import { MODIFIED_ENTER_INPUTS } from '@components/PromptComposer/constants.js';
import { isMouseInput } from '@libs/terminal/mouse.js';
import {
  clearComposerAtom,
  deleteComposerBackwardAtom,
  insertComposerTextAtom,
  moveComposerCursorBackwardAtom,
  moveComposerCursorForwardAtom,
  printableInput,
  setComposerValidationErrorAtom,
  validateComposerSubmit
} from '@state/composerAtoms.js';

type PromptComposerInputState = {
  cursorIndex: number;
  text: string;
};

type PromptComposerInputOptions = {
  isActive: boolean;
  maxBytes: number;
  onSubmit: (prompt: string) => void;
  state: PromptComposerInputState;
};

type EnterKey = {
  return?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
};

type PromptNewlineInput = 'insert-newline' | 'replace-backslash';

export function usePromptComposerInput({
  isActive,
  maxBytes,
  onSubmit,
  state
}: PromptComposerInputOptions): void {
  const clearComposer = useSetAtom(clearComposerAtom);
  const deleteComposerBackward = useSetAtom(deleteComposerBackwardAtom);
  const insertComposerText = useSetAtom(insertComposerTextAtom);
  const moveComposerCursorBackward = useSetAtom(moveComposerCursorBackwardAtom);
  const moveComposerCursorForward = useSetAtom(moveComposerCursorForwardAtom);
  const setComposerValidationError = useSetAtom(setComposerValidationErrorAtom);

  useInput(
    (input, key) => {
      if (isMouseInput(input)) {
        return;
      }

      const newlineInput = promptNewlineInput(input, key, state);
      if (newlineInput === 'replace-backslash') {
        deleteComposerBackward({ maxBytes });
        insertComposerText({ maxBytes, text: '\n' });
        return;
      }

      if (newlineInput === 'insert-newline') {
        insertComposerText({ maxBytes, text: '\n' });
        return;
      }

      if (key.leftArrow) {
        moveComposerCursorBackward();
        return;
      }

      if (key.rightArrow) {
        moveComposerCursorForward();
        return;
      }

      if (key.return) {
        submitPrompt({
          clearComposer,
          maxBytes,
          onSubmit,
          setComposerValidationError,
          text: state.text
        });
        return;
      }

      if (key.backspace || key.delete) {
        deleteComposerBackward({ maxBytes });
        return;
      }

      if (key.tab) {
        return;
      }

      const printable = printableInput(input);
      if (printable.length > 0) {
        insertComposerText({ maxBytes, text: printable });
      }
    },
    { isActive }
  );
}

function submitPrompt({
  clearComposer,
  maxBytes,
  onSubmit,
  setComposerValidationError,
  text
}: {
  clearComposer: () => void;
  maxBytes: number;
  onSubmit: (prompt: string) => void;
  setComposerValidationError: (message: string | null) => void;
  text: string;
}): void {
  const validation = validateComposerSubmit(text, maxBytes);
  if (!validation.ok) {
    if (validation.reason === 'over-limit') {
      setComposerValidationError(validation.message);
    }
    return;
  }

  onSubmit(validation.text);
  clearComposer();
}

function promptNewlineInput(
  input: string,
  key: EnterKey,
  state: PromptComposerInputState
): PromptNewlineInput | null {
  if (MODIFIED_ENTER_INPUTS.has(input)) {
    return 'insert-newline';
  }

  if (key.return !== true) {
    return null;
  }

  if (key.shift === true || key.ctrl === true || key.meta === true) {
    return 'insert-newline';
  }

  return state.text.at(state.cursorIndex - 1) === '\\' ? 'replace-backslash' : null;
}
