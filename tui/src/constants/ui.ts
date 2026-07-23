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
/** Physical terminal cells reserved from meaningful non-body chrome content. */
export const TERMINAL_FINAL_COLUMN_GUARD = 1;
export const FULLSCREEN_GUARD_ROWS = 0;
export const MIN_USABLE_TERMINAL_ROWS = MIN_ROWS + FULLSCREEN_GUARD_ROWS;
export const MIN_USABLE_TERMINAL_COLUMNS = MIN_COLUMNS;

// --- Prompt composer ---

export const PROMPT_PREFIX = '> ';

/** Terminal input sequences emitted for modified Enter combinations. */
export const MODIFIED_ENTER_INPUTS: readonly string[] = [
  '\u001B[13;2u',
  '\u001B[13;3u',
  '\u001B[13;5u',
  '\u001B[13;6u'
];

export const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
export const COMPOSER_BACKGROUND_TOP_PADDING_ROWS = 1;

/**
 * Divisor bounding the composer's visible box to a fraction of the terminal
 * height (`2` = at most half) so a long prompt cannot bury the transcript. The
 * text-line cap derived from it subtracts the background padding and the
 * reserved error row, so the whole composer box stays within `rows / DIVISOR`.
 */
export const COMPOSER_MAX_HEIGHT_DIVISOR = 2;

// --- Slash commands ---

/**
 * Maximum command rows shown in the autocomplete menu before it stops growing.
 * Inert with the three built-in commands today; exercised once the deferred
 * markdown/config command source adds more.
 */
export const MAX_COMMAND_MENU_ROWS = 8;

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
