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

// The app fills the terminal exactly (FULLSCREEN_GUARD_ROWS = 0), so Ink treats
// each frame as fullscreen, omits its trailing newline, and shifts the cursor
// baseline up one row. This offset adds that row back so the measured composer
// top maps onto the editable row. (It was 0 while the app rendered just under
// fullscreen, where Ink appends the trailing newline and the baseline already
// lands on the output's bottom row.) NOTE: below ~10 rows the MIN_ROWS floor
// makes content overflow the terminal and this can be off by one — a degenerate,
// already-unusable terminal size.
export const INK_CURSOR_ROW_ORIGIN_OFFSET = 1;
export const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
export const COMPOSER_BACKGROUND_TOP_PADDING_ROWS = 1;

// --- Body scrolling / scrollbar ---

/** Glyph for the scrollbar track (inactive portion). */
export const SCROLLBAR_TRACK = '│';
/** Glyph for the scrollbar thumb (active portion). */
export const SCROLLBAR_THUMB = '┃';
/** Rows scrolled per mouse-wheel notch in the body pane. */
export const MOUSE_WHEEL_SCROLL_ROWS = 3;
