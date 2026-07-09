import { describe, expect, it } from 'vitest';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { wrapSegments } from '@libs/markdown/wrapSegments.ts';
import type { StyledSegment } from '@libs/markdown/types.ts';

describe('wrapSegments', () => {
  it('wraps plain text at word boundaries', () => {
    expect(textRows([{ text: 'hello wide world' }], 10)).toEqual(['hello wide', 'world']);
  });

  it('preserves styles when a word moves to a new row', () => {
    const rows = wrapSegments([{ text: 'plain ' }, { text: 'boldword', bold: true }], 6);

    expect(rows[1]?.[0]).toMatchObject({ bold: true, text: 'boldwo' });
    expect(rows[2]?.[0]).toMatchObject({ bold: true, text: 'rd' });
  });

  it('hard-splits over-long words at grapheme boundaries', () => {
    const rows = textRows([{ text: 'abcdefgh' }], 3);

    expect(rows).toEqual(['abc', 'def', 'gh']);
    expect(rows.every((row) => displayWidth(row) <= 3)).toBe(true);
  });

  it('counts CJK wide characters as two columns', () => {
    const rows = textRows([{ text: '你好世界' }], 4);

    expect(rows).toEqual(['你好', '世界']);
    expect(rows.every((row) => displayWidth(row) <= 4)).toBe(true);
  });

  it('handles empty and whitespace-only input', () => {
    expect(wrapSegments([], 5)).toEqual([[]]);
    expect(textRows([{ text: '   ' }], 5)).toEqual(['']);
  });
});

function textRows(segments: StyledSegment[], columns: number): string[] {
  return wrapSegments(segments, columns).map((row) => row.map((segment) => segment.text).join(''));
}
