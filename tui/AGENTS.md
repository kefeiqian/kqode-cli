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

The render canvas fills the full terminal height (`FULLSCREEN_GUARD_ROWS = 0` in `src/state/ui/dimensions.ts`) so no blank row sits at the bottom. Filling the terminal *exactly* makes Ink treat every frame as fullscreen: it clears and repaints the whole screen per keystroke on terminals that don't coalesce the clear (WezTerm blinks; Windows Terminal does not) and omits its trailing newline, shifting the cursor baseline up one row (compensated by `INK_CURSOR_ROW_ORIGIN_OFFSET = 1` in `src/constants/ui.ts`). Raise `FULLSCREEN_GUARD_ROWS` back to `1` to restore the incremental, non-fullscreen path. Keep `render()` on `incrementalRendering: true` (`src/cli/kqodeCli.tsx`), and read "bottom" above as the bottom of this canvas.

The UI also fills the terminal's *final column* for a tight right edge. Ink erases to end-of-line after each row, and some terminals (e.g. WezTerm) drop a glyph rendered into the last column — Windows Terminal renders it fine, so the status bar reaches the edge (`<Box width={columns}>`, no `paddingRight`). If a terminal clips the right-aligned model label (e.g. `GPT-5.5` → `GPT-5.`), restore `paddingRight={1}` on the status bar box.

The prompt composer starts as one row and grows only when the current prompt text needs soft wrapping or validation feedback. When changing composer, body, header, or resize behavior, preserve this dynamic row shifting so long prompts expand the composer while short prompts keep the command/status row directly underneath.

Prompt cursor placement is manually resolved with Ink's cursor API, so it can drift when vertical layout math changes. When changing body height, spacer rows, wrapping rows, validation rows, background rows, cwd/composer/status placement, or `cursorTop` math, explicitly verify the cursor still lands on the active composer text row rather than one row above or on the cwd row.
