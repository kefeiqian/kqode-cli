import { describe, expect, it } from 'vitest';
import type { Tokens } from 'marked';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { parseBlocks } from '@libs/markdown/parseBlocks.ts';
import { renderMarkdownContentRows } from '@libs/markdown/renderBlocks.ts';
import { renderTable } from '@libs/markdown/renderTable.ts';

describe('renderTable', () => {
  it('renders aligned bordered columns', () => {
    const rows = renderTable(table('| A | B | C |\n| :- | :-: | -: |\n| x | y | z |'), 40);

    expect(rows[0]?.text).toMatch(/^┌/);
    expect(rows[1]?.text).toContain(' A ');
    expect(rows[1]?.text).toContain(' B ');
    expect(rows[1]?.text).toContain(' C ');
    expect(rows.at(-1)?.text).toMatch(/^└/);
  });

  it('scales and wraps over-wide cells within the content width', () => {
    const rows = renderTable(
      table('| Long | Value |\n| - | - |\n| supercalifragilistic | another long cell value |'),
      24
    );

    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((row) => displayWidth(row.text) <= 24)).toBe(true);
  });

  it('handles ragged rows without crashing', () => {
    const rows = renderTable(table('| A | B |\n| - | - |\n| only |'), 20);

    expect(rows.some((row) => row.text.includes('only'))).toBe(true);
  });

  it('keeps count deterministic through body row rendering', () => {
    const markdown = '| A | B |\n| - | - |\n| one two three four | five six seven eight |';
    const rows = renderMarkdownContentRows(markdown, 30);
    const narrower = renderMarkdownContentRows(markdown, 29);

    expect(rows.every((row) => displayWidth(row.text) <= 30)).toBe(true);
    expect(narrower.every((row) => displayWidth(row.text) <= 29)).toBe(true);
  });
});

function table(markdown: string): Tokens.Table {
  const token = parseBlocks(markdown).find((candidate) => candidate.type === 'table');
  if (token?.type !== 'table') throw new Error('expected a table token');
  return token as Tokens.Table;
}
