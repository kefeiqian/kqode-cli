const SET_WINDOW_TITLE_PREFIX = '\u001B]2;';
const SET_WINDOW_TITLE_SUFFIX = '\u0007';

/** Builds the OSC 2 escape sequence that sets the terminal window title to `title`. */
export function buildWindowTitleSequence(title: string): string {
  return `${SET_WINDOW_TITLE_PREFIX}${title}${SET_WINDOW_TITLE_SUFFIX}`;
}

/** Formats the terminal window title, e.g. `KQode v0.1.0`. */
export function formatWindowTitle(productName: string, productVersion: string): string {
  return `${productName} v${productVersion}`;
}

/**
 * Writes the OSC 2 window-title escape sequence for `productName` and
 * `productVersion` to `stream` when it is a TTY.
 *
 * Non-TTY streams (pipes, captured test output) are left untouched so they stay
 * free of control sequences.
 */
export function setTerminalWindowTitle(
  productName: string,
  productVersion: string,
  stream: NodeJS.WriteStream = process.stdout
): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(buildWindowTitleSequence(formatWindowTitle(productName, productVersion)));
}

/**
 * Clears the terminal window title previously set by
 * {@link setTerminalWindowTitle}, restoring the terminal's default.
 *
 * Writes an OSC 2 sequence with an empty title to `stream` when it is a TTY;
 * non-TTY streams (pipes, captured test output) are left untouched. Called on
 * exit so a KQode session title never outlives the process, mirroring the
 * alternate-screen and background restores.
 */
export function resetTerminalWindowTitle(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(buildWindowTitleSequence(''));
}
