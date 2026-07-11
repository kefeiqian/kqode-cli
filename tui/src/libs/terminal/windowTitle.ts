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

/** Max characters of a session summary kept in the window title before clipping. */
const SESSION_TITLE_MAX_LENGTH = 72;

/** Bidi/RTL formatting marks that can visually spoof a persisted title or tab. */
function isBidiControl(codePoint: number): boolean {
  return (
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    codePoint === 0x061c ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

/**
 * Sanitizes arbitrary text into a single-line session title safe to embed in an
 * OSC 2 window-title sequence: whitespace (incl. `TAB`/`LF`/`CR`) becomes
 * spaces, control characters (C0/C1, `DEL`, `ESC`, `BEL`) and bidi/RTL marks are
 * removed, and runs of whitespace are collapsed. Mirrors the Rust
 * `sanitize_session_title` so both sides share one policy; applied at the
 * {@link setSessionWindowTitle} sink so the placeholder, generated summary, and
 * resume callers cannot bypass it.
 */
export function sanitizeSessionTitle(raw: string): string {
  let cleaned = '';
  for (const char of raw) {
    if (/\s/u.test(char)) {
      cleaned += ' ';
      continue;
    }
    const codePoint = char.codePointAt(0) ?? 0;
    const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    if (isControl || isBidiControl(codePoint)) {
      continue;
    }
    cleaned += char;
  }
  return cleaned.replace(/\s+/gu, ' ').trim();
}

/**
 * Formats the terminal window title for a resumed or in-progress session, e.g.
 * `Fix the parser bug`. The title is the sanitized session `summary` (no product
 * prefix); long summaries are clipped to `SESSION_TITLE_MAX_LENGTH`, and an empty
 * `summary` falls back to `productName` so the title never blanks.
 */
export function formatSessionWindowTitle(productName: string, summary: string): string {
  const sanitized = sanitizeSessionTitle(summary);
  if (sanitized.length === 0) {
    return productName;
  }

  return sanitized.length > SESSION_TITLE_MAX_LENGTH
    ? `${sanitized.slice(0, SESSION_TITLE_MAX_LENGTH - 1)}…`
    : sanitized;
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
 * Writes the OSC 2 window-title escape sequence for a resumed session's
 * `summary` to `stream` when it is a TTY, so the terminal tab reflects the
 * session the user switched into (see {@link formatSessionWindowTitle}).
 *
 * Non-TTY streams (pipes, captured test output) are left untouched so they stay
 * free of control sequences.
 */
export function setSessionWindowTitle(
  productName: string,
  summary: string,
  stream: NodeJS.WriteStream = process.stdout
): void {
  if (!stream.isTTY) {
    return;
  }

  stream.write(buildWindowTitleSequence(formatSessionWindowTitle(productName, summary)));
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
