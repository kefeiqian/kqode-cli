import type { Tokens } from 'marked';
import { highlightCode } from '@libs/markdown/highlightCode.ts';
import type { MarkdownContentRow, StyledSegment } from '@libs/markdown/types.ts';
import { measureGraphemes } from '@libs/text/displayWidth.ts';

/**
 * Renders a fenced or indented code token as syntax-highlighted content rows.
 *
 * Code rows carry no background fill so the assistant transcript stays visually
 * distinct from the user prompt block (which owns `messageBackground`); code is
 * set apart by its highlight colors instead.
 */
export function renderCodeBlock(token: Tokens.Code, columns: number): MarkdownContentRow[] {
  const safeColumns = Math.max(1, columns);
  const highlighted = highlightCode(token.text, token.lang);
  return highlighted.lines.flatMap((line) =>
    hardWrapCodeLine(line.length === 0 ? [{ colorToken: 'foreground', text: '' }] : line, safeColumns)
  );
}

function hardWrapCodeLine(segments: StyledSegment[], columns: number): MarkdownContentRow[] {
  const rows: MarkdownContentRow[] = [];
  let row: StyledSegment[] = [];
  let width = 0;

  for (const segment of segments) {
    for (const grapheme of measureGraphemes(segment.text)) {
      if (width + grapheme.width > columns && row.length > 0) {
        rows.push(codeRow(row));
        row = [];
        width = 0;
      }
      row.push({ ...segment, text: grapheme.segment });
      width += grapheme.width;
    }
  }

  rows.push(codeRow(row.length === 0 ? [{ text: '' }] : row));
  return rows;
}

function codeRow(segments: StyledSegment[]): MarkdownContentRow {
  return {
    segments,
    text: segments.map((segment) => segment.text).join('')
  };
}
