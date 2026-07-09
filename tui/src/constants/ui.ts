/**
 * User-experience behavior constants for the TUI: viewport sizing, composer
 * layout, and scroll/scrollbar tuning. Centralized so these UX knobs are
 * discoverable and adjustable in one place rather than buried in components.
 */

// --- Viewport sizing / header breakpoints ---

export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;
export const MIN_ROWS = 15;
export const MIN_COLUMNS = 60;
export const DEFAULT_COMPOSER_VISIBLE_LINES = 3;

// --- Prompt composer ---

export const PROMPT_PREFIX = '> ';
export const SAFE_CHROME_COLUMN_GUARD = 1;
export const FULLSCREEN_GUARD_ROWS = 0;

// The app now renders edge-to-edge to the physical last row. Filling the full
// viewport moves Ink to its fullscreen cursor baseline, so the paired
// INK_CURSOR_ROW_ORIGIN_OFFSET recomputes to 1 below.
export const INK_CURSOR_ROW_ORIGIN_OFFSET = inkCursorRowOriginOffset(FULLSCREEN_GUARD_ROWS);
export const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
export const COMPOSER_BACKGROUND_TOP_PADDING_ROWS = 1;

function inkCursorRowOriginOffset(guardRows: number): number {
  return guardRows === 0 ? 1 : 0;
}

/**
 * Divisor bounding the composer's visible box to a fraction of the terminal
 * height (`2` = at most half) so a long prompt cannot bury the transcript. The
 * text-line cap derived from it subtracts the background padding and the
 * reserved error row, so the whole composer box stays within `rows / DIVISOR`.
 */
export const COMPOSER_MAX_HEIGHT_DIVISOR = 2;

/**
 * Delay after the last scroll event before the composer re-shows its caret. The
 * caret is suppressed while the user is actively scrolling so the terminal
 * cursor's blink is not reset on every scrolled frame; it reappears (blinking
 * steadily) once scrolling has settled for this long.
 */
export const CARET_SCROLL_SETTLE_MS = 100;

// --- Slash commands ---

/**
 * Fixed number of rows the slash-command panel occupies while open. The panel
 * always renders this many rows: matching commands fill from the top and any
 * remaining rows are left blank, so the panel keeps a stable height instead of
 * shrinking as the query narrows the matches. Also serves as the scroll-window
 * size once the command set grows beyond this many entries.
 */
export const COMMAND_MENU_PANEL_ROWS = 7;

// --- Two-step key confirmations ---

/**
 * Identifiers for a destructive/exit action awaiting a confirming second key
 * press. Referenced instead of the raw strings so the status-bar hint, the Esc
 * clear handler, and the Ctrl+C exit handler stay in sync.
 */
export const ArmedAction = {
  /** Esc pressed once with non-empty composer text; a second Esc clears it. */
  ClearInput: 'clear-input',
  /** Ctrl+C pressed once; a second Ctrl+C exits. */
  Exit: 'exit'
} as const;

export type ArmedAction = (typeof ArmedAction)[keyof typeof ArmedAction];

/** Status-bar hints shown while a two-step key confirmation is armed. */
export const PRESS_AGAIN_TO_CLEAR_HINT = 'esc again to clear input';
export const PRESS_AGAIN_TO_EXIT_HINT = 'ctrl+c again to exit';

/** Default left-aligned status-bar hints shown when no transient hint is active. */
export const DEFAULT_STATUS_HINTS = '/ commands | @ mention | ? help';

/** Milliseconds before a transient status-bar hint clears itself. */
export const TRANSIENT_STATUS_HINT_MS = 1_500;

/** Generic clipboard success hint used by copy/paste follow-up units. */
export const CLIPBOARD_ACTION_SUCCEEDED_HINT = 'clipboard updated';

/** Generic clipboard failure hint used by copy/paste follow-up units. */
export const CLIPBOARD_ACTION_FAILED_HINT = 'clipboard unavailable';

/** Composer key that triggers a system-clipboard paste read. */
export const PASTE_INPUT_KEY = 'v';

/** Transient hint shown when clipboard paste cannot read text. */
export const PASTE_FAILED_HINT = 'paste failed';

/** Composer key that copies the last assistant response. */
export const COPY_LAST_RESPONSE_KEY = 'o';

/**
 * Global Ctrl-modified key that toggles terminal-native Copy Mode. Ctrl (not
 * Alt) because Alt+letter combos are commonly swallowed by OS/global hotkeys
 * before reaching the terminal — notably the NVIDIA overlay's Alt+R Instant
 * Replay binding — so the app never sees the keypress. A Ctrl+letter reliably
 * arrives as a control byte.
 */
export const COPY_MODE_INPUT_KEY = 'r';

/** Persistent status hint shown while terminal-native Copy Mode is active. */
export const COPY_MODE_HINT =
  'copy mode: terminal drag-copy; PageUp/PageDown/End scroll; any key exits';

/** Transient hint shown after the last assistant response is copied. */
export const COPY_LAST_RESPONSE_SUCCEEDED_HINT = 'copied';

/** Transient hint shown when copying the last assistant response fails. */
export const COPY_LAST_RESPONSE_FAILED_HINT = 'copy failed';

/** Transient hint shown when no assistant response can be copied. */
export const COPY_LAST_RESPONSE_NOTHING_HINT = 'nothing to copy';

// --- Status-bar loading spinner ---

/** Milliseconds between animated dots in the status-bar loading hint. */
export const LOADING_FRAME_INTERVAL_MS = 250;

/** Animation frame count (cycling 0–3 trailing dots) for the loading hint. */
export const LOADING_FRAME_COUNT = 4;

// --- Body scrolling / scrollbar ---

/** Glyph for the scrollbar track (inactive portion). */
export const SCROLLBAR_TRACK = '│';
/** Glyph for the scrollbar thumb (active portion). */
export const SCROLLBAR_THUMB = '┃';
/** Rows scrolled per mouse-wheel notch in the body pane. */
export const MOUSE_WHEEL_SCROLL_ROWS = 3;
