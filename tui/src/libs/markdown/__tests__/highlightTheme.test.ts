import { describe, expect, it } from 'vitest';
import { tokenForHighlightClasses } from '@libs/markdown/highlightTheme.ts';

describe('tokenForHighlightClasses', () => {
  it('maps known highlight.js classes to theme tokens', () => {
    expect(tokenForHighlightClasses(['hljs-keyword'])).toBe('warning');
    expect(tokenForHighlightClasses(['hljs-string'])).toBe('accentGreen');
    expect(tokenForHighlightClasses(['hljs-comment'])).toBe('muted');
    expect(tokenForHighlightClasses(['hljs-deletion'])).toBe('errorRed');
    expect(tokenForHighlightClasses(['hljs-addition'])).toBe('accentGreen');
    expect(tokenForHighlightClasses(['hljs-selector-class'])).toBe('accentGreen');
  });

  it('returns the first matching class, else falls back to foreground', () => {
    expect(tokenForHighlightClasses(['function_', 'hljs-number'])).toBe('warning');
    expect(tokenForHighlightClasses(['totally-unknown'])).toBe('foreground');
    expect(tokenForHighlightClasses([])).toBe('foreground');
    expect(tokenForHighlightClasses(undefined)).toBe('foreground');
  });
});
