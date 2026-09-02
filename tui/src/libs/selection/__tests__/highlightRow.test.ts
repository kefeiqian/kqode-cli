import { describe, expect, it } from 'vitest';
import { selectionBounds } from '@libs/selection/bounds.ts';
import { rowHighlight, rowSegmentHighlights } from '@libs/selection/highlightRow.ts';

function bounds(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number) {
  return selectionBounds(
    { rowIndex: anchorRow, column: anchorCol },
    { rowIndex: focusRow, column: focusCol }
  );
}

describe('rowHighlight', () => {
  it('splits a partially selected single row', () => {
    expect(rowHighlight('hello world', 0, bounds(0, 0, 0, 5), 0)).toEqual({
      pre: '',
      selected: 'hello',
      post: ' world'
    });
  });

  it('selects a whole middle row of a multi-row selection', () => {
    expect(rowHighlight('middle', 1, bounds(0, 3, 2, 1), 0)).toEqual({
      pre: '',
      selected: 'middle',
      post: ''
    });
  });

  it('offsets the selection columns past the marker width', () => {
    expect(rowHighlight('answer', 0, bounds(0, 0, 0, 8), 2)).toEqual({
      pre: '',
      selected: 'answer',
      post: ''
    });
  });

  it('returns null when the row is outside the selection', () => {
    expect(rowHighlight('x', 5, bounds(0, 0, 2, 3), 0)).toBeNull();
  });

  it('returns null for a collapsed selection', () => {
    expect(rowHighlight('x', 0, bounds(0, 1, 0, 1), 0)).toBeNull();
  });

  it('keeps whole wide graphemes in the selected span', () => {
    expect(rowHighlight('你好world', 0, bounds(0, 2, 0, 6), 0)).toEqual({
      pre: '你',
      selected: '好wo',
      post: 'rld'
    });
  });

  it('preserves styled segment colors around the selected span', () => {
    const segments = [
      { color: '#ffffff', text: 'before ' },
      { color: '#9ECE6A', text: 'transpose' },
      { color: '#ffffff', text: ' after' }
    ];

    expect(
      rowSegmentHighlights(segments, 0, bounds(0, 0, 0, 7), 0)
    ).toEqual([
      { color: '#ffffff', selected: true, text: 'before ' },
      { color: '#9ECE6A', selected: false, text: 'transpose' },
      { color: '#ffffff', selected: false, text: ' after' }
    ]);
    expect(
      rowSegmentHighlights(segments, 0, bounds(0, 7, 0, 16), 0)?.find(
        (segment) => segment.text === 'transpose'
      )
    ).toEqual({ color: '#9ECE6A', selected: true, text: 'transpose' });
  });
});
