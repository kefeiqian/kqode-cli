import { COMPOSER_BACKGROUND_PADDING_ROWS } from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';

type WrappedPromptRow = {
  text: string;
  start: number;
  end: number;
};

export type VisiblePromptView = {
  text: string;
  cursorIndex: number;
};

export function formatVisiblePrompt(
  text: string,
  columns: number,
  maxVisibleLines: number
): string {
  return formatVisiblePromptView(text, columns, maxVisibleLines, text.length).text;
}

export function formatVisiblePromptView(
  text: string,
  columns: number,
  maxVisibleLines: number,
  cursorIndex: number
): VisiblePromptView {
  const safeColumns = Math.max(1, columns);
  const safeMaxVisibleLines = Math.max(1, maxVisibleLines);
  const rows = wrapText(text, safeColumns);
  const safeCursorIndex = clamp(cursorIndex, 0, text.length);
  const cursorRowIndex = resolveCursorRowIndex(rows, safeCursorIndex);
  const lastVisibleStart = Math.max(0, rows.length - safeMaxVisibleLines);
  // Keep the active cursor row visible by sliding the window upward only when
  // the cursor would otherwise fall below the last visible composer row.
  const visibleStart = clamp(cursorRowIndex - safeMaxVisibleLines + 1, 0, lastVisibleStart);
  const visibleRows = rows.slice(visibleStart, visibleStart + safeMaxVisibleLines);
  const visibleCursorIndex = resolveVisibleCursorIndex(visibleRows, safeCursorIndex);

  return {
    text: visibleRows.map((row) => row.text).join('\n'),
    cursorIndex: visibleCursorIndex
  };
}

export function countVisibleComposerRows(
  visibleText: string,
  hasValidationError: boolean,
  hasBackgroundPadding: boolean
): number {
  return (
    visibleText.split('\n').length +
    (hasValidationError ? 1 : 0) +
    (hasBackgroundPadding ? COMPOSER_BACKGROUND_PADDING_ROWS : 0)
  );
}

export function formatValidationError(error: string, columns: number, shouldPad: boolean): string {
  const errorLine = `ERROR: ${error}`;
  return shouldPad ? errorLine.padEnd(columns, ' ') : errorLine;
}

function wrapText(text: string, columns: number): WrappedPromptRow[] {
  if (text.length === 0) {
    return [{ text: '', start: 0, end: 0 }];
  }

  const rows: WrappedPromptRow[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex < 0 ? text.length : newlineIndex;
    const rawLine = text.slice(lineStart, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.length === 0) {
      rows.push({ text: '', start: lineStart, end: lineStart });
    } else {
      for (let offset = 0; offset < line.length; offset += columns) {
        const endOffset = Math.min(offset + columns, line.length);
        rows.push({
          text: line.slice(offset, endOffset),
          start: lineStart + offset,
          end: lineStart + endOffset
        });
      }
    }

    if (newlineIndex < 0) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return rows;
}

function resolveCursorRowIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  return Math.max(
    0,
    rows.findIndex((row) => cursorIndex >= row.start && cursorIndex <= row.end)
  );
}

function resolveVisibleCursorIndex(rows: WrappedPromptRow[], cursorIndex: number): number {
  let visibleCursorIndex = 0;

  for (const row of rows) {
    if (cursorIndex >= row.start && cursorIndex <= row.end) {
      return visibleCursorIndex + Math.min(row.text.length, cursorIndex - row.start);
    }

    visibleCursorIndex += row.text.length + 1;
  }

  return Math.max(0, visibleCursorIndex - 1);
}
