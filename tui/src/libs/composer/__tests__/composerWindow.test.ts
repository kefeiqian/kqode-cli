import { describe, expect, it } from 'vitest';
import {
  resolveClickResult,
  resolveComposerWindow,
  resolveScrollIntoViewOffset,
  resolveVerticalCursorIndex
} from '@libs/composer/composerWindow.ts';

describe('resolveComposerWindow', () => {
  // 6 wrapped rows at columns=4: '0000','1111','2222','3333','4444','5555'
  const text = '000011112222333344445555';
  const columns = 4;
  const maxVisibleLines = 3;
  const atEnd = { text, columns, maxVisibleLines, cursorIndex: text.length };

  it('follows the cursor at offset 0 (bottom window when cursor at end)', () => {
    const window = resolveComposerWindow(atEnd);
    expect(window.text).toBe('3333\n4444\n5555');
    expect(window.cursorVisible).toBe(true);
    expect(window.canScroll).toBe(true);
  });

  it('reveals earlier rows with a positive offset, hiding the cursor row', () => {
    const window = resolveComposerWindow({ ...atEnd, offset: 3 });
    expect(window.text).toBe('0000\n1111\n2222');
    expect(window.cursorVisible).toBe(false);
  });

  it('clamps a stale over-large offset to the top row', () => {
    expect(resolveComposerWindow({ ...atEnd, offset: 999 }).text).toBe('0000\n1111\n2222');
  });

  it('exposes clamp bounds spanning the full range (cursor at end)', () => {
    const window = resolveComposerWindow(atEnd);
    expect(window.maxOffset).toBe(3); // baseStart = lastStart = 6 - 3
    expect(window.minOffset).toBe(0); // baseStart - lastStart
  });

  it('reports canScroll false when the prompt fits', () => {
    const window = resolveComposerWindow({ text: 'short', columns: 20, maxVisibleLines: 3, cursorIndex: 5 });
    expect(window.canScroll).toBe(false);
  });
});

describe('resolveScrollIntoViewOffset', () => {
  // 6 wrapped rows at columns 4: '0000'(0-4) '1111'(4-8) '2222'(8-12) '3333'(12-16) '4444'(16-20) '5555'(20-24)
  const text = '000011112222333344445555';
  const columns = 4;
  const maxVisibleLines = 3;

  it('keeps a scrolled offset when the cursor is already visible', () => {
    // cursor on row 2 (index 10); offset -1 shows rows 1..3 with the cursor visible
    expect(resolveScrollIntoViewOffset({ text, columns, maxVisibleLines, cursorIndex: 10, offset: -1 })).toBe(-1);
  });

  it('scrolls to the bottom edge when the cursor is below the window', () => {
    // offset 3 shows rows 0..2 but the cursor (row 5) is below -> pin to bottom (offset 0)
    expect(resolveScrollIntoViewOffset({ text, columns, maxVisibleLines, cursorIndex: 24, offset: 3 })).toBe(0);
  });

  it('scrolls to the top edge when the cursor is above the window', () => {
    // cursor on row 0; offset -2 shows rows 2..4 (cursor above) -> pin to top (offset 0)
    expect(resolveScrollIntoViewOffset({ text, columns, maxVisibleLines, cursorIndex: 0, offset: -2 })).toBe(0);
  });
});

describe('resolveVerticalCursorIndex', () => {
  // 'aaa\nbbb\nccc' -> rows 'aaa'(0-3), 'bbb'(4-7), 'ccc'(8-11)
  const text = 'aaa\nbbb\nccc';

  it('moves up a visual line preserving the column', () => {
    expect(resolveVerticalCursorIndex(text, 40, 11, 'up')).toBe(7); // row2 col3 -> row1 col3
  });

  it('moves down a visual line preserving the column', () => {
    expect(resolveVerticalCursorIndex(text, 40, 7, 'down')).toBe(11); // row1 col3 -> row2 col3
  });

  it('clamps the column to a shorter target row', () => {
    // 'aa\nb' -> 'aa'(0-2), 'b'(3-4); row0 col2 down -> row1 (len 1) -> index 4
    expect(resolveVerticalCursorIndex('aa\nb', 40, 2, 'down')).toBe(4);
  });

  it('returns null at the first row (up) and last row (down)', () => {
    expect(resolveVerticalCursorIndex(text, 40, 1, 'up')).toBeNull();
    expect(resolveVerticalCursorIndex(text, 40, 11, 'down')).toBeNull();
  });

  it('returns null for a single-row prompt', () => {
    expect(resolveVerticalCursorIndex('hello', 40, 3, 'up')).toBeNull();
    expect(resolveVerticalCursorIndex('hello', 40, 3, 'down')).toBeNull();
  });

  it('navigates wrapped rows of a single logical line', () => {
    // 'abcdefghij' cols 4 -> 'abcd'(0-4), 'efgh'(4-8), 'ij'(8-10)
    expect(resolveVerticalCursorIndex('abcdefghij', 4, 2, 'down')).toBe(6);
    expect(resolveVerticalCursorIndex('abcdefghij', 4, 6, 'up')).toBe(2);
  });

  it('preserves grapheme-aligned visual columns across wrapped rows', () => {
    expect(resolveVerticalCursorIndex('👍🏽a👍🏽b', 3, '👍🏽'.length, 'down')).toBe(
      '👍🏽a'.length + '👍🏽'.length
    );
  });
});

