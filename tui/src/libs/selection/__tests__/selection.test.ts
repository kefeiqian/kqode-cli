import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { selectionBounds } from '@libs/selection/bounds.ts';
import { rowHighlight } from '@libs/selection/highlightRow.ts';
import { selectedText } from '@libs/selection/selectedText.ts';
import { resolveBodyRows, type BodyRow } from '@libs/tui/bodyRows.ts';

describe('selection bounds and highlighting', () => {
  it('normalizes a backwards drag into reading order', () => {
    expect(
      selectionBounds(
        { rowIndex: 3, column: 8 },
        { rowIndex: 1, column: 2 }
      )
    ).toEqual({
      start: { rowIndex: 1, column: 2 },
      end: { rowIndex: 3, column: 8 }
    });
  });

  it('splits a row on display-column boundaries after its marker', () => {
    expect(
      rowHighlight(
        '界abc',
        0,
        {
          start: { rowIndex: 0, column: 2 },
          end: { rowIndex: 0, column: 5 }
        },
        2
      )
    ).toEqual({ pre: '', selected: '界a', post: 'bc' });
  });
});

describe('selectedText', () => {
  it('skips decorative rows and rejoins soft-wrapped content', () => {
    const rows: BodyRow[] = [
      { decorative: true, text: '────' },
      { marker: '• ', text: 'hello' },
      { continuesPrevious: '', marker: '  ', text: ' world' }
    ];

    expect(
      selectedText(
        rows,
        { rowIndex: 0, column: 0 },
        { rowIndex: 2, column: 999 }
      )
    ).toBe('hello world');
  });

  it('copies only the highlighted columns', () => {
    const rows: BodyRow[] = [{ text: 'selectable line' }];

    expect(
      selectedText(
        rows,
        { rowIndex: 0, column: 1 },
        { rowIndex: 0, column: 10 }
      )
    ).toBe('electable');
  });

  it('preserves selected whitespace exactly', () => {
    const rows: BodyRow[] = [{ text: 'a  b' }];

    expect(
      selectedText(
        rows,
        { rowIndex: 0, column: 1 },
        { rowIndex: 0, column: 3 }
      )
    ).toBe('  ');
  });

  it('excludes a separately rendered user prompt marker', () => {
    const rows: BodyRow[] = [{ marker: '  ❯ ', text: 'hello' }];

    expect(
      selectedText(
        rows,
        { rowIndex: 0, column: 0 },
        { rowIndex: 0, column: 999 }
      )
    ).toBe('hello');
  });

  it('highlights and copies tab-expanded transcript cells consistently', () => {
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Assistant, text: 'a\tb' }],
      12,
      10
    );
    const bounds = {
      start: { rowIndex: 0, column: 2 },
      end: { rowIndex: 0, column: 7 }
    };

    expect(rowHighlight(rows[0]?.text ?? '', 0, bounds, 2)?.selected).toBe('a   b');
    expect(selectedText(rows, bounds.start, bounds.end)).toBe('a   b');
  });
});
