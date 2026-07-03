/**
 * User-experience behavior constants for the TUI: viewport sizing, composer
 * layout, and scroll/scrollbar tuning. Centralized so these UX knobs are
 * discoverable and adjustable in one place rather than buried in components.
 */

// --- Viewport sizing / header breakpoints ---

export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;
export const MIN_ROWS = 10;
export const HIDE_HEADER_BELOW_COLUMNS = 36;
export const COMPACT_HEADER_BELOW_COLUMNS = 52;
export const DEFAULT_COMPOSER_VISIBLE_LINES = 3;

// --- Prompt composer ---

export const PROMPT_PREFIX = '> ';

// The app renders just under fullscreen (see FULLSCREEN_GUARD_ROWS), so Ink
// appends a trailing newline each frame and its cursor baseline lands exactly on
// the output's bottom row. The measured composer top therefore maps straight to
// the editable row with no extra origin offset. (This was 1 while the app filled
// the terminal exactly, where Ink omits the trailing newline and shifts the
// baseline up one row.) NOTE: this assumes a non-fullscreen frame; below ~11 rows
// the MIN_ROWS floor can re-enter fullscreen and make this off by one — a
// degenerate, already-unusable terminal size.
export const INK_CURSOR_ROW_ORIGIN_OFFSET = 0;
export const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
export const COMPOSER_BACKGROUND_TOP_PADDING_ROWS = 1;

// --- Slash commands ---

/**
 * Maximum command rows shown in the autocomplete menu before it stops growing.
 * Inert with the three built-in commands today; exercised once the deferred
 * markdown/config command source adds more.
 */
export const MAX_COMMAND_MENU_ROWS = 8;

// --- Body scrolling / scrollbar ---

/** Glyph for the scrollbar track (inactive portion). */
export const SCROLLBAR_TRACK = '│';
/** Glyph for the scrollbar thumb (active portion). */
export const SCROLLBAR_THUMB = '┃';
/** Rows scrolled per mouse-wheel notch in the body pane. */
export const MOUSE_WHEEL_SCROLL_ROWS = 3;
