import { describe, expect, it } from 'vitest';
import {
  LOWER_HALF_BLOCK,
  resolveHalfLineGlyph,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.ts';

describe('backgroundBlock helpers', () => {
  it('exports Gemini-style half-line glyphs', () => {
    expect(LOWER_HALF_BLOCK).toBe('▄');
    expect(UPPER_HALF_BLOCK).toBe('▀');
  });

  it('uses inverse-colored glyphs with inward-facing monochrome fallbacks', () => {
    expect(resolveHalfLineGlyph('top', true)).toBe(UPPER_HALF_BLOCK);
    expect(resolveHalfLineGlyph('bottom', true)).toBe(LOWER_HALF_BLOCK);
    expect(resolveHalfLineGlyph('top', false)).toBe(LOWER_HALF_BLOCK);
    expect(resolveHalfLineGlyph('bottom', false)).toBe(UPPER_HALF_BLOCK);
  });

});
