import {
  COMPOSER_BACKGROUND_PADDING_ROWS,
  COMPOSER_MAX_HEIGHT_DIVISOR,
  POPUP_MAX_HEIGHT_DIVISOR
} from '@constants/ui.ts';
import { clamp } from '@libs/math/clamp.ts';

/** Rows occupied by the home-screen header when it is rendered. */
export const HEADER_ROWS = 1;
/** Rows occupied by the home-screen header when transcript content hides it. */
export const HIDDEN_HEADER_ROWS = 0;

/**
 * Alias for the visible home-screen header height, used by the docked-popup cap
 * formula and named to disambiguate it from the per-surface header rows
 * (theme/model = 3, memory = 4) that live as module-local constants inside each
 * surface component.
 */
export const HOME_HEADER_ROWS = HEADER_ROWS;

export const DEFAULT_COMPOSER_ROWS = 3;
/** Blank separator rows kept between the body area and the cwd row. */
export const BODY_CWD_GAP_ROWS = 2;

const COMPOSER_ERROR_RESERVE_ROWS = 1;

type HomeScreenLayoutOptions = {
  bodyEntryCount?: number;
  commandMenuRows?: number;
  composerRows?: number;
  cwdRows?: number;
  headerRows?: number;
  resumePanelRows?: number;
  rows: number;
};

/**
 * Resolves the home screen's vertical budget from the terminal `rows`, returning
 * the rows granted to the body, the composer's visible height, and the cwd line.
 *
 * `bodyEntryCount` caps the body at its content height (plus one) so short
 * transcripts do not reserve the whole pane. `headerRows`, `composerRows`,
 * `cwdRows`, and `commandMenuRows`/`resumePanelRows` are the current heights of
 * the pinned stack, whose rows come out of the body budget so the composer and
 * status row stay pinned to the bottom and the total never exceeds the canvas.
 */
export function resolveHomeScreenLayout({
  rows,
  bodyEntryCount = Number.POSITIVE_INFINITY,
  composerRows = DEFAULT_COMPOSER_ROWS,
  cwdRows = 1,
  commandMenuRows = 0,
  resumePanelRows = 0,
  headerRows = HEADER_ROWS
}: HomeScreenLayoutOptions): { bodyRows: number; composerVisibleRows: number; cwdRows: number } {
  const resolvedHeaderRows = Math.max(0, headerRows);
  const resolvedResumePanelRows = Math.max(0, resumePanelRows);
  if (resolvedResumePanelRows > 0) {
    const maxBodyRows = rows - resolvedHeaderRows - resolvedResumePanelRows;
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
  const fixedRows = resolvedHeaderRows + BODY_CWD_GAP_ROWS + resolvedCwdRows + statusRows;
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
 * Resolves the docked popup's footer-gap chrome. The blank spacer row above the
 * shortcut hint is unconditional chrome, dropped only in the degenerate case
 * where keeping it would leave zero selectable content rows — namely `/memory`
 * at the hard half-cap, where the in-content table header (`reservedContentRows`)
 * would consume the sole remaining row. There the gap yields its row so at least
 * one selectable row always renders. All other surfaces keep the gap
 * unconditionally (theme/model have no header; resume counts its header in
 * `chromeWithGap`, so it keeps two rows and never yields).
 *
 * `chromeWithGap` is the surface's chrome-row constant that counts the gap row;
 * `reservedContentRows` (default 0) is any non-selectable content row the surface
 * reserves inside its body (e.g. `/memory`'s table header). When the gap is
 * dropped the list reclaims that row (`chromeWithGap - 1`).
 */
export function resolveDockedFooterGap({
  panelRows,
  chromeWithGap,
  reservedContentRows = 0
}: {
  panelRows: number;
  chromeWithGap: number;
  reservedContentRows?: number;
}): { showFooterGap: boolean; chromeRows: number } {
  const selectableRowsWithGap = panelRows - chromeWithGap - reservedContentRows;
  const showFooterGap = selectableRowsWithGap >= 1;
  return { showFooterGap, chromeRows: showFooterGap ? chromeWithGap : chromeWithGap - 1 };
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

/**
 * Standard docked-popup scroll indicator for a window at `offset` over a list
 * with `maxOffset` (`= max(0, total - visible)`) scrollable rows: `''` when
 * nothing scrolls, `more ↓` at the top, `more ↑` at the bottom, `more ↑↓` in
 * between. Shared by every docked-surface footer so the indicator never drifts
 * across surfaces.
 */
export function positionIndicator(offset: number, maxOffset: number): string {
  if (maxOffset <= 0) {
    return '';
  }
  if (offset <= 0) {
    return 'more ↓';
  }
  if (offset >= maxOffset) {
    return 'more ↑';
  }
  return 'more ↑↓';
}
