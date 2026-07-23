import { describe, expect, it } from 'vitest';
import {
  resolveComposerBackgroundEnabled,
  resolveComposerBorderColumns,
  resolveMessageBorderGlyph,
  resolveSurfaceBorderGlyph
} from '@libs/terminal/surfaceBorder.ts';
import {
  LOWER_HALF_BLOCK,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.ts';

describe('surface border policy', () => {
  it('uses continuous horizontal lines in macOS Terminal.app', () => {
    expect(resolveSurfaceBorderGlyph('top', 'Apple_Terminal')).toBe('─');
    expect(resolveSurfaceBorderGlyph('bottom', 'Apple_Terminal')).toBe('─');
  });

  it('keeps inward half-blocks in other terminals', () => {
    expect(resolveSurfaceBorderGlyph('top', 'ghostty')).toBe(LOWER_HALF_BLOCK);
    expect(resolveSurfaceBorderGlyph('bottom', 'ghostty')).toBe(UPPER_HALF_BLOCK);
  });

  it('blends Terminal.app text rows into the terminal background', () => {
    expect(resolveComposerBackgroundEnabled('Apple_Terminal')).toBe(false);
    expect(resolveComposerBackgroundEnabled('ghostty')).toBe(true);
  });

  it('lets only Terminal.app decorative lines span the final-cell gutter', () => {
    expect(resolveComposerBorderColumns(59, 60, 'Apple_Terminal')).toBe(60);
    expect(resolveComposerBorderColumns(59, 60, 'ghostty')).toBe(59);
  });

  it('removes user-message borders only in Terminal.app', () => {
    expect(resolveMessageBorderGlyph('top', 'Apple_Terminal')).toBeNull();
    expect(resolveMessageBorderGlyph('bottom', 'Apple_Terminal')).toBeNull();
    expect(resolveMessageBorderGlyph('top', 'ghostty')).toBe(LOWER_HALF_BLOCK);
    expect(resolveMessageBorderGlyph('bottom', 'ghostty')).toBe(UPPER_HALF_BLOCK);
  });
});
