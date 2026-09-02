import { describe, expect, it } from 'vitest';
import { wordBounds } from '@libs/selection/wordBounds.ts';

describe('wordBounds', () => {
  const PATH_ROW = 'error in src/main.rs line 4';

  it('selects a whitespace-delimited path as one unit', () => {
    // 'src/main.rs' occupies display columns [9, 20) of the row.
    expect(wordBounds(PATH_ROW, 12)).toEqual({ start: 9, end: 20 });
    expect(PATH_ROW.slice(9, 20)).toBe('src/main.rs');
  });

  it('returns the same span for any column inside the word', () => {
    expect(wordBounds(PATH_ROW, 9)).toEqual({ start: 9, end: 20 });
    expect(wordBounds(PATH_ROW, 19)).toEqual({ start: 9, end: 20 });
  });

  it('returns null on whitespace', () => {
    // Column 5 is the space after 'error'.
    expect(wordBounds(PATH_ROW, 5)).toBeNull();
  });

  it('returns null past the end of the row', () => {
    expect(wordBounds('abc', 10)).toBeNull();
  });

  it('returns null for an empty or blank row', () => {
    expect(wordBounds('', 0)).toBeNull();
    expect(wordBounds('   ', 1)).toBeNull();
  });

  it('keeps wide (CJK) glyphs whole on grapheme boundaries', () => {
    // '你好 world': 你(2) 好(2) space(1) world(5). The word '你好' spans [0, 4).
    const text = '你好 world';
    expect(wordBounds(text, 0)).toEqual({ start: 0, end: 4 });
    expect(wordBounds(text, 2)).toEqual({ start: 0, end: 4 });
    // 'world' begins at display column 5.
    expect(wordBounds(text, 6)).toEqual({ start: 5, end: 10 });
  });
});
