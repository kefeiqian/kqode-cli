import { atom } from 'jotai';
import { countBodyRows } from '@libs/tui/bodyRows.ts';
import { countCwdRows } from '@libs/tui/cwdLine.ts';
import {
  BODY_CWD_GAP_ROWS,
  DEFAULT_COMPOSER_ROWS,
  HEADER_ROWS,
  resolveHomeScreenLayout
} from '@libs/tui/layout.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { displayedBodyEntriesAtom } from '@state/ui/body.ts';
import { commandMenuDesiredRowsAtom, commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/dimensions.ts';
import { gitStatusAtom } from '@state/ui/gitStatus.ts';

export const composerRowsAtom = atom(DEFAULT_COMPOSER_ROWS);

/** Rows occupied by cwd, collapsing while the command palette replaces it. */
export const cwdRowsAtom = atom((get) =>
  get(commandMenuOpenAtom)
    ? 0
    : countCwdRows(get(workspaceCwdAtom), get(gitStatusAtom), get(columnsAtom))
);

/** Command-menu height clamped to the space above a one-row-minimum body. */
export const commandMenuRowsAtom = atom((get) => {
  const desired = get(commandMenuDesiredRowsAtom);
  if (desired === 0) return 0;

  const freeMenuRows = Math.max(
    0,
    get(rowsAtom) -
      HEADER_ROWS -
      BODY_CWD_GAP_ROWS -
      get(cwdRowsAtom) -
      1 -
      get(composerRowsAtom) -
      1
  );
  return Math.min(desired, freeMenuRows);
});

export const layoutAtom = atom((get) => {
  const columns = get(columnsAtom);
  const rows = get(rowsAtom);
  const composerRows = get(composerRowsAtom);
  const bodyEntryRows = countBodyRows(get(displayedBodyEntriesAtom), columns, rows);

  return resolveHomeScreenLayout(
    rows,
    bodyEntryRows,
    composerRows,
    get(cwdRowsAtom),
    get(commandMenuRowsAtom)
  );
});

/** Spare rows between body and cwd keep the lower stack pinned to the bottom. */
export const bottomSpacerRowsAtom = atom((get) => {
  const rows = get(rowsAtom);
  const layout = get(layoutAtom);
  return Math.max(
    0,
    rows -
      HEADER_ROWS -
      layout.bodyRows -
      BODY_CWD_GAP_ROWS -
      layout.cwdRows -
      get(composerRowsAtom) -
      1 -
      get(commandMenuRowsAtom)
  );
});

export const composerTopAtom = atom(
  (get) => get(rowsAtom) - 1 - get(composerRowsAtom)
);
