import { atom } from 'jotai';
import { countBodyRows, DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';
import { countCwdRows } from '@libs/tui/cwdLine.ts';
import {
  BODY_CWD_GAP_ROWS,
  DEFAULT_COMPOSER_ROWS,
  HEADER_ROWS,
  resolveHomeScreenLayout
} from '@libs/tui/layout.ts';
import { clamp } from '@libs/math/clamp.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { bodyEntriesAtom } from '@state/ui/body.ts';
import { columnsAtom, rowsAtom } from '@state/ui/dimensions.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { commandMenuDesiredRowsAtom, commandMenuOpenAtom } from '@state/ui/commands/index.ts';

export const bodyScrollOffsetRowsAtom = atom(0);
export const composerRowsAtom = atom(DEFAULT_COMPOSER_ROWS);
export const submittedPromptEntriesAtom = atom<BodyEntry[]>([]);

/**
 * Rows the cwd line occupies in the layout. It collapses to `0` while the command
 * palette is open so the menu takes the cwd's place — the palette and the cwd are
 * never shown at once — and the freed row flows into the bottom spacer, keeping
 * the composer and status row pinned.
 */
export const cwdRowsAtom = atom((get) => {
  if (get(commandMenuOpenAtom)) {
    return 0;
  }
  return countCwdRows(get(workspaceCwdAtom), get(gitStatusLabelAtom), get(columnsAtom));
});

export const displayedBodyEntriesAtom = atom((get) => {
  const submittedPromptEntries = get(submittedPromptEntriesAtom);
  const baseBodyEntries = get(bodyEntriesAtom) ?? DEFAULT_BODY_ENTRIES;

  return submittedPromptEntries.length === 0
    ? baseBodyEntries
    : [...baseBodyEntries, ...submittedPromptEntries];
});

/**
 * Rows the open command menu actually occupies: the desired height (U2) clamped
 * to the rows free above a one-row-minimum body, so the menu is truncated or
 * suppressed rather than pushing the total past the canvas at small sizes.
 */
export const commandMenuRowsAtom = atom((get) => {
  const desired = get(commandMenuDesiredRowsAtom);
  if (desired === 0) {
    return 0;
  }

  const rows = get(rowsAtom);
  const composerRows = get(composerRowsAtom);
  const cwdRows = get(cwdRowsAtom);
  const freeMenuRows = Math.max(
    0,
    rows - HEADER_ROWS - BODY_CWD_GAP_ROWS - cwdRows - 1 - composerRows - 1
  );
  return Math.min(desired, freeMenuRows);
});

export const layoutAtom = atom((get) => {
  const columns = get(columnsAtom);
  const rows = get(rowsAtom);
  const composerRows = get(composerRowsAtom);
  const displayedBodyEntries = get(displayedBodyEntriesAtom);
  const bodyEntryRows = countBodyRows(displayedBodyEntries, columns, rows);

  return resolveHomeScreenLayout(
    rows,
    bodyEntryRows,
    composerRows,
    get(cwdRowsAtom),
    get(commandMenuRowsAtom)
  );
});

export const maxBodyScrollOffsetRowsAtom = atom((get) => {
  const columns = get(columnsAtom);
  const layout = get(layoutAtom);
  const bodyRowsForScroll = countBodyRows(get(displayedBodyEntriesAtom), columns, layout.bodyRows);

  return Math.max(0, bodyRowsForScroll - layout.bodyRows);
});

export const bottomSpacerRowsAtom = atom((get) => {
  const rows = get(rowsAtom);
  const layout = get(layoutAtom);
  const composerRows = get(composerRowsAtom);
  // Keep cwd/composer/status pinned to the bottom by giving every spare row to
  // the body-to-cwd spacer instead of allowing the body to push the prompt down.
  return Math.max(
    0,
    rows -
      HEADER_ROWS -
      layout.bodyRows -
      BODY_CWD_GAP_ROWS -
      layout.cwdRows -
      composerRows -
      1 -
      get(commandMenuRowsAtom)
  );
});

export const composerTopAtom = atom((get) => {
  const rows = get(rowsAtom);
  const composerRows = get(composerRowsAtom);
  // `rows` is a count while Ink cursor coordinates are zero-based; subtract the
  // status row plus the composer height to get the first composer text row.
  return rows - 1 - composerRows;
});

export const scrollBodyByRowsAtom = atom(null, (get, set, deltaRows: number) => {
  const maxBodyScrollOffsetRows = get(maxBodyScrollOffsetRowsAtom);
  set(bodyScrollOffsetRowsAtom, (current) =>
    clamp(current + deltaRows, 0, maxBodyScrollOffsetRows)
  );
});
