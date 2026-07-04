/**
 * DEC private mode 1049: switch to the alternate screen buffer (saving the
 * cursor and clearing the alt buffer first).
 *
 * The alternate buffer has no scrollback region, so while the TUI owns the
 * screen the terminal's native scrollbar has no prior history to scroll into —
 * the user stays pinned to the live UI instead of drifting into pre-launch
 * output. This is independent of Ink's "fullscreen" detection: with
 * `FULLSCREEN_GUARD_ROWS` now `0` the UI fills the alt buffer fullscreen, so
 * `incrementalRendering` only avoids a per-keystroke repaint on terminals that
 * skip the whole-screen clear on fullscreen frames (Windows Terminal is fine;
 * WezTerm repaints and blinks).
 */
export const ENTER_ALTERNATE_SCREEN_SEQUENCE = '\u001B[?1049h';

/**
 * DEC private mode 1049 reset: leave the alternate screen buffer and restore the
 * original main buffer (with its scrollback) and saved cursor.
 */
export const LEAVE_ALTERNATE_SCREEN_SEQUENCE = '\u001B[?1049l';

/**
 * Writes the enter-alternate-screen sequence to `stream` when it is a TTY, so
 * the session renders in a scrollback-less buffer that restores the user's
 * terminal on exit.
 *
 * Non-TTY streams (pipes, captured test output) are left untouched so they stay
 * free of control sequences. Terminals that do not support mode 1049 ignore the
 * sequence, making this a safe no-op there.
 */
export function enterAlternateScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(ENTER_ALTERNATE_SCREEN_SEQUENCE);
}

/**
 * Writes the leave-alternate-screen sequence to `stream` when it is a TTY,
 * restoring the original main buffer and its scrollback on exit.
 *
 * Non-TTY streams are left untouched. This is the teardown counterpart to
 * {@link enterAlternateScreen} and must run on every exit path (clean shutdown
 * and hard exit) so the alternate buffer never outlives the session.
 */
export function leaveAlternateScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(LEAVE_ALTERNATE_SCREEN_SEQUENCE);
}
