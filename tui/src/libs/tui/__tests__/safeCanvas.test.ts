import { describe, expect, it } from 'vitest';
import {
  isInsideSafeChromeBounds,
  resolveComposerInputColumns,
  resolveSafeColumns,
  resolveSafeRows
} from '@libs/tui/safeCanvas.ts';

describe('safe canvas helpers', () => {
  it('reserves physical guard rows without dropping below the minimum', () => {
    expect(resolveSafeRows(24, 1, 15)).toBe(23);
    expect(resolveSafeRows(12, 1, 15)).toBe(15);
  });

  it('reserves physical guard columns without dropping below one column', () => {
    expect(resolveSafeColumns(80, 1)).toBe(79);
    expect(resolveSafeColumns(1, 1)).toBe(1);
  });

  it('resolves editable composer columns inside the safe chrome width', () => {
    expect(resolveComposerInputColumns(79, 2)).toBe(77);
    expect(resolveComposerInputColumns(1, 2)).toBe(1);
  });

  it('detects whether a 1-based mouse position is inside the safe canvas', () => {
    expect(isInsideSafeChromeBounds({ row: 1, column: 1, rows: 10, columns: 20 })).toBe(true);
    expect(isInsideSafeChromeBounds({ row: 10, column: 20, rows: 10, columns: 20 })).toBe(true);
    expect(isInsideSafeChromeBounds({ row: 11, column: 20, rows: 10, columns: 20 })).toBe(false);
    expect(isInsideSafeChromeBounds({ row: 10, column: 21, rows: 10, columns: 20 })).toBe(false);
  });
});
