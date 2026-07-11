# TUI agent instructions

## Source organization

Split TUI source files into focused modules before they grow beyond 200 lines. Prefer colocated folders under `src/components/` for component modules when a component needs rendering, state, input, or helper pieces.

Prefer Jotai atoms/selectors over drilling HomeScreen config or shared TUI state through multiple component layers. When a leaf component is specific to the stateful TUI shell, read shared screen state from atoms near that leaf instead of threading config props through intermediate wrappers.

## Terminal layout

Keep the cwd row, prompt composer, and command/status row stuck to the bottom of the terminal for every shell window size. Keep exactly one blank separator row between the body area and cwd row, but do not let body, preview, or header content push gaps between the composer and the command/status row.

The render canvas now fills the terminal's physical last row (`FULLSCREEN_GUARD_ROWS = 0` in `src/state/ui/dimensions.ts`), so Ink runs on its fullscreen cursor baseline and `INK_CURSOR_ROW_ORIGIN_OFFSET = 1` in `src/constants/ui.ts`. Keep `render()` on `incrementalRendering: true` (`src/cli/kqodeCli.tsx`), and treat the guard↔offset pair as one coupled knob: changing one without the other drifts the caret off the composer row. This edge-to-edge posture assumes WezTerm-on-Windows is out of KQode's support matrix; if it returns, re-evaluate the fullscreen flicker trade-off before reintroducing or removing any guard.

All rendered glyph content uses a shared safe content width (`safeChromeColumnsAtom`) that reserves the physical final column for stability: composer, cwd, status, slash-menu, fullscreen footer, and body/transcript text all route through it (the body via `BodyPane` and the `layoutAtom`/`maxBodyScrollOffsetRowsAtom` row counts) so no glyph depends on the risky final cell. Only background boxes keep raw terminal columns — a `<Box width={columns} backgroundColor>` reaches the last cell safely (the root and per-row backgrounds), and the reserved final column shows that background as a gutter. A background `<Box>` that must stay at the safe width (e.g. the composer text row in `ComposerFrame.tsx`) has to set `width` **explicitly**; without it Ink's default `alignItems: stretch` grows it to the raw parent width and paints `inputBackground` into the reserved column (a stray block past the composer edge until the first keystroke's `ESC[K` clears it).

The prompt composer starts as one row and grows only when the current prompt text needs soft wrapping or validation feedback. When changing composer, body, header, or resize behavior, preserve this dynamic row shifting so long prompts expand the composer while short prompts keep the command/status row directly underneath.

Prompt cursor placement is manually resolved with Ink's cursor API, so it can drift when vertical layout math changes. When changing body height, spacer rows, wrapping rows, validation rows, background rows, cwd/composer/status placement, or `cursorTop` math, explicitly verify the cursor still lands on the active composer text row rather than one row above or on the cwd row.

## Command surfaces

Command surfaces opened from slash commands (`/theme`, `/model`, `/login`, `/memory`, resume) render as bottom-docked popups: the transcript body stays visible above, and an accent-colored top separator rule marks the popup/body boundary. Every such popup occupies at most half the terminal height (`⌊rows/2⌋`, matching the composer's `COMPOSER_MAX_HEIGHT_DIVISOR` cap) — counting its separator, content, and footer together — and scrolls its content internally when it would exceed that cap rather than growing past half or pushing other chrome. While a popup is open, hide the cwd/composer/status rows (as the resume panel does) and let the popup own its footer hints.

`/help` is the sole exception: it stays fullscreen so its reference pager can page through long content. When adding a new command surface, dock it and keep it at or below half height with internal scrolling unless it is explicitly a fullscreen pager like `/help`.

### Selection and height grammar

Every selectable command-surface row renders through the shared `SelectableRow` (`src/components/SelectableRow/index.tsx`): the highlighted row gets a `❯` chevron gutter plus a full-width `inputBackground` bar (padded to `safeChromeColumnsAtom` via `padEndToWidth` — never a stretchable background `Box`), and non-highlighted rows get a blank two-column gutter (`SELECTION_GUTTER`) so columns stay aligned. Do not reintroduce per-surface selection markers (`●`, `›`) or `inverse`-based highlights. Columnar surfaces (`/memory`, resume) format their content at `columns - SELECTION_GUTTER_WIDTH` and let `SelectableRow` own the gutter; the table header renders with a matching blank gutter and is never highlighted. Semantic state glyphs that are distinct from the cursor — `/model`'s active-model `●`, `/memory`'s `[Active]`/`[Inbox]` tabs — live inside the row content and are preserved.

Every docked popup renders at one shared constant height (`DOCKED_PANEL_ROWS`, still capped to `⌊rows/2⌋`) so switching between surfaces never changes the popup height; `dockedPanelDesiredRowsAtom` returns that constant for every docked panel. Each popup keeps one blank gap row above its footer hint via `resolveDockedFooterGap`, unconditional except the one degenerate case where keeping it would leave zero data rows (`/memory` at the hard cap, keyed on `reservedContentRows`). The accent top rule (`DockDivider`) sits on every command surface, including the floating `/` command list, where it is the menu's first row. A new command surface must use `SelectableRow`, the shared constant height, the top rule, and a bottom-pinned footer with the gap row.

`/connect` already uses `SelectableRow`, the constant height, and the top rule, but its provider list and step forms are not yet restructured into the uniform content → gap → bottom-pinned-footer shape (its hints still render inline); that structural conformance is the one outstanding refinement.
