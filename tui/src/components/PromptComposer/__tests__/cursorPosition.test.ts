import { describe, expect, it } from 'vitest';
import {
  COMPOSER_BACKGROUND_TOP_PADDING_ROWS,
  INK_CURSOR_ROW_ORIGIN_OFFSET,
  PROMPT_PREFIX
} from '@constants/ui.ts';
import { resolveComposerCursorPosition } from '@components/PromptComposer/cursorPosition.ts';

const COLUMNS = 100;
const COMPOSER_TOP = 10;

describe('resolveComposerCursorPosition', () => {
  it('places the caret after ASCII text by character count', () => {
    const { x } = resolveComposerCursorPosition('/help', COLUMNS, COMPOSER_TOP);
    expect(x).toBe(PROMPT_PREFIX.length + 5);
  });

  it('places the caret past wide CJK glyphs by display width, not char count', () => {
    // '/去儿童' is 4 characters but 7 display columns (each CJK glyph is 2 wide),
    // so the caret must sit 7 columns after the prefix — not 4.
    const { x } = resolveComposerCursorPosition('/去儿童', COLUMNS, COMPOSER_TOP);
    expect(x).toBe(PROMPT_PREFIX.length + 7);
  });

  it('measures only the text before a mid-string cursor', () => {
    const { x } = resolveComposerCursorPosition('/去儿童', COLUMNS, COMPOSER_TOP, 2);
    expect(x).toBe(PROMPT_PREFIX.length + 3); // '/去' -> 1 + 2 columns
  });

  it('lands on the composer text row, below its top padding', () => {
    const { y } = resolveComposerCursorPosition('/去儿童', COLUMNS, COMPOSER_TOP);
    expect(y).toBe(
      COMPOSER_TOP + COMPOSER_BACKGROUND_TOP_PADDING_ROWS + INK_CURSOR_ROW_ORIGIN_OFFSET
    );
  });
});
