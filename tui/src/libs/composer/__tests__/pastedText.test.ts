import { describe, expect, it } from 'vitest';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';

describe('sanitizePastedText', () => {
  it('normalizes newlines and strips terminal control bytes', () => {
    expect(sanitizePastedText('a\r\nb\rc\u001B[31m\tz')).toBe(
      'a\nb\nc[31m   z'
    );
  });
});
