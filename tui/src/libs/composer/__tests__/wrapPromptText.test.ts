import { describe, expect, it } from 'vitest';
import { countWrappedPromptRows, wrapPromptText } from '@libs/composer/wrapPromptText.ts';

describe('wrapPromptText', () => {
  it('wraps a long logical line every `columns` display columns', () => {
    expect(wrapPromptText('abcdefghij', 4).map((row) => row.text)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('wraps wide CJK glyphs by display width, not character count', () => {
    // Each CJK glyph is two columns, so only two fit per 4-column row.
    expect(wrapPromptText('去儿童', 4).map((row) => row.text)).toEqual(['去儿', '童']);
  });

  it('shifts a wide glyph to the next row past a one-column gap', () => {
    // At an odd width a two-column glyph cannot share the trailing column.
    expect(wrapPromptText('去儿童', 3).map((row) => row.text)).toEqual(['去', '儿', '童']);
  });

  it('tracks source indices across mixed-width rows', () => {
    expect(wrapPromptText('a去b', 3)).toEqual([
      { text: 'a去', start: 0, end: 2 },
      { text: 'b', start: 2, end: 3 }
    ]);
  });

  it('keeps authored newlines as separate rows', () => {
    expect(wrapPromptText('a\nbb', 10).map((row) => row.text)).toEqual(['a', 'bb']);
  });

  it('returns a single empty row for empty text', () => {
    expect(wrapPromptText('', 10)).toEqual([{ text: '', start: 0, end: 0 }]);
  });

  it('counts wrapped rows', () => {
    expect(countWrappedPromptRows('abcdefghij', 4)).toBe(3);
  });

  it('reuses the cached row array for repeated identical inputs', () => {
    const first = wrapPromptText('cache\nme', 10);
    const second = wrapPromptText('cache\nme', 10);

    expect(second).toBe(first);
  });

  it('recomputes when the text or width changes', () => {
    const base = wrapPromptText('abcdef', 4);
    const sameAgain = wrapPromptText('abcdef', 4);
    const widerWidth = wrapPromptText('abcdef', 6);

    expect(sameAgain).toBe(base);
    expect(widerWidth).not.toBe(base);
  });
});
