import { describe, expect, it } from 'vitest';
import type { Tokens } from 'marked';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { renderCodeBlock } from '@libs/markdown/renderCodeBlock.ts';

describe('renderCodeBlock', () => {
  it('renders code with background fill and highlighted tokens', () => {
    const rows = renderCodeBlock(codeToken('const x = "ok";', 'js'), 40);

    expect(rows[0]).toMatchObject({ backgroundColorToken: 'messageBackground', fillColumns: true });
    expect(rows[0]?.segments?.some((segment) => segment.colorToken === 'warning')).toBe(true);
    expect(rows[0]?.segments?.some((segment) => segment.colorToken === 'accentGreen')).toBe(true);
  });

  it('renders unknown language blocks plain while preserving content', () => {
    const rows = renderCodeBlock(codeToken('  plain\n\ttext', 'wat'), 40);

    expect(rows.map((row) => row.text)).toEqual(['  plain', '\ttext']);
    expect(rows.every((row) => row.backgroundColorToken === 'messageBackground')).toBe(true);
  });

  it('grapheme-wraps over-wide lines without overflowing content width', () => {
    const rows = renderCodeBlock(codeToken('你好世界abc', undefined), 5);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => displayWidth(row.text) <= 5)).toBe(true);
  });

  it('renders empty blocks without crashing', () => {
    expect(renderCodeBlock(codeToken('', 'js'), 10)).toHaveLength(1);
  });
});

function codeToken(text: string, lang: string | undefined): Tokens.Code {
  return { raw: text, text, type: 'code', lang };
}
