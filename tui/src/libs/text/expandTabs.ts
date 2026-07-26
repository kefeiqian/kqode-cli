import { measureGraphemes } from '@libs/text/displayWidth.ts';

const DEFAULT_TAB_WIDTH = 4;

/** Expands tabs to stable display cells, resetting tab stops after newlines. */
export function expandTabs(
  text: string,
  tabWidth: number = DEFAULT_TAB_WIDTH
): string {
  const safeTabWidth = Math.max(1, tabWidth);
  let column = 0;
  let expanded = '';

  for (const grapheme of measureGraphemes(text)) {
    if (grapheme.segment === '\n') {
      expanded += '\n';
      column = 0;
      continue;
    }
    if (grapheme.segment === '\t') {
      const spaces = safeTabWidth - (column % safeTabWidth);
      expanded += ' '.repeat(spaces);
      column += spaces;
      continue;
    }

    expanded += grapheme.segment;
    column += grapheme.width;
  }

  return expanded;
}
