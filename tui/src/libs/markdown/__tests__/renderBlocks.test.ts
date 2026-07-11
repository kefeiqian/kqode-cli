import { describe, expect, it } from 'vitest';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { renderMarkdownContentRows } from '@libs/markdown/renderBlocks.ts';

describe('renderMarkdownContentRows', () => {
  it('renders all heading levels with distinct terminal treatments', () => {
    const rows = renderMarkdownContentRows(
      '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6',
      20
    );

    expect(rows.map((row) => row.text)).not.toContain('# H1');
    expect(rows[0]?.segments?.[0]).toMatchObject({ bold: true, colorToken: 'accentBlue' });
    expect(rows[1]?.text).toMatch(/^─+$/);
    expect(rows.some((row) => row.segments?.[0]?.colorToken === 'foreground')).toBe(true);
    expect(rows.some((row) => row.segments?.[0]?.colorToken === 'muted')).toBe(true);
  });

  it('renders nested unordered and ordered lists with indentation', () => {
    const rows = renderMarkdownContentRows('- one\n  - two\n1. first', 30);

    expect(rows.map((row) => row.text)).toEqual(['• one', '  • two', '1. first']);
  });

  it('clamps deep nested list indentation at narrow widths', () => {
    const rows = renderMarkdownContentRows('- a\n  - b\n    - c\n      - d', 10);

    expect(rows.every((row) => displayWidth(row.text) <= 10)).toBe(true);
  });

  it('renders blockquotes, horizontal rules, and composed inline styles', () => {
    const rows = renderMarkdownContentRows('> quoted\n\n---\n\n- **bold** and `code`', 20);

    expect(rows[0]?.text).toBe('│ quoted');
    expect(rows[0]?.segments?.[0]).toMatchObject({ colorToken: 'muted' });
    expect(rows.some((row) => row.text === '─'.repeat(20))).toBe(true);
    expect(rows.some((row) => row.segments?.some((segment) => segment.bold))).toBe(true);
    expect(
      rows.some((row) => row.segments?.some((segment) => segment.colorToken === 'accentGreen'))
    ).toBe(true);
  });

  it('renders code blocks and tables in-place with specialized renderers', () => {
    const rows = renderMarkdownContentRows('## A\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |', 40);

    expect(rows.map((row) => row.text)).toContain('const x = 1;');
    expect(rows.find((row) => row.text === 'const x = 1;')?.backgroundColorToken).toBeUndefined();
    expect(rows.some((row) => row.text.startsWith('┌'))).toBe(true);
  });
});
