import {
  COMPOSER_BACKGROUND_PADDING_ROWS,
  COMPOSER_MAX_HEIGHT_DIVISOR,
  POPUP_MAX_HEIGHT_DIVISOR
} from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';

/**
 * Rows occupied by the always-visible home-screen header (product name +
 * version). The app only renders at or above `MIN_COLUMNS`, so the header no
 * longer degrades to a compact or hidden variant and always takes one row.
 */
export const HEADER_ROWS = 1;

/**
 * Alias for the home-screen header height, used by the docked-popup cap formula
 * and named to disambiguate it from the per-surface header rows (theme/model = 3,
 * memory = 4) that live as module-local constants inside each surface component.
 */
export const HOME_HEADER_ROWS = HEADER_ROWS;

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

/**
 * Caps a docked command popup's total height (accent separator + content +
 * footer) to at most half the terminal (`⌊rows / POPUP_MAX_HEIGHT_DIVISOR⌋`),
 * never below one row and never so tall that fewer than one transcript row
 * remains above it. `desiredRows` is the panel's content-derived height; the
 * result is the rows actually reserved for the panel (`0` when nothing is
 * docked).
 */
export function resolveDockedPanelRows({
  rows,
  desiredRows
}: {
  rows: number;
  desiredRows: number;
}): number {
  if (desiredRows <= 0) {
    return 0;
  }
  const halfCap = Math.floor(rows / POPUP_MAX_HEIGHT_DIVISOR);
  const bodyPreservingCap = rows - HOME_HEADER_ROWS - 1;
  return clamp(Math.min(desiredRows, halfCap), 1, Math.max(1, bodyPreservingCap));
}

/**
 * Minimal scroll offset that keeps `index` visible inside a `visible`-row window
 * over `total` items: unchanged while the index is already in view, otherwise
 * scrolled just far enough to bring it to the nearest edge, clamped to
 * `[0, maxOffset]`. Extracted from the identical clamp expression previously
 * duplicated across the resume/memory/model highlight movers.
 */
export function resolveWindowOffset({
  index,
  offset,
  visible,
  total
}: {
  index: number;
  offset: number;
  visible: number;
  total: number;
}): number {
  const maxOffset = Math.max(0, total - visible);
  return clamp(index < offset ? index : Math.max(offset, index - visible + 1), 0, maxOffset);
}
