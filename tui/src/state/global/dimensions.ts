import { atom } from 'jotai';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, MIN_ROWS } from '@constants/ui.ts';

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
 * Rows reserved below the UI so a frame never fills the terminal *exactly*.
 *
 * Rendering at full terminal height makes Ink treat every frame as fullscreen;
 * on Windows that forces a whole-screen clear (`ESC[2J ESC[3J`) and full repaint
 * on **every** keystroke, which wipes scrollback and blinks in terminals that do
 * not coalesce the clear (e.g. WezTerm). Reserving one row keeps Ink on its
 * incremental path so only changed lines are rewritten. The trade-off is a
 * single blank row at the bottom of the terminal.
 */
export const FULLSCREEN_GUARD_ROWS = 1;

/**
 * Rows the UI renders into. Production reserves {@link FULLSCREEN_GUARD_ROWS}
 * from the live terminal height so frames stay just under fullscreen; test
 * overrides pin the canvas directly and bypass the reservation.
 */
export const rowsAtom = atom((get) => {
  const override = __TEST__ ? get(rowsTestOverrideAtom) : undefined;
  if (override !== undefined) {
    return Math.max(MIN_ROWS, override);
  }

  const windowRows = get(windowRowsAtom) ?? DEFAULT_ROWS;
  return Math.max(MIN_ROWS, windowRows - FULLSCREEN_GUARD_ROWS);
});
