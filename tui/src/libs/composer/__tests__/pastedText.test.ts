import { describe, expect, it } from 'vitest';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';

describe('sanitizePastedText', () => {
  it('normalizes carriage-return newlines to line feeds', () => {
    expect(sanitizePastedText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('strips C0/C1 controls and delete while preserving newline and tab', () => {
    expect(sanitizePastedText('a\u001B[31m\tb\nc\u007f\u009bd')).toBe('a[31m\tb\ncd');
  });
});
