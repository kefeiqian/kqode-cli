import { describe, expect, it } from 'vitest';
import {
  classifyClick,
  MAX_CLICK_COUNT,
  MULTI_CLICK_WINDOW_MS,
  type PressRecord
} from '@libs/selection/multiClick.ts';

const record = (over: Partial<PressRecord> = {}): PressRecord => ({
  at: 0,
  row: 5,
  column: 10,
  count: 1,
  ...over
});

describe('classifyClick', () => {
  it('classifies the first press as a single', () => {
    expect(classifyClick(null, { at: 0, row: 5, column: 10 })).toBe(1);
  });

  it('escalates single -> double -> triple within the window and tolerance', () => {
    let previous: PressRecord | null = null;
    const counts: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const press = { at: i * 100, row: 5, column: 10 };
      const count = classifyClick(previous, press);
      counts.push(count);
      previous = { ...press, count };
    }
    expect(counts).toEqual([1, 2, 3]);
  });

  it('cycles back to a single on the fourth rapid press', () => {
    const triple = record({ at: 300, count: MAX_CLICK_COUNT });
    expect(classifyClick(triple, { at: 400, row: 5, column: 10 })).toBe(1);
  });

  it('starts a new cycle when the next press is past the window', () => {
    const previous = record({ at: 0, count: 1 });
    expect(classifyClick(previous, { at: MULTI_CLICK_WINDOW_MS + 1, row: 5, column: 10 })).toBe(1);
  });

  it('keeps the double at the exact window boundary', () => {
    const previous = record({ at: 0, count: 1 });
    expect(classifyClick(previous, { at: MULTI_CLICK_WINDOW_MS, row: 5, column: 10 })).toBe(2);
  });

  it('starts a new cycle when the next press is more than one cell away', () => {
    const previous = record({ at: 0, row: 5, column: 10, count: 1 });
    expect(classifyClick(previous, { at: 100, row: 5, column: 13 })).toBe(1);
    expect(classifyClick(previous, { at: 100, row: 8, column: 10 })).toBe(1);
  });

  it('allows a one-cell drift to continue the cycle', () => {
    const previous = record({ at: 0, row: 5, column: 10, count: 1 });
    expect(classifyClick(previous, { at: 100, row: 6, column: 11 })).toBe(2);
  });
});
