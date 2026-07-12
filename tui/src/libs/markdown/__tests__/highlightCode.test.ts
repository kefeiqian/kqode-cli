import { describe, expect, it } from 'vitest';
import {
  MAX_HIGHLIGHT_CODE_UNITS,
  clearHighlightCodeCache,
  highlightCode,
  highlightCodeCacheSize
} from '@libs/markdown/highlightCode.ts';

describe('highlightCode', () => {
  it('highlights known languages into theme-token segments', () => {
    const result = highlightCode('const x = "ok"; // yep', 'js');

    expect(result.highlighted).toBe(true);
    expect(result.lines[0]?.some((segment) => segment.colorToken === 'warning')).toBe(true);
    expect(result.lines[0]?.some((segment) => segment.colorToken === 'accentGreen')).toBe(true);
    expect(result.lines[0]?.some((segment) => segment.colorToken === 'muted')).toBe(true);
  });

  it('highlights common-bundle languages beyond the original set', () => {
    expect(highlightCode('def add(a, b):\n    return a + b  # sum', 'python').highlighted).toBe(true);
    expect(highlightCode('package main\nfunc main() {}', 'go').highlighted).toBe(true);
  });

  it('falls back to plain for unknown and oversized blocks', () => {
    expect(highlightCode('x', 'unknown').highlighted).toBe(false);
    expect(highlightCode('x'.repeat(MAX_HIGHLIGHT_CODE_UNITS + 1), 'js').highlighted).toBe(false);
  });

  it('caches repeated language and text pairs', () => {
    clearHighlightCodeCache();

    const first = highlightCode('let n = 1;', 'ts');
    const second = highlightCode('let n = 1;', 'ts');

    expect(second).toBe(first);
    expect(highlightCodeCacheSize()).toBe(1);
  });
});
