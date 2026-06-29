import { describe, expect, it } from 'vitest';
import { LOWER_HALF_BLOCK, UPPER_HALF_BLOCK } from '@libs/tui/backgroundBlock.js';

describe('backgroundBlock helpers', () => {
  it('exports Gemini-style half-line glyphs', () => {
    expect(LOWER_HALF_BLOCK).toBe('▄');
    expect(UPPER_HALF_BLOCK).toBe('▀');
  });

});
