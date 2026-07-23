import { describe, expect, it } from 'vitest';
import { formatValidationError } from '@libs/composer/promptTextView.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';

describe('formatValidationError', () => {
  it('keeps validation feedback within its single-row content width', () => {
    const line = formatValidationError('xxxxxxxxxxxx', 18, true);

    expect(displayWidth(line)).toBe(18);
    expect(line).toBe('ERROR: xxxxxxxxxxx');
  });

  it('does not split a wide grapheme at the width boundary', () => {
    expect(formatValidationError('界界', 9, false)).toBe('ERROR: 界');
  });
});
