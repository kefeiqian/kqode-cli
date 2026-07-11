import { describe, expect, it } from 'vitest';
import { selectedText } from '@libs/selection/selectedText.ts';
import type { BodyRow } from '@libs/tui/bodyRows.ts';

function row(text: string, extra: Partial<BodyRow> = {}): BodyRow {
  return { text, ...extra };
}

describe('selectedText', () => {
  it('returns a substring for a single-row selection', () => {
    const rows = [row('hello world')];
    expect(selectedText(rows, { rowIndex: 0, column: 0 }, { rowIndex: 0, column: 5 })).toBe('hello');
  });

  it('joins a multi-row selection with newlines, clipping first and last rows', () => {
    const rows = [row('abcdef'), row('ghijkl'), row('mnopqr')];
    expect(selectedText(rows, { rowIndex: 0, column: 2 }, { rowIndex: 2, column: 3 })).toBe(
      'cdef\nghijkl\nmno'
    );
  });

  it('normalizes selection direction (focus before anchor)', () => {
    const rows = [row('abcdef'), row('ghijkl')];
    const forward = selectedText(rows, { rowIndex: 0, column: 1 }, { rowIndex: 1, column: 3 });
    const backward = selectedText(rows, { rowIndex: 1, column: 3 }, { rowIndex: 0, column: 1 });
    expect(backward).toBe(forward);
  });

  it('trims trailing whitespace so full-width padding never survives', () => {
    const rows = [row('text     ')];
    expect(selectedText(rows, { rowIndex: 0, column: 0 }, { rowIndex: 0, column: 9 })).toBe('text');
  });

  it('excludes a separate row marker from the copied text', () => {
    const rows = [row('answer', { marker: '• ' })];
    expect(selectedText(rows, { rowIndex: 0, column: 0 }, { rowIndex: 0, column: 8 })).toBe('answer');
  });

  it('rejoins soft-wrapped rows into one logical line', () => {
    const rows = [row('hello '), row('world', { continuesPrevious: true })];
    expect(selectedText(rows, { rowIndex: 0, column: 0 }, { rowIndex: 1, column: 5 })).toBe(
      'hello world'
    );
  });

  it('keeps whole graphemes when selecting across wide characters', () => {
    const rows = [row('你好world')];
    expect(selectedText(rows, { rowIndex: 0, column: 2 }, { rowIndex: 0, column: 6 })).toBe('好wo');
  });

  it('returns an empty string for a collapsed selection', () => {
    const rows = [row('hello')];
    expect(selectedText(rows, { rowIndex: 0, column: 3 }, { rowIndex: 0, column: 3 })).toBe('');
  });

  it('never picks up the scrollbar column, which is not part of row text', () => {
    const rows = [row('some content')];
    const text = selectedText(rows, { rowIndex: 0, column: 0 }, { rowIndex: 0, column: 40 });
    expect(text).toBe('some content');
    expect(text).not.toContain('│');
    expect(text).not.toContain('┃');
  });
});
