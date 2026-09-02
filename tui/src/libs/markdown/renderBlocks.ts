import type { Token, Tokens } from 'marked';
import {
  parseBlocks,
  splitStreamingMarkdown,
  tokenPlainText
} from '@libs/markdown/parseBlocks.ts';
import { convertLatexToUnicode } from '@libs/markdown/latexToUnicode.ts';
import { renderCodeBlock } from '@libs/markdown/renderCodeBlock.ts';
import { renderTable } from '@libs/markdown/renderTable.ts';
import { renderInline, renderInlineTokens } from '@libs/markdown/renderInline.ts';
import type { MarkdownContentRow, StyledSegment, ThemeColorToken } from '@libs/markdown/types.ts';
import { wrapSegments } from '@libs/markdown/wrapSegments.ts';

const MIN_NESTED_CONTENT_COLUMNS = 20;

/** Renders markdown into one content row per visual terminal row. */
export function renderMarkdownContentRows(
  markdown: string,
  columns: number,
  options: { streaming?: boolean } = {}
): MarkdownContentRow[] {
  const safeColumns = Math.max(1, columns);
  if (options.streaming === true) {
    const { completed, trailing } = splitStreamingMarkdown(markdown);
    return [
      ...(completed.length > 0 ? renderTokens(parseBlocks(convertLatexToUnicode(completed)), safeColumns, 0) : []),
      ...(trailing.length > 0 ? plainRows(trailing.replace(/^\n+/, ''), safeColumns) : [])
    ];
  }
  return renderTokens(parseBlocks(convertLatexToUnicode(markdown)), safeColumns, 0);
}

function renderTokens(tokens: readonly Token[], columns: number, depth: number): MarkdownContentRow[] {
  const rows: MarkdownContentRow[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        if (token.raw.includes('\n\n')) rows.push(textRow(''));
        break;
      case 'heading':
        rows.push(...renderHeading(token as Tokens.Heading, columns));
        break;
      case 'paragraph':
      case 'text':
        rows.push(
          ...wrappedRows(renderInlineTokens(token.tokens ?? [], { colorToken: 'foreground' }), columns)
        );
        break;
      case 'list':
        rows.push(...renderList(token as Tokens.List, columns, depth));
        break;
      case 'blockquote':
        rows.push(...renderBlockquote(token as Tokens.Blockquote, columns, depth));
        break;
      case 'hr':
        rows.push(textRow('─'.repeat(columns), 'border'));
        break;
      case 'code':
        rows.push(...renderCodeBlock(token as Tokens.Code, columns));
        break;
      case 'table':
        rows.push(...renderTable(token as Tokens.Table, columns));
        break;
      case 'html':
        rows.push(...plainRows(tokenPlainText(token), columns));
        break;
      default:
        rows.push(...plainRows(tokenPlainText(token), columns));
    }
  }
  return rows.length === 0 ? [textRow('')] : rows;
}

function renderHeading(token: Tokens.Heading, columns: number): MarkdownContentRow[] {
  const tokenForDepth: ThemeColorToken =
    token.depth <= 2 ? 'accentBlue' : token.depth === 3 ? 'foreground' : 'muted';
  const rows = wrappedRows(
    renderInlineTokens(token.tokens, { bold: true, colorToken: tokenForDepth }),
    columns
  );
  if (token.depth === 1) {
    rows.push(textRow('─'.repeat(columns), 'accentBlue'));
  }
  return rows;
}

function renderList(token: Tokens.List, columns: number, depth: number): MarkdownContentRow[] {
  const rows: MarkdownContentRow[] = [];
  token.items.forEach((item, index) => {
    const ordinal = typeof token.start === 'number' ? token.start + index : index + 1;
    const marker = token.ordered ? `${ordinal}. ` : '• ';
    const indent = clampedIndent(depth, columns);
    const markerPrefix = `${' '.repeat(indent)}${marker}`;
    const childColumns = Math.max(1, columns - markerPrefix.length);
    const first = item.tokens[0];
    const itemText =
      first?.type === 'text' || first?.type === 'paragraph'
        ? renderInlineTokens(first.tokens ?? [], { colorToken: 'foreground' })
        : renderInline(item.text);
    const itemRows = wrappedRows(itemText, childColumns);
    itemRows.forEach((row, rowIndex) => {
      rows.push(prefixRow(row, rowIndex === 0 ? markerPrefix : ' '.repeat(markerPrefix.length)));
    });
    rows.push(...renderTokens(item.tokens.slice(1), columns, depth + 1).filter((row) => row.text !== ''));
  });
  return rows;
}

function renderBlockquote(token: Tokens.Blockquote, columns: number, depth: number): MarkdownContentRow[] {
  const prefix = `${' '.repeat(clampedIndent(depth, columns))}│ `;
  return renderTokens(token.tokens, Math.max(1, columns - prefix.length), depth).map((row) =>
    prefixRow(row, prefix, 'muted')
  );
}

function wrappedRows(segments: StyledSegment[], columns: number): MarkdownContentRow[] {
  return splitHardBreaks(segments).flatMap((line) => {
    // `wrapSegments` breaks at word boundaries (consuming the whitespace) or,
    // for words wider than `columns`, mid-word. Recover the separator each break
    // consumed by matching every wrapped row back into the original line: the gap
    // is `' '` for a word-wrap boundary and empty for a mid-word split, so copy
    // rejoins the logical line faithfully.
    const originalText = line.map((segment) => segment.text).join('');
    let cursor = 0;
    return wrapSegments(line, columns).map((row, index): MarkdownContentRow => {
      const text = row.map((segment) => segment.text).join('');
      const foundAt = text.length === 0 ? cursor : originalText.indexOf(text, cursor);
      const start = foundAt < 0 ? cursor : foundAt;
      const continuesPrevious = index === 0 ? undefined : originalText.slice(cursor, start);
      cursor = start + text.length;
      return {
        continuesPrevious,
        segments: row.length === 0 ? [{ text: '' }] : row,
        text
      };
    });
  });
}

function splitHardBreaks(segments: StyledSegment[]): StyledSegment[][] {
  const lines: StyledSegment[][] = [[]];
  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1]?.push({ ...segment, text: part });
    });
  }
  return lines;
}

function plainRows(text: string, columns: number): MarkdownContentRow[] {
  return text.split(/\r\n|\r|\n/).flatMap((line) => wrappedRows([{ text: line }], columns));
}

function prefixRow(
  row: MarkdownContentRow,
  prefix: string,
  colorToken?: ThemeColorToken
): MarkdownContentRow {
  return {
    ...row,
    segments: [{ colorToken, text: prefix }, ...(row.segments ?? [{ text: row.text }])],
    text: `${prefix}${row.text}`
  };
}

function textRow(text: string, colorToken: ThemeColorToken = 'foreground'): MarkdownContentRow {
  return { colorToken, segments: [{ colorToken, text }], text };
}

function clampedIndent(depth: number, columns: number): number {
  return Math.min(depth * 2, Math.max(0, columns - MIN_NESTED_CONTENT_COLUMNS));
}
