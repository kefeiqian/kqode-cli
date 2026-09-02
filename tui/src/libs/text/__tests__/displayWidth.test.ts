import { describe, expect, it } from 'vitest';
import {
  clampToGraphemeBoundary,
  displayWidth,
  displayWidthBeforeIndex,
  indexAtDisplayColumn,
  measureGraphemes,
  nextGraphemeEnd,
  padEndToWidth,
  previousGraphemeStart
} from '@libs/text/displayWidth.ts';

describe('displayWidth', () => {
  it('counts ASCII characters as one column each', () => {
    expect(displayWidth('hello')).toBe(5);
  });

  it('counts CJK characters as two columns each', () => {
    expect(displayWidth('去儿童')).toBe(6);
  });

  it('measures mixed ASCII and CJK text', () => {
    expect(displayWidth('/去儿童')).toBe(7);
  });

  it('is zero for the empty string', () => {
    expect(displayWidth('')).toBe(0);
  });
});

describe('measureGraphemes', () => {
  it('pairs each grapheme with its display width', () => {
    expect(measureGraphemes('a去')).toEqual([
      { segment: 'a', width: 1, start: 0, end: 1 },
      { segment: '去', width: 2, start: 1, end: 2 }
    ]);
  });

  it('keeps a multi-code-point emoji cluster intact', () => {
    const measured = measureGraphemes('👍🏽');
    expect(measured).toHaveLength(1);
    expect(measured[0].segment).toBe('👍🏽');
    expect(measured[0]).toMatchObject({ width: 2, start: 0, end: 4 });
  });

  it('keeps ZWJ family emoji and combining sequences intact', () => {
    expect(measureGraphemes('👨‍👩‍👧')).toHaveLength(1);
    expect(measureGraphemes('e\u0301')).toHaveLength(1);
  });
});

describe('padEndToWidth', () => {
  it('pads to the target display width when text is narrower', () => {
    expect(padEndToWidth('去', 5)).toBe('去   ');
  });

  it('returns the text unchanged when it already meets the width', () => {
    expect(padEndToWidth('去儿', 4)).toBe('去儿');
  });

  it('never truncates text wider than the target', () => {
    expect(padEndToWidth('去儿童', 4)).toBe('去儿童');
  });
});

describe('grapheme boundaries', () => {
  it('moves left and right by grapheme cluster instead of code point', () => {
    expect(previousGraphemeStart('👍🏽a', 4)).toBe(0);
    expect(nextGraphemeEnd('👍🏽a', 0)).toBe(4);
    expect(nextGraphemeEnd('👨‍👩‍👧b', 0)).toBe('👨‍👩‍👧'.length);
  });

  it('snaps interior indices back to grapheme boundaries', () => {
    expect(clampToGraphemeBoundary('e\u0301x', 1)).toBe(0);
    expect(clampToGraphemeBoundary('👍🏽a', 2)).toBe(0);
  });

  it('measures display width before a grapheme boundary', () => {
    expect(displayWidthBeforeIndex('👍🏽a', 4)).toBe(2);
    expect(displayWidthBeforeIndex('e\u0301x', 2)).toBe(1);
  });

  it('maps display columns back to whole-grapheme boundaries', () => {
    expect(indexAtDisplayColumn('👍🏽a', 0)).toBe(0);
    expect(indexAtDisplayColumn('👍🏽a', 1)).toBe(0);
    expect(indexAtDisplayColumn('👍🏽a', 2)).toBe(4);
    expect(indexAtDisplayColumn('e\u0301x', 1)).toBe(2);
  });
});
