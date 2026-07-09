import { describe, expect, it } from 'vitest';
import {
  clearHighlightCodeCache,
  highlightCodeCacheSize
} from '@libs/markdown/highlightCode.ts';
import { renderMarkdownContentRows } from '@libs/markdown/renderBlocks.ts';

describe('streaming markdown blocks', () => {
  it('formats completed blocks while leaving the trailing block plain', () => {
    const rows = renderMarkdownContentRows('## Steps\n\n1. First\n\n2. Sec', 40, {
      streaming: true
    });

    expect(rows[0]?.text).toBe('Steps');
    expect(rows[0]?.segments?.[0]?.bold).toBe(true);
    expect(rows.map((row) => row.text)).toContain('1. First');
    expect(rows.at(-1)?.text).toBe('2. Sec');
    expect(rows.at(-1)?.segments?.some((segment) => segment.bold)).toBe(false);
  });

  it('settles to full markdown rendering', () => {
    const rows = renderMarkdownContentRows('## Steps\n\n1. First\n\n2. Second', 40);

    expect(rows.map((row) => row.text)).toContain('2. Second');
    expect(rows.at(-1)?.segments?.[0]?.text).toBe('2. ');
  });

  it('keeps an open fence plain while streaming and highlights when closed', () => {
    const open = renderMarkdownContentRows('```rust\nfn main() {', 40, { streaming: true });
    const closed = renderMarkdownContentRows('```rust\nfn main() {}\n```', 40, { streaming: true });

    expect(open.map((row) => row.text)).toContain('```rust');
    expect(closed.some((row) => row.backgroundColorToken === 'messageBackground')).toBe(true);
  });

  it('does not grow the highlight cache for an already completed code block on later deltas', () => {
    clearHighlightCodeCache();
    const first = '```js\nconst x = 1;\n```\n\npartial';
    const second = '```js\nconst x = 1;\n```\n\npartial text';

    renderMarkdownContentRows(first, 40, { streaming: true });
    const afterFirst = highlightCodeCacheSize();
    renderMarkdownContentRows(second, 40, { streaming: true });

    expect(afterFirst).toBe(1);
    expect(highlightCodeCacheSize()).toBe(afterFirst);
  });
});
