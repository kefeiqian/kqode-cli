import { describe, expect, it } from 'vitest';
import { displayWidth, measureGraphemes, padEndToWidth } from '@libs/text/displayWidth.ts';

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
      { segment: 'a', width: 1 },
      { segment: '去', width: 2 }
    ]);
  });

  it('keeps a multi-code-point emoji cluster intact', () => {
    const measured = measureGraphemes('👍🏽');
    expect(measured).toHaveLength(1);
    expect(measured[0].segment).toBe('👍🏽');
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
