import {
  COMPOSER_BACKGROUND_PADDING_ROWS,
  COMPOSER_MAX_HEIGHT_DIVISOR
} from '@constants/ui.ts';

/**
 * Rows occupied by the always-visible home-screen header (product name +
 * version). The app only renders at or above `MIN_COLUMNS`, so the header no
 * longer degrades to a compact or hidden variant and always takes one row.
 */
export const HEADER_ROWS = 1;

export const DEFAULT_COMPOSER_ROWS = 3;
export const BODY_CWD_GAP_ROWS = 1;

const COMPOSER_ERROR_RESERVE_ROWS = 1;

/**
 * Resolves the home screen's vertical budget from the terminal `rows`, returning
 * the rows granted to the body, the composer's visible height, and the cwd line.
 *
 * `bodyEntryCount` caps the body at its content height (plus one) so short
 * transcripts do not reserve the whole pane. `composerRows`, `cwdRows`, and
 * `commandMenuRows`/`resumePanelRows` are the current heights of the pinned bottom stack, whose
 * rows come out of the body budget so the composer and status row stay pinned to
 * the bottom and the total never exceeds the canvas.
 */
export function resolveHomeScreenLayout(
  rows: number,
  bodyEntryCount = Number.POSITIVE_INFINITY,
  composerRows = DEFAULT_COMPOSER_ROWS,
  cwdRows = 1,
  commandMenuRows = 0,
  resumePanelRows = 0
): { bodyRows: number; composerVisibleRows: number; cwdRows: number } {
  const headerRows = HEADER_ROWS;
  const resolvedResumePanelRows = Math.max(0, resumePanelRows);
  if (resolvedResumePanelRows > 0) {
    const maxBodyRows = rows - headerRows - resolvedResumePanelRows;
    return {
      bodyRows: Math.max(1, Math.min(maxBodyRows, bodyEntryCount + 1)),
      composerVisibleRows: 1,
      cwdRows: 0
    };
  }

  const resolvedCwdRows = Math.max(0, cwdRows);
  const statusRows = 1;
  const composerErrorReserveRows = COMPOSER_ERROR_RESERVE_ROWS;
  const minBodyRows = 1;
  // Fixed rows exclude the composer because it grows with wrapping/validation;
  // reserving one possible error row keeps the body from collapsing below 1 row.
  const fixedRows = headerRows + BODY_CWD_GAP_ROWS + resolvedCwdRows + statusRows;
  // Cap the composer's visible text rows so the whole box (text + background
  // padding + reserved error row) never exceeds `rows / COMPOSER_MAX_HEIGHT_DIVISOR`
  // (half the terminal), keeping the transcript visible. The `min` with the
  // body-preserving budget only ever shrinks the composer, so the total can
  // never over-subscribe the canvas.
  const maxComposerVisibleRows = Math.max(
    1,
    Math.min(
      rows - fixedRows - COMPOSER_BACKGROUND_PADDING_ROWS - composerErrorReserveRows - minBodyRows,
      Math.floor(rows / COMPOSER_MAX_HEIGHT_DIVISOR) -
        COMPOSER_BACKGROUND_PADDING_ROWS -
        composerErrorReserveRows
    )
  );
  // The command menu (when open) renders above the composer; its rows come out
  // of the body budget so the composer and status stay pinned to the bottom and
  // the total never exceeds the canvas.
  const maxBodyRows = rows - fixedRows - composerRows - commandMenuRows;

  return {
    bodyRows: Math.max(1, Math.min(maxBodyRows, bodyEntryCount + 1)),
    composerVisibleRows: maxComposerVisibleRows,
    cwdRows: resolvedCwdRows
  };
}
