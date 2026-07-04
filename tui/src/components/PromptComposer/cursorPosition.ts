import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  INK_CURSOR_ROW_ORIGIN_OFFSET,
  PROMPT_PREFIX
} from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';

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
    // The measured composer top plus any half-line padding lands on the editable
    // row; INK_CURSOR_ROW_ORIGIN_OFFSET absorbs Ink's cursor-baseline origin
    // (1 while filling the terminal fullscreen — see its definition).
    y: composerTop + topPaddingRows + cursorPosition.y + INK_CURSOR_ROW_ORIGIN_OFFSET
  };
}

function cursorPositionForVisibleText(
  text: string,
  columns: number,
  cursorIndex: number
): { x: number; y: number } {
  const textBeforeCursor = text.slice(0, clamp(cursorIndex, 0, text.length));
  const lines = textBeforeCursor.split('\n');
  const lastLine = lines.at(-1) ?? '';
  return {
    x: Math.min(lastLine.length, columns),
    y: lines.length - 1
  };
}
