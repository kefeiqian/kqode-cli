const SET_BACKGROUND_PREFIX = '\u001B]11;';
const SET_BACKGROUND_SUFFIX = '\u0007';

/**
 * The OSC 111 escape sequence that resets the terminal default background color
 * to whatever the user's terminal emulator uses by default.
 */
export const RESET_BACKGROUND_SEQUENCE = '\u001B]111\u0007';

/** Builds the OSC 11 escape sequence that sets the terminal default background to `color`. */
export function buildSetBackgroundSequence(color: string): string {
  return `${SET_BACKGROUND_PREFIX}${color}${SET_BACKGROUND_SUFFIX}`;
}

/**
 * Writes the OSC 11 set-background escape sequence for `color` to `stream` when
 * it is a TTY, so the terminal window background (including padding around the
 * rendered region) matches the rendered theme background.
 *
 * Non-TTY streams (pipes, captured test output) are left untouched so they stay
 * free of control sequences. Terminals that do not support OSC 11 ignore the
 * sequence, making this a safe no-op there.
 */
export function setTerminalBackground(
  color: string,
  stream: NodeJS.WriteStream = process.stdout
): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(buildSetBackgroundSequence(color));
}

/**
 * Writes the OSC 111 reset-background escape sequence to `stream` when it is a
 * TTY, restoring the terminal's default background color on exit.
 *
 * Non-TTY streams are left untouched. Using OSC 111 avoids having to query and
 * cache the user's original background before overriding it.
 */
export function resetTerminalBackground(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(RESET_BACKGROUND_SEQUENCE);
}
