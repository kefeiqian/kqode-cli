import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  INK_CURSOR_ROW_ORIGIN_OFFSET,
  PROMPT_PREFIX
} from '@components/PromptComposer/constants.js';

export function resolveComposerCursorPosition(
  visibleText: string,
  columns: number,
  composerTop: number,
  cursorIndex = visibleText.length,
  hasBackgroundPadding = true
): { x: number; y: number } {
  const cursorPosition = cursorPositionForVisibleText(visibleText, columns, cursorIndex);
  const topPaddingRows = hasBackgroundPadding ? COMPOSER_BACKGROUND_TOP_PADDING_ROWS : 0;

  return {
    x: PROMPT_PREFIX.length + cursorPosition.x,
    // Ink's cursor row origin is one row below the measured box top, so the
    // measured composer top plus any half-line padding lands on the editable row.
    y: composerTop + topPaddingRows + cursorPosition.y + INK_CURSOR_ROW_ORIGIN_OFFSET
  };
}

function cursorPositionForVisibleText(
  text: string,
  columns: number,
  cursorIndex: number
): { x: number; y: number } {
  const textBeforeCursor = text.slice(0, Math.max(0, Math.min(cursorIndex, text.length)));
  const lines = textBeforeCursor.split('\n');
  const lastLine = lines.at(-1) ?? '';
  return {
    x: Math.min(lastLine.length, columns),
    y: lines.length - 1
  };
}
