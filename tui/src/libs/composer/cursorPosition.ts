import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  PROMPT_PREFIX
} from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';

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
    y: composerTop + topPaddingRows + cursorPosition.y
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
    x: Math.min(displayWidth(lastLine), columns),
    y: lines.length - 1
  };
}
