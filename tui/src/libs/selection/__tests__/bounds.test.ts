import { describe, expect, it } from 'vitest';
import { isSelectionEmpty, selectionBounds } from '@libs/selection/bounds.ts';

describe('selectionBounds', () => {
  it('orders endpoints top-to-bottom regardless of drag direction', () => {
    const lower = { rowIndex: 1, column: 9 };
    const upper = { rowIndex: 2, column: 5 };
    expect(selectionBounds(upper, lower)).toEqual({ start: lower, end: upper });
    expect(selectionBounds(lower, upper)).toEqual({ start: lower, end: upper });
  });

  it('orders by column within the same row', () => {
    const left = { rowIndex: 3, column: 2 };
    const right = { rowIndex: 3, column: 8 };
    expect(selectionBounds(right, left)).toEqual({ start: left, end: right });
  });

  it('reports an empty span only when endpoints coincide', () => {
    const point = { rowIndex: 1, column: 4 };
    expect(isSelectionEmpty(selectionBounds(point, { ...point }))).toBe(true);
    expect(isSelectionEmpty(selectionBounds(point, { rowIndex: 1, column: 5 }))).toBe(false);
  });
});
