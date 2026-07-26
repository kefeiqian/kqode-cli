import { atom } from 'jotai';
import {
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  FULLSCREEN_GUARD_ROWS,
  MIN_ROWS,
  MIN_USABLE_TERMINAL_COLUMNS,
  MIN_USABLE_TERMINAL_ROWS
} from '@constants/ui.ts';
import { resolveFullscreenGuardRows } from '@libs/terminal/fullscreenGuard.ts';
import { resolveChromeColumns } from '@libs/tui/layout.ts';

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

export const chromeColumnsAtom = atom((get) => resolveChromeColumns(get(columnsAtom)));

/**
 * WezTerm visibly repaints Ink's Windows fullscreen clear on every keystroke,
 * so it reserves one row. Other terminals retain the edge-to-edge canvas.
 */
const fullscreenGuardRowsAtom = atom(() => resolveFullscreenGuardRows());

/** Minimum physical terminal height for the current terminal's row budget. */
export const minimumUsableRowsAtom = atom(
  (get) => MIN_USABLE_TERMINAL_ROWS + get(fullscreenGuardRowsAtom)
);

/**
 * Rows the UI renders into. Production applies the terminal-specific fullscreen
 * guard; test overrides pin the canvas directly and bypass the reservation.
 */
export const rowsAtom = atom((get) => {
  const override = __TEST__ ? get(rowsTestOverrideAtom) : undefined;
  if (override !== undefined) {
    return Math.max(MIN_ROWS, override);
  }

  const windowRows = get(windowRowsAtom) ?? DEFAULT_ROWS;
  return Math.max(
    MIN_ROWS,
    windowRows - FULLSCREEN_GUARD_ROWS - get(fullscreenGuardRowsAtom)
  );
});

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

  const rowsTooSmall =
    windowRows !== undefined && windowRows < get(minimumUsableRowsAtom);
  const columnsTooSmall = windowColumns !== undefined && windowColumns < MIN_USABLE_TERMINAL_COLUMNS;

  return rowsTooSmall || columnsTooSmall;
});
