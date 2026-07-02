import { headerRowCount } from '@libs/tui/layout.ts';

export const DEFAULT_COMPOSER_ROWS = 3;
export const BODY_CWD_GAP_ROWS = 1;

const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
const COMPOSER_ERROR_RESERVE_ROWS = 1;

export function resolveHomeScreenLayout(
  columns: number,
  rows: number,
  bodyEntryCount = Number.POSITIVE_INFINITY,
  composerRows = DEFAULT_COMPOSER_ROWS,
  cwdRows = 1
): { bodyRows: number; composerVisibleRows: number; cwdRows: number } {
  const headerRows = headerRowCount(columns);
  const resolvedCwdRows = Math.max(1, cwdRows);
  const statusRows = 1;
  const composerErrorReserveRows = COMPOSER_ERROR_RESERVE_ROWS;
  const minBodyRows = 1;
  // Fixed rows exclude the composer because it grows with wrapping/validation;
  // reserving one possible error row keeps the body from collapsing below 1 row.
  const fixedRows = headerRows + BODY_CWD_GAP_ROWS + resolvedCwdRows + statusRows;
  const maxComposerVisibleRows = Math.max(
    1,
    rows - fixedRows - COMPOSER_BACKGROUND_PADDING_ROWS - composerErrorReserveRows - minBodyRows
  );
  const maxBodyRows = rows - fixedRows - composerRows;

  return {
    bodyRows: Math.max(1, Math.min(maxBodyRows, bodyEntryCount + 1)),
    composerVisibleRows: maxComposerVisibleRows,
    cwdRows: resolvedCwdRows
  };
}
