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
 * Rows reserved below the UI. Now `0`: the UI fills the full terminal height so
 * no blank row sits at the bottom (tighter, edge-to-edge layout).
 *
 * The trade-off: filling the terminal *exactly* makes Ink treat every frame as
 * fullscreen and, on terminals that do not coalesce the clear, forces a
 * whole-screen clear (`ESC[2J ESC[3J`) and full repaint on **every** keystroke
 * (WezTerm blinks; Windows Terminal does not). Fullscreen frames also make Ink
 * omit its trailing newline and shift the cursor baseline up one row, which
 * {@link INK_CURSOR_ROW_ORIGIN_OFFSET} adds back. Raise this to `1` to restore
 * the incremental, non-fullscreen path (one blank row, no per-keystroke clear).
 */
export const FULLSCREEN_GUARD_ROWS = 0;

/**
 * Rows the UI renders into. Production subtracts {@link FULLSCREEN_GUARD_ROWS}
 * from the live terminal height (now `0`, so the UI fills the full height); test
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
