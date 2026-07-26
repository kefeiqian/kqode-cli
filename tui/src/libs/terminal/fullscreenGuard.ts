import {
  WEZTERM_FULLSCREEN_GUARD_ROWS,
  WEZTERM_TERM_PROGRAM
} from '@constants/terminal.ts';

/**
 * Returns the terminal-specific row reservation that keeps Ink off its
 * fullscreen clear-and-repaint path.
 */
export function resolveFullscreenGuardRows(
  termProgram = process.env.TERM_PROGRAM
): number {
  return termProgram === WEZTERM_TERM_PROGRAM
    ? WEZTERM_FULLSCREEN_GUARD_ROWS
    : 0;
}
