import { atom } from 'jotai';
import {
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  FULLSCREEN_GUARD_ROWS,
  MIN_COLUMNS,
  MIN_ROWS,
  PROMPT_PREFIX,
  SAFE_CHROME_COLUMN_GUARD
} from '@constants/ui.ts';
import {
  resolveComposerInputColumns,
  resolveSafeColumns,
  resolveSafeRows
} from '@libs/tui/safeCanvas.ts';

export { FULLSCREEN_GUARD_ROWS } from '@constants/ui.ts';

// Test-only seams that pin a deterministic viewport ahead of the live terminal
// size. Only read when `__TEST__` (see `src/globals.d.ts`): the `prod` build
// folds `__TEST__` to false and dead-code-eliminates both the reads below and —
// via the `@__PURE__` annotation — these declarations. `dev` keeps the branch
// but never sets them, so columns/rows resolve to window ?? default.
export const columnsTestOverrideAtom = /* @__PURE__ */ atom<number | undefined>(undefined);
export const rowsTestOverrideAtom = /* @__PURE__ */ atom<number | undefined>(undefined);
export const windowColumnsAtom = atom<number | undefined>(undefined);
export const windowRowsAtom = atom<number | undefined>(undefined);

export const columnsAtom = atom((get) => {
  const override = __TEST__ ? get(columnsTestOverrideAtom) : undefined;
  return override ?? get(windowColumnsAtom) ?? DEFAULT_COLUMNS;
});

/**
 * Rows the UI renders into. With `FULLSCREEN_GUARD_ROWS = 0` production now
 * uses the full live terminal height. Test overrides still pin the rendered
 * canvas directly, while raw `window*Atom` updates exercise the production
 * fullscreen path.
 */
export const rowsAtom = atom((get) => {
  const override = __TEST__ ? get(rowsTestOverrideAtom) : undefined;
  if (override !== undefined) {
    return Math.max(MIN_ROWS, override);
  }

  const windowRows = get(windowRowsAtom) ?? DEFAULT_ROWS;
  return resolveSafeRows(windowRows, FULLSCREEN_GUARD_ROWS, MIN_ROWS);
});

export const safeChromeColumnsAtom = atom((get) =>
  resolveSafeColumns(get(columnsAtom), SAFE_CHROME_COLUMN_GUARD)
);

export const composerInputColumnsAtom = atom((get) =>
  resolveComposerInputColumns(get(safeChromeColumnsAtom), PROMPT_PREFIX.length)
);

/** Smallest real terminal height that can render the home screen without overflowing the canvas. */
export const MIN_USABLE_TERMINAL_ROWS = MIN_ROWS + FULLSCREEN_GUARD_ROWS;

/** Smallest real terminal width that can render the safe chrome width usably. */
export const MIN_USABLE_TERMINAL_COLUMNS = MIN_COLUMNS + SAFE_CHROME_COLUMN_GUARD;

/**
 * True when the real terminal is too small to render the home screen usably —
 * too short OR too narrow. Reads the raw window size (test overrides first) and
 * gates each dimension independently: an unmeasured dimension does not
 * constrain, so the app never flashes the notice at startup before the first
 * size measurement lands.
 */
export const terminalTooSmallAtom = atom((get) => {
  const rowOverride = __TEST__ ? get(rowsTestOverrideAtom) : undefined;
  const columnOverride = __TEST__ ? get(columnsTestOverrideAtom) : undefined;
  const windowRows = rowOverride ?? get(windowRowsAtom);
  const windowColumns = columnOverride ?? get(windowColumnsAtom);

  const rowsTooSmall = windowRows !== undefined && windowRows < MIN_USABLE_TERMINAL_ROWS;
  const columnsTooSmall = windowColumns !== undefined && windowColumns < MIN_USABLE_TERMINAL_COLUMNS;

  return rowsTooSmall || columnsTooSmall;
});
