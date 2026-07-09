import type { Tokens } from 'marked';
import { renderInlineTokens } from '@libs/markdown/renderInline.ts';
import type { MarkdownContentRow, StyledSegment } from '@libs/markdown/types.ts';
import { wrapSegments } from '@libs/markdown/wrapSegments.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';

type Align = Tokens.TableCell['align'];

const MIN_COLUMN_WIDTH = 3;

/** Renders a GFM table into bordered content rows that fit `columns`. */
export function renderTable(token: Tokens.Table, columns: number): MarkdownContentRow[] {
  const safeColumns = Math.max(1, columns);
  const rows = [token.header, ...token.rows];
  const columnCount = Math.max(token.header.length, ...token.rows.map((row) => row.length));
  if (columnCount === 0) return [];

  const widths = fitColumnWidths(rows, columnCount, safeColumns);
  const aligns = Array.from({ length: columnCount }, (_, index) => token.align[index] ?? null);
  if (tableWidth(widths) > safeColumns) return fallbackPlainRows(token, safeColumns);

  return [
    borderRow('┌', '┬', '┐', widths),
    ...renderBodyRow(token.header, widths, aligns),
    borderRow('├', '┼', '┤', widths),
    ...token.rows.flatMap((row) => renderBodyRow(row, widths, aligns)),
    borderRow('└', '┴', '┘', widths)
  ];
}

function fitColumnWidths(
  rows: readonly Tokens.TableCell[][],
  columnCount: number,
  columns: number
): number[] {
  const natural = Array.from({ length: columnCount }, (_, column) =>
    Math.max(1, ...rows.map((row) => displayWidth(row[column]?.text ?? '')))
  );
  const overhead = columnCount * 3 + 1;
  const available = columns - overhead;
  if (available >= natural.reduce((sum, width) => sum + width, 0)) return natural;

  const floor = Math.max(1, Math.min(MIN_COLUMN_WIDTH, Math.floor(available / columnCount)));
  const totalNatural = natural.reduce((sum, width) => sum + width, 0);
  let widths = natural.map((width) => Math.max(floor, Math.floor((width / totalNatural) * available)));
  while (widths.reduce((sum, width) => sum + width, 0) < available) {
    const growIndex = widths.indexOf(Math.min(...widths));
    widths[growIndex] += 1;
  }
  return widths;
}

function renderBodyRow(
  cells: readonly Tokens.TableCell[],
  widths: readonly number[],
  aligns: readonly Align[]
): MarkdownContentRow[] {
  const wrappedCells = widths.map((width, index) =>
    wrapSegments(renderInlineTokens(cells[index]?.tokens ?? [], { colorToken: 'foreground' }), width)
  );
  const height = Math.max(...wrappedCells.map((cell) => cell.length));
  return Array.from({ length: height }, (_, lineIndex) => {
    const segments: StyledSegment[] = [{ colorToken: 'border', text: '│' }];
    widths.forEach((width, column) => {
      const cellLine = wrappedCells[column]?.[lineIndex] ?? [];
      segments.push({ text: ' ' }, ...alignSegments(cellLine, width, aligns[column]), {
        text: ' '
      });
      segments.push({ colorToken: 'border', text: '│' });
    });
    return tableRow(segments);
  });
}

function alignSegments(
  segments: readonly StyledSegment[],
  width: number,
  align: Align
): StyledSegment[] {
  const textWidth = displayWidth(segments.map((segment) => segment.text).join(''));
  const padding = Math.max(0, width - textWidth);
  const left = align === 'right' ? padding : align === 'center' ? Math.floor(padding / 2) : 0;
  const right = padding - left;
  return [{ text: ' '.repeat(left) }, ...segments, { text: ' '.repeat(right) }];
}

function borderRow(left: string, join: string, right: string, widths: readonly number[]): MarkdownContentRow {
  return tableRow([
    { colorToken: 'border', text: left },
    ...widths.flatMap((width, index) => [
      { colorToken: 'border' as const, text: '─'.repeat(width + 2) },
      { colorToken: 'border' as const, text: index === widths.length - 1 ? right : join }
    ])
  ]);
}

function tableRow(segments: StyledSegment[]): MarkdownContentRow {
  return { segments, text: segments.map((segment) => segment.text).join('') };
}

function tableWidth(widths: readonly number[]): number {
  return widths.reduce((sum, width) => sum + width + 3, 1);
}

function fallbackPlainRows(token: Tokens.Table, columns: number): MarkdownContentRow[] {
  return token.raw.split(/\r\n|\r|\n/).map((line) => ({
    segments: [{ colorToken: 'foreground', text: line.slice(0, columns) }],
    text: line.slice(0, columns)
  }));
}
