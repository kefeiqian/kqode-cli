import { describe, expect, it } from 'vitest';
import { wrapPromptText } from '@libs/composer/wrapPromptText.ts';

describe('wrapPromptText', () => {
  it('wraps a long logical line every `columns` characters', () => {
    expect(wrapPromptText('abcdefghij', 4).map((row) => row.text)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('adds a caret row when the final logical line exactly fills its width', () => {
    expect(wrapPromptText('abcdefgh', 4, true).map((row) => row.text)).toEqual([
      'abcd',
      'efgh',
      ''
    ]);
  });

  it('keeps authored newlines as separate rows', () => {
    expect(wrapPromptText('a\nbb', 10).map((row) => row.text)).toEqual(['a', 'bb']);
  });

  it('returns a single empty row for empty text', () => {
    expect(wrapPromptText('', 10)).toEqual([{ text: '', start: 0, end: 0 }]);
  });

  it('wraps CJK text by terminal display columns', () => {
    expect(wrapPromptText('界界界', 4).map((row) => row.text)).toEqual(['界界', '界']);
  });

  it('does not split combining or joined emoji graphemes', () => {
    expect(wrapPromptText('e\u0301e\u0301', 1).map((row) => row.text)).toEqual([
      'e\u0301',
      'e\u0301'
    ]);
    expect(wrapPromptText('👨‍👩‍👧‍👦x', 2).map((row) => row.text)).toEqual(['👨‍👩‍👧‍👦', 'x']);
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
