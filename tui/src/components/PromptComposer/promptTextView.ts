import { COMPOSER_BACKGROUND_PADDING_ROWS } from '@constants/ui.ts';
import { resolveComposerWindow } from '@libs/composer/composerWindow.ts';

export type VisiblePromptView = {
  text: string;
  cursorIndex: number;
};

export function formatVisiblePrompt(
  text: string,
  columns: number,
  maxVisibleLines: number
): string {
  return formatVisiblePromptView(text, columns, maxVisibleLines, text.length).text;
}

export function formatVisiblePromptView(
  text: string,
  columns: number,
  maxVisibleLines: number,
  cursorIndex: number
): VisiblePromptView {
  const window = resolveComposerWindow({ text, columns, maxVisibleLines, cursorIndex });
  return { text: window.text, cursorIndex: window.cursorIndex };
}

export function countVisibleComposerRows(
  visibleRowCount: number,
  hasValidationError: boolean,
  hasBackgroundPadding: boolean
): number {
  return (
    visibleRowCount +
    (hasValidationError ? 1 : 0) +
    (hasBackgroundPadding ? COMPOSER_BACKGROUND_PADDING_ROWS : 0)
  );
}

export function formatValidationError(error: string, columns: number, shouldPad: boolean): string {
  const errorLine = `ERROR: ${error}`;
  return shouldPad ? errorLine.padEnd(columns, ' ') : errorLine;
}
