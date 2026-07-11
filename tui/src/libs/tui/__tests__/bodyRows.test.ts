import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { resolveBodyRows } from '@libs/tui/bodyRows.ts';
import { selectedText } from '@libs/selection/selectedText.ts';
import { DEFAULT_THEME, ThemeId, findTheme } from '@theme/themeConfig.ts';

const WIDE_COLUMNS = 80;
const TALL_ROWS = 40;

function rowTexts(kind: BodyEntryKind, text: string): string[] {
  return resolveBodyRows([{ kind, text }], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME).map(
    (row) => row.text
  );
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

  it('still wraps a single long line to the available width', () => {
    const texts = rowTexts(BodyEntryKind.Success, 'x'.repeat(WIDE_COLUMNS + 5));

    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((line) => line.length <= WIDE_COLUMNS)).toBe(true);
  });

  it('renders system guidance without an inline label', () => {
    const texts = rowTexts(BodyEntryKind.System, 'Use /connect to add a provider.');

    expect(texts).toContain('Use /connect to add a provider.');
    expect(texts.some((line) => line.startsWith('ERROR:'))).toBe(false);
    expect(texts.some((line) => line.startsWith('SYSTEM:'))).toBe(false);
  });
});

describe('resolveBodyRows theming and wrapping', () => {
  it('returns equal rows for an unchanged entry, width, and theme', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'stable text' };

    const first = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);
    const second = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);

    expect(second).toEqual(first);
  });

  it('recomputes wrapping when the column width changes', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'x'.repeat(30) };

    const wide = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);
    const narrow = resolveBodyRows([entry], 20, TALL_ROWS, DEFAULT_THEME);

    expect(narrow.length).toBeGreaterThan(wide.length);
  });

  it('does not reuse rows across distinct entry objects with equal content', () => {
    const a = { kind: BodyEntryKind.Assistant, text: 'same' };
    const b = { kind: BodyEntryKind.Assistant, text: 'same' };

    const rowsA = resolveBodyRows([a], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);
    const rowsB = resolveBodyRows([b], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);

    expect(rowsB).toEqual(rowsA);
  });

  it('applies the active theme colors on top of cached wrapping (covers AE3)', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'themed line' };
    const nord = findTheme(ThemeId.Nord);
    if (nord === undefined) {
      throw new Error('expected the Nord preset to exist');
    }

    const draculaRows = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);
    const nordRows = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, nord);

    // Same wrapped text, but theme-specific colors — never a stale cached color.
    expect(nordRows.map((row) => row.text)).toEqual(draculaRows.map((row) => row.text));
    expect(draculaRows[0].color).toBe(DEFAULT_THEME.colors.foreground);
    expect(nordRows[0].color).toBe(nord.colors.foreground);
    expect(nordRows[0].color).not.toBe(draculaRows[0].color);
  });

  it('resolves assistant segment colors from the active theme cache-free', () => {
    const entry = { kind: BodyEntryKind.Assistant, text: 'themed **source**' };
    const nord = findTheme(ThemeId.Nord);
    if (nord === undefined) {
      throw new Error('expected the Nord preset to exist');
    }

    const draculaRows = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, DEFAULT_THEME);
    const nordRows = resolveBodyRows([entry], WIDE_COLUMNS, TALL_ROWS, nord);

    expect(draculaRows[0].segments?.[0]).toMatchObject({
      color: DEFAULT_THEME.colors.foreground,
      text: 'themed'
    });
    expect(nordRows[0].segments?.[0]).toMatchObject({
      color: nord.colors.foreground,
      text: 'themed'
    });
  });

  it('renders assistant markdown while leaving source markers out of rows', () => {
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Assistant, text: '## Steps\n\n- **First** item' }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    expect(rows.map((row) => row.text)).toEqual(['Steps', '', '• First item']);
    expect(rows[0].segments?.[0]?.bold).toBe(true);
    expect(rows[2].segments?.some((segment) => segment.bold && segment.text === 'First')).toBe(
      true
    );
  });

  it('derives streaming markdown behavior from stream entry ids', () => {
    const streamRows = resolveBodyRows(
      [{ id: 'stream-1', kind: BodyEntryKind.Assistant, text: '## Done\n\n**partial' }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );
    const settledRows = resolveBodyRows(
      [{ id: 'result-1', kind: BodyEntryKind.Assistant, text: '## Done\n\n**partial**' }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    expect(streamRows[0].segments?.[0]?.bold).toBe(true);
    expect(streamRows.at(-1)?.text).toBe('**partial');
    expect(settledRows.at(-1)?.segments?.[0]?.bold).toBe(true);
  });
});

describe('resolveBodyRows soft-wrap continuation flags', () => {
  it('marks char-wrapped slices of a long plain line with an empty-separator continuation', () => {
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Success, text: 'y'.repeat(WIDE_COLUMNS + 5) }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].continuesPrevious).toBeUndefined();
    expect(rows[1].continuesPrevious).toBe('');
  });

  it('does not mark a hard line break as a continuation', () => {
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.User, text: 'alpha\nbeta' }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    const textRows = rows.filter(
      (row) => row.text.includes('alpha') || row.text.includes('beta')
    );
    expect(textRows).toHaveLength(2);
    expect(textRows.every((row) => row.continuesPrevious === undefined)).toBe(true);
  });

  it('marks assistant markdown word-wraps with a space separator', () => {
    const paragraph = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Assistant, text: paragraph }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].continuesPrevious).toBeUndefined();
    expect(rows[1].continuesPrevious).toBe(' ');
  });

  it('rejoins a wrapped assistant paragraph back to one logical line on copy', () => {
    const paragraph = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const rows = resolveBodyRows(
      [{ kind: BodyEntryKind.Assistant, text: paragraph }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    );

    const copied = selectedText(
      rows,
      { rowIndex: 0, column: 0 },
      { rowIndex: rows.length - 1, column: 999 }
    );

    expect(copied).toBe(paragraph);
    expect(copied).not.toContain('\n');
  });
});

describe('resolveBodyRows user prompt trailing whitespace', () => {
  const messageRowCount = (text: string): number =>
    resolveBodyRows(
      [{ kind: BodyEntryKind.User, text }],
      WIDE_COLUMNS,
      TALL_ROWS,
      DEFAULT_THEME
    ).filter((row) => row.backgroundColor === DEFAULT_THEME.colors.messageBackground).length;

  it('does not add a phantom empty message row for a trailing newline', () => {
    expect(messageRowCount('hello\n')).toBe(messageRowCount('hello'));
  });

  it('does not add phantom empty message rows for multiple trailing blank lines', () => {
    expect(messageRowCount('hello\n\n\n')).toBe(messageRowCount('hello'));
  });

  it('preserves interior blank lines in a prompt', () => {
    expect(messageRowCount('alpha\n\nbeta')).toBe(3);
  });
});
