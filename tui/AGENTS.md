# TUI agent instructions

## Source organization

Split TUI source files into focused modules before they grow beyond 200 lines. Prefer colocated folders under `src/components/` for component modules when a component needs rendering, state, input, or helper pieces.

Prefer Jotai atoms/selectors over drilling HomeScreen config or shared TUI state through multiple component layers. When a leaf component is specific to the stateful TUI shell, read shared screen state from atoms near that leaf instead of threading config props through intermediate wrappers.

Keep dependencies flowing in one direction:

```text
constants / contracts / theme
  -> libs / backend
  -> state / hooks
  -> components
  -> App / bootstrap / cli
```

Modules in the same layer may depend on one another only when the resulting graph stays acyclic. Keep architecture boundaries executable through the Vitest guard in `src/__tests__/architecture.test.ts`; existing exceptions belong in its explicit baselines and each migration should reduce those baselines.

Files under `src/components/` may export React components only. Move hooks to `src/hooks/`, pure functions and shared types to domain-focused `src/libs/` modules, and stateful atoms/selectors to `src/state/`. Do not expose component internals only for tests: verify simple logic through component behavior, or move substantial pure logic to `src/libs/` so production code and tests share the same public function.

Use `src/constants/` only for dependency-free immutable static data such as strings, numbers, readonly arrays/objects, and enum-like values. Constants modules must not import from other project layers, create mutable collections such as `Set` or `Map`, or contain runtime calculation functions.

Organize `src/state/` by domain directories and split files within a domain by responsibility, not one atom per file. Keep cohesive base atoms, derived selectors, and write actions together until a file approaches roughly 200 lines or mixes distinct responsibilities; then split into focused files such as `state.ts`, `editing.ts`, `cursor.ts`, and `scroll.ts`. State modules may export atoms/selectors and state-specific types only. Move reusable deterministic calculations to `src/libs/` and exported static data to `src/constants/`; helpers that directly use Jotai `get`/`set` or reference atoms remain in the state domain.

## Terminal layout

Keep the cwd row, prompt composer, and command/status row stuck to the bottom of the terminal for every shell window size. Keep exactly one blank separator row between the body area and cwd row, but do not let body, preview, or header content push gaps between the composer and the command/status row.

The render canvas fills the full terminal height (`FULLSCREEN_GUARD_ROWS = 0` in `src/constants/ui.ts`) so no blank row sits at the bottom. Filling the terminal *exactly* makes Ink treat every frame as fullscreen: it clears and repaints the whole screen per keystroke on terminals that don't coalesce the clear (WezTerm blinks; Windows Terminal does not) and omits its trailing newline. The checked-in Ink patch under `tui/patches/` makes cursor positioning use the actual final visible row in this no-newline path; keep its regression test when upgrading Ink. Raise `FULLSCREEN_GUARD_ROWS` back to `1` to restore the incremental, non-fullscreen path. Keep `render()` on `incrementalRendering: true` (`src/cli/kqodeCli.tsx`), and read "bottom" above as the bottom of this canvas.

Meaningful non-body chrome must stay out of the terminal's final cell because several terminals clip it. Composer, cwd, status, click mapping, and caret/scroll calculations share `chromeColumnsAtom`; only `BodyPane` uses the physical final column for scrollbar chrome.

The prompt composer reserves one background-only column of internal right padding in addition to the terminal final-cell gutter. Its rendering, soft wrapping, caret movement, clicks, and scrolling must all use `resolveComposerInputColumns()` so the visual width and interaction geometry cannot drift. The composer starts as one row and grows only when the current prompt text needs soft wrapping or validation feedback. When changing composer, body, header, or resize behavior, preserve this dynamic row shifting so long prompts expand the composer while short prompts keep the command/status row directly underneath.

Terminal.app uses continuous `─` composer borders, lets composer text rows blend into the body background, and renders user messages as borderless filled rows because its font rasterizer leaves visible side-bearing gaps between block-element glyphs. Composer decorative lines may extend through the final-cell gutter while content geometry remains guarded. Other terminals retain inward `▄`/`▀` half-block borders and distinct surface backgrounds. Keep this terminal branch isolated in `src/libs/terminal/surfaceBorder.ts`.

Ink keyboard handling is patched for xterm `modifyOtherKeys` Enter sequences and the TUI opts into Kitty keyboard auto-detection. Ghostty and other capable terminals should distinguish Shift/Alt/Ctrl+Enter; Terminal.app cannot distinguish Shift+Enter from plain Enter, so `\` then Enter remains the documented no-configuration newline fallback.

Prompt cursor placement is manually resolved with Ink's cursor API, so it can drift when vertical layout math changes. When changing body height, spacer rows, wrapping rows, validation rows, background rows, cwd/composer/status placement, or `cursorTop` math, explicitly verify the cursor still lands on the active composer text row rather than one row above or on the cwd row.
