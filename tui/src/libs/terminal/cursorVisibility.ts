/** DECTCEM escape (`ESC [ ? 25 l`) that hides the terminal cursor. */
export const HIDE_CURSOR_SEQUENCE = '\u001B[?25l';

/**
 * Writes the DECTCEM hide-cursor escape to `stream` when it is a TTY.
 *
 * Used while input is locked (backend loading) to guarantee the hardware cursor
 * is hidden. On the fullscreen repaint path Ink only *hides* the cursor when one
 * was previously shown, so a composer that simply sets no cursor position leaves
 * the hardware cursor blinking at the end of the last output row (the status bar
 * / model label). An explicit hide sidesteps that. Ink re-shows the cursor
 * itself once the composer asserts a position again (after unlock).
 *
 * Non-TTY streams (pipes, captured test output) are left untouched so they stay
 * free of control sequences.
 */
export function hideTerminalCursor(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(HIDE_CURSOR_SEQUENCE);
}
