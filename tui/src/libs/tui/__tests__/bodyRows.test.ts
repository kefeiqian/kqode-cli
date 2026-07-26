import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { resolveBodyRows } from '@libs/tui/bodyRows.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';

const WIDE_COLUMNS = 80;
const TALL_ROWS = 40;

function rowTexts(kind: BodyEntryKind, text: string): string[] {
  return resolveBodyRows([{ kind, text }], WIDE_COLUMNS, TALL_ROWS).map((row) => row.text);
}

describe('resolveBodyRows hard line breaks', () => {
  it('keeps a multi-line backend success result on separate rows', () => {
    const texts = rowTexts(
      BodyEntryKind.Success,
      'Rust backend ACK - received: 1231351365\n1361631'
    );

    expect(texts).toContain('Rust backend ACK - received: 1231351365');
    expect(texts).toContain('1361631');
    expect(texts.some((line) => line.includes('1231351365 1361631'))).toBe(false);
  });

  it('keeps multi-line error output on separate rows', () => {
    const texts = rowTexts(BodyEntryKind.Error, 'first line\nsecond line');

    expect(texts).toContain('ERROR: first line');
    expect(texts).toContain('second line');
  });

  it('preserves author line breaks for multi-line prompts', () => {
    const texts = rowTexts(BodyEntryKind.User, '1231351365\n1361631');

    expect(texts.some((line) => line.includes('1231351365') && !line.includes('1361631'))).toBe(
      true
    );
    expect(texts.some((line) => line.includes('1361631') && !line.includes('1231351365'))).toBe(
      true
    );
  });

  it('renders user messages without decorative borders in Terminal.app', () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    try {
      const rows = resolveBodyRows(
        [{ kind: BodyEntryKind.User, text: 'hello' }],
        WIDE_COLUMNS,
        TALL_ROWS
      );
      expect(rows).toHaveLength(1);
      expect(`${rows[0]?.marker}${rows[0]?.text}`).toBe('  ❯ hello');
    } finally {
      if (previousTermProgram === undefined) {
        delete process.env.TERM_PROGRAM;
      } else {
        process.env.TERM_PROGRAM = previousTermProgram;
      }
    }
  });

  it('still wraps a single long line to the available width', () => {
    const texts = rowTexts(BodyEntryKind.Success, 'x'.repeat(WIDE_COLUMNS + 5));

    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((line) => line.length <= WIDE_COLUMNS)).toBe(true);
  });

  it('wraps wide and multi-code-point graphemes by terminal display width', () => {
    const text = `界界界${'👨‍💻'}a`;
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Success, text }],
      5,
      TALL_ROWS
    );

    expect(rows.map((row) => row.text).join('')).toBe(text);
    expect(rows.every((row) => displayWidth(row.text) <= 5)).toBe(true);
  });

  it('expands tabs before wrapping so selection columns match rendered cells', () => {
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Assistant, text: 'a\tb' }],
      12,
      TALL_ROWS
    );

    expect(rows[0]?.text).toBe('a   b');
  });
});

describe('resolveBodyRows memoization', () => {
  it('returns the same row objects for an unchanged entry and width', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'stable text' };

    const first = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS);
    const second = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS);

    expect(second[0]).toBe(first[0]);
    expect(second).toEqual(first);
  });

  it('recomputes fresh rows when the column width changes', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'stable text' };

    const wide = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS);
    const narrow = resolveBodyRows([entry], 20, TALL_ROWS);

    expect(narrow[0]).not.toBe(wide[0]);
  });

  it('does not reuse rows across distinct entry objects with equal content', () => {
    const a = { kind: BodyEntryKind.Assistant, text: 'same' };
    const b = { kind: BodyEntryKind.Assistant, text: 'same' };

    const rowsA = resolveBodyRows([a], WIDE_COLUMNS, TALL_ROWS);
    const rowsB = resolveBodyRows([b], WIDE_COLUMNS, TALL_ROWS);

    expect(rowsB[0]).not.toBe(rowsA[0]);
    expect(rowsB).toEqual(rowsA);
  });
});
