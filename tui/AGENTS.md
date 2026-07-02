# TUI agent instructions

## Source organization

Split TUI source files into focused modules before they grow beyond 200 lines. Prefer colocated folders under `src/components/` for component modules when a component needs rendering, state, input, or helper pieces.

Prefer Jotai atoms/selectors over drilling HomeScreen config or shared TUI state through multiple component layers. When a leaf component is specific to the stateful TUI shell, read shared screen state from atoms near that leaf instead of threading config props through intermediate wrappers.

## Terminal layout

Keep the cwd row, prompt composer, and command/status row stuck to the bottom of the terminal for every shell window size. Keep exactly one blank separator row between the body area and cwd row, but do not let body, preview, or header content push gaps between the composer and the command/status row.

The render canvas reserves one row below the status row (`FULLSCREEN_GUARD_ROWS` in `src/state/global/dimensions.ts`) so the UI never fills the terminal *exactly*. Filling it exactly makes Ink treat every frame as fullscreen and, on Windows, clear and repaint the whole screen on each keystroke — wiping scrollback and blinking in terminals that don't coalesce the clear (e.g. WezTerm). Keep this reservation, keep `render()` on `incrementalRendering: true` (`main.tsx`), and read "bottom" above as the bottom of this canvas, not the terminal's last row.

For the same incremental-rendering reason, keep meaningful glyphs out of the terminal's *final column*: Ink erases to end-of-line after each row, and some terminals (e.g. WezTerm) drop a glyph rendered into the last column. The status bar reserves it via `paddingRight={1}` so the right-aligned model label isn't clipped (e.g. `GPT-5.5` → `GPT-5.`).

The prompt composer starts as one row and grows only when the current prompt text needs soft wrapping or validation feedback. When changing composer, body, header, or resize behavior, preserve this dynamic row shifting so long prompts expand the composer while short prompts keep the command/status row directly underneath.

Prompt cursor placement is manually resolved with Ink's cursor API, so it can drift when vertical layout math changes. When changing body height, spacer rows, wrapping rows, validation rows, background rows, cwd/composer/status placement, or `cursorTop` math, explicitly verify the cursor still lands on the active composer text row rather than one row above or on the cwd row.