describe('resolveClickResult', () => {
  // 'aaa\nbbb\nccc' -> rows 'aaa'(0-3), 'bbb'(4-7), 'ccc'(8-11); all visible at maxVisibleLines 3
  const base = { text: 'aaa\nbbb\nccc', columns: 40, maxVisibleLines: 3, cursorIndex: 11, offset: 0 };

  it('maps a click on a visible row + column to the absolute index', () => {
    expect(resolveClickResult({ ...base, visibleRow: 0, column: 1 })?.index).toBe(1);
    expect(resolveClickResult({ ...base, visibleRow: 1, column: 2 })?.index).toBe(6);
  });

  it('clamps the column to the clicked row length (and floors at 0)', () => {
    expect(resolveClickResult({ ...base, visibleRow: 2, column: 99 })?.index).toBe(11);
    expect(resolveClickResult({ ...base, visibleRow: 0, column: -5 })?.index).toBe(0);
  });

  it('never places the click cursor inside a grapheme cluster', () => {
    const grapheme = { text: '👍🏽a', columns: 40, maxVisibleLines: 3, cursorIndex: 0, offset: 0 };
    expect(resolveClickResult({ ...grapheme, visibleRow: 0, column: 1 })?.index).toBe(0);
    expect(resolveClickResult({ ...grapheme, visibleRow: 0, column: 2 })?.index).toBe(
      '👍🏽'.length
    );
  });

  it('returns null for rows outside the visible window', () => {
    expect(resolveClickResult({ ...base, visibleRow: -1, column: 0 })).toBeNull();
    expect(resolveClickResult({ ...base, visibleRow: 3, column: 0 })).toBeNull();
  });

  it('accounts for the scroll offset when mapping the clicked row', () => {
    // 6 single-char rows; offset 2 shows rows 1..3, so visibleRow 0 -> wrap row 1 ('1' at index 2)
    const scrolled = { text: '0\n1\n2\n3\n4\n5', columns: 40, maxVisibleLines: 3, cursorIndex: 11, offset: 2 };
    expect(resolveClickResult({ ...scrolled, visibleRow: 0, column: 0 })?.index).toBe(2);
  });

  it('returns an offset that keeps the visible window fixed (no scroll on click)', () => {
    // 6 single-char rows; offset 2 shows rows 1..3. Clicking the top visible row
    // must leave those same rows visible after the caret moves there.
    const scrolled = { text: '0\n1\n2\n3\n4\n5', columns: 40, maxVisibleLines: 3, cursorIndex: 11, offset: 2 };
    const before = resolveComposerWindow(scrolled).text;
    const result = resolveClickResult({ ...scrolled, visibleRow: 0, column: 0 });
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    const after = resolveComposerWindow({
      text: scrolled.text,
      columns: scrolled.columns,
      maxVisibleLines: scrolled.maxVisibleLines,
      cursorIndex: result.index,
      offset: result.offset
    }).text;
    expect(after).toBe(before);
  });

  it('keeps the window fixed when clicking a soft-wrapped row at a wrap boundary', () => {
    // 'abcdefghij' at columns 2 -> rows ab(0-2) cd(2-4) ef(4-6) gh(6-8) ij(8-10).
    // offset 2 shows cd/ef (visibleStart 1). A column-0 click lands on a wrap
    // boundary index (row.start === previousRow.end); the window must not scroll.
    const scrolled = { text: 'abcdefghij', columns: 2, maxVisibleLines: 2, cursorIndex: 10, offset: 2 };
    const before = resolveComposerWindow(scrolled).text;
    expect(before).toBe('cd\nef');
    for (const visibleRow of [0, 1]) {
      const result = resolveClickResult({ ...scrolled, visibleRow, column: 0 });
      expect(result).not.toBeNull();
      if (result === null) {
        continue;
      }
      const after = resolveComposerWindow({
        text: scrolled.text,
        columns: scrolled.columns,
        maxVisibleLines: scrolled.maxVisibleLines,
        cursorIndex: result.index,
        offset: result.offset
      }).text;
      expect(after).toBe(before);
    }
  });
});
