# TUI agent instructions

## Source organization

Split TUI source files into focused modules before they grow beyond 200 lines. Prefer colocated folders under `src/components/` for component modules when a component needs rendering, state, input, or helper pieces.

Prefer Jotai atoms/selectors over drilling HomeScreen config or shared TUI state through multiple component layers. When a leaf component is specific to the stateful TUI shell, read shared screen state from atoms near that leaf instead of threading config props through intermediate wrappers.

## Terminal layout

Keep the cwd row, prompt composer, and command/status row stuck to the bottom of the terminal for every shell window size. Keep exactly one blank separator row between the body area and cwd row, but do not let body, preview, or header content push gaps between the composer and the command/status row.

The render canvas intentionally stays one physical row under the terminal (`FULLSCREEN_GUARD_ROWS = 1` in `src/state/ui/dimensions.ts`) so Ink keeps its incremental, non-fullscreen path and the cursor baseline needs no compensation (`INK_CURSOR_ROW_ORIGIN_OFFSET = 0` in `src/constants/ui.ts`). Keep `render()` on `incrementalRendering: true` (`src/cli/kqodeCli.tsx`), and read "bottom" above as the bottom of this safe canvas rather than the physical terminal's final row.

All rendered glyph content uses a shared safe content width (`safeChromeColumnsAtom`) that reserves the physical final column for stability: composer, cwd, status, slash-menu, fullscreen footer, and body/transcript text all route through it (the body via `BodyPane` and the `layoutAtom`/`maxBodyScrollOffsetRowsAtom` row counts) so no glyph depends on the risky final cell. Only background boxes keep raw terminal columns — a `<Box width={columns} backgroundColor>` reaches the last cell safely (the root and per-row backgrounds), and the reserved final column shows that background as a gutter. A background `<Box>` that must stay at the safe width (e.g. the composer text row in `ComposerFrame.tsx`) has to set `width` **explicitly**; without it Ink's default `alignItems: stretch` grows it to the raw parent width and paints `inputBackground` into the reserved column (a stray block past the composer edge until the first keystroke's `ESC[K` clears it).

The prompt composer starts as one row and grows only when the current prompt text needs soft wrapping or validation feedback. When changing composer, body, header, or resize behavior, preserve this dynamic row shifting so long prompts expand the composer while short prompts keep the command/status row directly underneath.

Prompt cursor placement is manually resolved with Ink's cursor API, so it can drift when vertical layout math changes. When changing body height, spacer rows, wrapping rows, validation rows, background rows, cwd/composer/status placement, or `cursorTop` math, explicitly verify the cursor still lands on the active composer text row rather than one row above or on the cwd row.
