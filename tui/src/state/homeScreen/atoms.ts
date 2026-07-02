import { atom } from 'jotai';
import { countBodyRows, DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';
import type { BodyEntry } from '@libs/tui/bodyRows.ts';
import { countCwdRows } from '@libs/tui/cwdLine.ts';
import { headerRowCount } from '@libs/tui/layout.ts';
import { clamp } from '@libs/math/clamp.ts';
import {
  bodyEntriesAtom,
  columnsAtom,
  gitStatusLabelAtom,
  rowsAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import {
  BODY_CWD_GAP_ROWS,
  DEFAULT_COMPOSER_ROWS,
  resolveHomeScreenLayout
} from '@state/homeScreen/layout.ts';

export const bodyScrollOffsetRowsAtom = atom(0);
export const composerRowsAtom = atom(DEFAULT_COMPOSER_ROWS);
export const submittedPromptEntriesAtom = atom<BodyEntry[]>([]);

export const displayedBodyEntriesAtom = atom((get) => {
  const submittedPromptEntries = get(submittedPromptEntriesAtom);
  const baseBodyEntries = get(bodyEntriesAtom) ?? DEFAULT_BODY_ENTRIES;

  return submittedPromptEntries.length === 0
    ? baseBodyEntries
    : [...baseBodyEntries, ...submittedPromptEntries];
});

export const layoutAtom = atom((get) => {
  const columns = get(columnsAtom);
  const rows = get(rowsAtom);
  const composerRows = get(composerRowsAtom);
  const displayedBodyEntries = get(displayedBodyEntriesAtom);
  const bodyEntryRows = countBodyRows(displayedBodyEntries, columns, rows);
  const gitStatusLabel = get(gitStatusLabelAtom);

  return resolveHomeScreenLayout(
    columns,
    rows,
    bodyEntryRows,
    composerRows,
    countCwdRows(get(workspaceCwdAtom), gitStatusLabel, columns)
  );
});

export const maxBodyScrollOffsetRowsAtom = atom((get) => {
  const columns = get(columnsAtom);
  const layout = get(layoutAtom);
  const bodyRowsForScroll = countBodyRows(get(displayedBodyEntriesAtom), columns, layout.bodyRows);

  return Math.max(0, bodyRowsForScroll - layout.bodyRows);
});

export const bottomSpacerRowsAtom = atom((get) => {
  const columns = get(columnsAtom);
  const rows = get(rowsAtom);
  const layout = get(layoutAtom);
  const composerRows = get(composerRowsAtom);
  // Keep cwd/composer/status pinned to the bottom by giving every spare row to
  // the body-to-cwd spacer instead of allowing the body to push the prompt down.
  return Math.max(
    0,
    rows -
      headerRowCount(columns) -
      layout.bodyRows -
      BODY_CWD_GAP_ROWS -
      layout.cwdRows -
      composerRows -
      1
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
