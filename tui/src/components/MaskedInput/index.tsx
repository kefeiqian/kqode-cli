import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import {
  deleteCodePointBackward,
  insertText,
  moveCursor
} from '@libs/textField/singleLineText.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';

/** Default glyph used for the non-echoing masked display. */
export const DEFAULT_MASK_GLYPH = '•';

/** Default cap for displayed mask glyphs so long key length is not revealed. */
export const DEFAULT_MAX_MASK_GLYPHS = 8;

const CARET_GLYPH = '▌';

/** Props for the local-state-only masked key input primitive. */
export type MaskedInputProps = {
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
  maskGlyph?: string;
  maxMaskGlyphs?: number;
  isActive?: boolean;
};

/**
 * Security-sensitive key entry. The secret stays in component-local React state,
 * is never written to atoms, and empty trimmed submissions are ignored.
 */
export function MaskedInput({
  onSubmit,
  onCancel,
  placeholder = 'Enter API key',
  maskGlyph = DEFAULT_MASK_GLYPH,
  maxMaskGlyphs = DEFAULT_MAX_MASK_GLYPHS,
  isActive = true
}: MaskedInputProps) {
  const [state, setState] = useState({ value: '', cursorIndex: 0 });

  useInput(
    (input, key) => {
      if (isMouseInput(input)) {
        return;
      }

      if (key.escape) {
        onCancel();
        return;
      }

      if (key.return) {
        const trimmed = state.value.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
        }
        return;
      }

      if (key.backspace || key.delete) {
        setState((current) => deleteCodePointBackward(current));
        return;
      }

      if (key.leftArrow) {
        setState((current) => moveCursor(current, 'backward'));
        return;
      }

      if (key.rightArrow) {
        setState((current) => moveCursor(current, 'forward'));
        return;
      }

      if (key.tab) {
        return;
      }

      setState((current) => insertText(current, input));
    },
    { isActive }
  );

  const hasValue = state.value.length > 0;
  const maskCount = Math.min(Math.max(0, maxMaskGlyphs), Array.from(state.value).length);
  const maskedValue = hasValue ? maskGlyph.repeat(maskCount) : placeholder;

  return (
    <Box>
      <Text>{hasValue ? `${maskedValue}${CARET_GLYPH}` : `${CARET_GLYPH} ${maskedValue}`}</Text>
    </Box>
  );
}
