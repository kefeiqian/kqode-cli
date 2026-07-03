import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { MODIFIED_ENTER_INPUTS } from '@components/PromptComposer/constants.ts';
import { exactCommandMatch, unknownCommandMessage } from '@components/PromptComposer/commandMenuInput.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { executeCommand } from '@state/commands/executeCommand.ts';
import type { CommandActions } from '@state/commands/executeCommand.ts';
import {
  commandMenuDismissedAtom,
  commandMenuOpenAtom,
  highlightedCommandAtom,
  moveCommandHighlightAtom,
  resetCommandHighlightAtom
} from '@state/commands/index.ts';
import {
  clearComposerAtom,
  deleteComposerBackwardAtom,
  insertComposerTextAtom,
  moveComposerCursorBackwardAtom,
  moveComposerCursorForwardAtom,
  printableInput,
  setComposerValidationErrorAtom,
  validateComposerSubmit
} from '@state/composer/index.ts';
import { armedActionAtom } from '@state/global/index.ts';

type PromptComposerInputState = {
  cursorIndex: number;
  text: string;
};

type PromptComposerInputOptions = {
  isActive: boolean;
  maxBytes: number;
  onSubmit: (prompt: string) => void;
  state: PromptComposerInputState;
  commandActions: CommandActions;
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
  state,
  commandActions
}: PromptComposerInputOptions): void {
  const clearComposer = useSetAtom(clearComposerAtom);
  const deleteComposerBackward = useSetAtom(deleteComposerBackwardAtom);
  const insertComposerText = useSetAtom(insertComposerTextAtom);
  const moveComposerCursorBackward = useSetAtom(moveComposerCursorBackwardAtom);
  const moveComposerCursorForward = useSetAtom(moveComposerCursorForwardAtom);
  const setComposerValidationError = useSetAtom(setComposerValidationErrorAtom);

  const menuOpen = useAtomValue(commandMenuOpenAtom);
  const highlightedCommand = useAtomValue(highlightedCommandAtom);
  const moveCommandHighlight = useSetAtom(moveCommandHighlightAtom);
  const resetCommandHighlight = useSetAtom(resetCommandHighlightAtom);
  const setCommandMenuDismissed = useSetAtom(commandMenuDismissedAtom);
  const armedAction = useAtomValue(armedActionAtom);
  const setArmedAction = useSetAtom(armedActionAtom);

  useInput(
    (input, key) => {
      if (isMouseInput(input)) {
        return;
      }

      // Ctrl+C is owned by the global two-step-exit hook; never handle it here.
      if (key.ctrl === true && input === 'c') {
        return;
      }

      // Any real key other than Esc cancels a pending two-step confirmation.
      if (key.escape !== true) {
        setArmedAction(null);
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

      if (menuOpen) {
        if (key.upArrow) {
          moveCommandHighlight(-1);
          return;
        }
        if (key.downArrow) {
          moveCommandHighlight(1);
          return;
        }
        if (key.tab) {
          if (highlightedCommand !== undefined) {
            clearComposer();
            insertComposerText({ maxBytes, text: highlightedCommand.name });
          }
          return;
        }
        if (key.escape) {
          setCommandMenuDismissed(true);
          return;
        }
        if (key.return) {
          if (highlightedCommand !== undefined) {
            executeCommand(highlightedCommand.id, commandActions);
            clearComposer();
          } else {
            setComposerValidationError(unknownCommandMessage(state.text));
          }
          return;
        }
      }

      if (key.escape === true) {
        if (armedAction === 'clear-input') {
          clearComposer();
          setArmedAction(null);
        } else if (state.text.length > 0) {
          setArmedAction('clear-input');
        }
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
          commandActions,
          maxBytes,
          onSubmit,
          setComposerValidationError,
          text: state.text
        });
        return;
      }

      if (key.backspace || key.delete) {
        deleteComposerBackward({ maxBytes });
        resetCommandHighlight();
        setCommandMenuDismissed(false);
        return;
      }

      if (key.tab) {
        return;
      }

      const printable = printableInput(input);
      if (printable.length > 0) {
        insertComposerText({ maxBytes, text: printable });
        resetCommandHighlight();
        setCommandMenuDismissed(false);
      }
    },
    { isActive }
  );
}

function submitPrompt({
  clearComposer,
  commandActions,
  maxBytes,
  onSubmit,
  setComposerValidationError,
  text
}: {
  clearComposer: () => void;
  commandActions: CommandActions;
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

  if (validation.text.startsWith('/')) {
    const command = exactCommandMatch(validation.text);
    if (command !== undefined) {
      executeCommand(command.id, commandActions);
      clearComposer();
    } else {
      setComposerValidationError(unknownCommandMessage(validation.text));
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
