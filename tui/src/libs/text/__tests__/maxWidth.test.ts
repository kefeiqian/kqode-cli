import { describe, expect, it } from 'vitest';
import { maxWidth } from '@libs/text/maxWidth.ts';

describe('maxWidth', () => {
  it('returns 0 for an empty list', () => {
    expect(maxWidth([])).toBe(0);
  });

  it('returns the longest line length by default', () => {
    expect(maxWidth(['a', 'abc', 'ab'])).toBe(3);
  });

  it('uses the provided measure', () => {
    expect(maxWidth(['aaaa', 'bb'], () => 2)).toBe(2);
  });
});
