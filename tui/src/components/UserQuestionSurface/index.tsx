import { Box, Text, useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { dockedPanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import {
  closeUserQuestionAtom,
  moveUserQuestionSelectionAtom,
  userQuestionAtom,
  userQuestionSelectedIndexAtom,
  type UserQuestionChoice
} from '@state/ui/userQuestion/index.ts';

const QUESTION_CHROME_ROWS = 4;
const DEFAULT_FOOTER_HINT = '↑/↓ choose · enter confirm · esc cancel';

/** Generic bottom-docked question surface for confirmations and future decisions. */
export function UserQuestionSurface() {
  const question = useAtomValue(userQuestionAtom);
  const selectedIndex = useAtomValue(userQuestionSelectedIndexAtom);
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const columns = useAtomValue(safeChromeColumnsAtom);
  const theme = useAtomValue(activeThemeAtom);
  const closeQuestion = useSetAtom(closeUserQuestionAtom);
  const moveSelection = useSetAtom(moveUserQuestionSelectionAtom);
  const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: QUESTION_CHROME_ROWS });

  useInput((input, key) => {
    if (question === null) {
      return;
    }
    if (key.escape) {
      runChoice(cancelChoice(question.choices) ?? null, closeQuestion);
      return;
    }
    if (key.upArrow || key.leftArrow) {
      moveSelection(-1);
      return;
    }
    if (key.downArrow || key.rightArrow) {
      moveSelection(1);
      return;
    }
    const shortcut = question.choices.find(
      (choice) => choice.shortcut?.toLowerCase() === input.toLowerCase()
    );
    if (shortcut !== undefined) {
      runChoice(shortcut, closeQuestion);
      return;
    }
    if (key.return || input === '\r' || input === '\n') {
      runChoice(question.choices[selectedIndex] ?? null, closeQuestion);
    }
  });

  if (question === null) {
    return null;
  }

  return (
    <CommandSurface
      panelRows={panelRows}
      layout={layout}
      label={truncate(`/question · ${question.title}`, columns)}
      bodyRows={layout.bodyRows}
      footerHint={question.footerHint ?? DEFAULT_FOOTER_HINT}
      position=""
    >
      <Box flexDirection="column" height={layout.bodyRows}>
        <Text>{truncate(question.message, columns)}</Text>
        {question.choices.map((choice, index) => (
          <SelectableRow
            key={choice.id}
            highlighted={index === selectedIndex}
            content={choiceLabel(choice)}
          />
        ))}
      </Box>
    </CommandSurface>
  );
}

function runChoice(choice: UserQuestionChoice | null, closeQuestion: () => void): void {
  closeQuestion();
  if (choice !== null) {
    void choice.action();
  }
}

function cancelChoice(choices: readonly UserQuestionChoice[]): UserQuestionChoice | undefined {
  return choices.find((choice) => choice.isCancel);
}

function choiceLabel(choice: UserQuestionChoice): string {
  return choice.shortcut === undefined ? choice.label : `[${choice.shortcut}] ${choice.label}`;
}

function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns));
}
