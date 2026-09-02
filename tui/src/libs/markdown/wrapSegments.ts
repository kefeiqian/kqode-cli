import { displayWidth, measureGraphemes } from '@libs/text/displayWidth.ts';
import type { StyledSegment } from '@libs/markdown/types.ts';

type Piece = StyledSegment & { width: number };

/** Wraps styled inline segments into terminal-width visual rows. */
export function wrapSegments(segments: readonly StyledSegment[], columns: number): StyledSegment[][] {
  const safeColumns = Math.max(1, columns);
  const rows: StyledSegment[][] = [];
  let row: StyledSegment[] = [];
  let rowWidth = 0;

  for (const piece of splitPieces(segments)) {
    if (piece.text.length === 0) {
      continue;
    }
    if (piece.width > safeColumns) {
      if (row.length > 0) {
        rows.push(trimTrailingWhitespace(row));
        row = [];
        rowWidth = 0;
      }
      ({ row, rowWidth } = appendLongPiece(rows, row, rowWidth, piece, safeColumns));
      continue;
    }
    if (rowWidth + piece.width > safeColumns && row.length > 0) {
      rows.push(trimTrailingWhitespace(row));
      row = [];
      rowWidth = 0;
      if (/^\s+$/.test(piece.text)) {
        continue;
      }
    }
    row.push(withoutWidth(piece));
    rowWidth += piece.width;
  }

  rows.push(trimTrailingWhitespace(row));
  return rows.length === 0 ? [[]] : rows;
}

function splitPieces(segments: readonly StyledSegment[]): Piece[] {
  const pieces: Piece[] = [];
  for (const segment of segments) {
    const matches = segment.text.matchAll(/\s+|\S+/gu);
    for (const match of matches) {
      pieces.push({ ...segment, text: match[0], width: displayWidth(match[0]) });
    }
  }
  return pieces;
}

function appendLongPiece(
  rows: StyledSegment[][],
  row: StyledSegment[],
  rowWidth: number,
  piece: Piece,
  columns: number
): { row: StyledSegment[]; rowWidth: number } {
  let currentRow = row;
  let currentWidth = rowWidth;
  let text = piece.text;

  while (text.length > 0) {
    const available = currentRow.length === 0 ? columns : columns - currentWidth;
    const { head, tail, width } = takeGraphemeWidth(text, Math.max(1, available));
    if (head.length === 0) {
      rows.push(trimTrailingWhitespace(currentRow));
      currentRow = [];
      currentWidth = 0;
      continue;
    }
    currentRow.push(withoutWidth({ ...piece, text: head, width }));
    currentWidth += width;
    text = tail;
    if (text.length > 0) {
      rows.push(trimTrailingWhitespace(currentRow));
      currentRow = [];
      currentWidth = 0;
    }
  }

  return { row: currentRow, rowWidth: currentWidth };
}

function takeGraphemeWidth(
  text: string,
  columns: number
): { head: string; tail: string; width: number } {
  let end = 0;
  let width = 0;
  for (const grapheme of measureGraphemes(text)) {
    if (width + grapheme.width > columns && end > 0) {
      break;
    }
    width += grapheme.width;
    end = grapheme.end;
    if (width >= columns) {
      break;
    }
  }
  return { head: text.slice(0, end), tail: text.slice(end), width };
}

function trimTrailingWhitespace(row: StyledSegment[]): StyledSegment[] {
  const trimmed = [...row];
  while (trimmed.length > 0 && /^\s+$/.test(trimmed[trimmed.length - 1]?.text ?? '')) {
    trimmed.pop();
  }
  return trimmed;
}

function withoutWidth(piece: Piece): StyledSegment {
  const { width: _width, ...segment } = piece;
  return segment;
}
