---
title: feat: Add Gemini-style TUI theming
type: feat
status: completed
date: 2026-06-29
origin: docs/brainstorms/2026-06-29-gemini-style-tui-theming-requirements.md
---

# feat: Add Gemini-style TUI theming

## Summary

Introduce a small internal theming layer for the existing Ink TUI that keeps GitHub/Gemini-style foreground colors as the baseline and adds an opt-in seam-safe background block primitive for message/input blocks. The plan preserves the existing home screen, transcript, composer, wrapping, row spacing, and bottom-sticky layout while avoiding user-facing theme configuration and backend changes.

---

## Problem Frame

The existing TUI already has the target shell shape, but direct background painting produced visible terminal row seams. The implementation needs to copy Gemini CLI's rendering idea at the product-behavior level: foreground theme semantics remain reliable everywhere, while background blocks are a contained rendering primitive that can degrade cleanly.

---

## Requirements

- R1. Use centralized GitHub/Gemini-inspired foreground tokens for primary, muted, accent, success, warning, error, border, and scrollbar text.
- R2. Keep theme behavior internal to the existing Ink TUI slice; do not add `/theme`, persisted theme selection, custom theme files, or user-facing theme settings.
- R3. Preserve non-color meaning markers such as `ERROR:`, `❯`, `•`, pending labels, selected-row pointers, and scrollbar glyphs.
- R4. Treat background rendering as an internal primitive for existing message/input blocks, not a global app-canvas paint strategy.
- R5. Use Gemini CLI's half-line padding idea for background blocks so row-seam artifacts are avoided where background rendering is enabled.
- R6. Make background rendering fallback-aware so unsupported, screen-reader, or color-disabled sessions can render without background blocks.
- R7. Derive background colors from centralized theme tokens and account for terminal background when practical.
- R8. Preserve current body wrapping, soft-wrap continuation spacing, larger gaps between transcript items, scrolling, bottom-sticky cwd/composer/status rows, and composer cursor behavior.
- R9. Limit changes to existing Ink TUI display surfaces and tests.
- R10. Do not add backend behavior, agent/session features, command execution, model calls, daemon/runtime changes, or protocol changes.

**Origin actors:** A1 (User), A2 (TUI implementer), A3 (Terminal environment)
**Origin flows:** F1 (Transcript renders with text-only theme), F2 (Optional background block renders without row seams)
**Origin acceptance examples:** AE1 (foreground theme and markers), AE2 (seam-safe background block), AE3 (fallback rendering), AE4 (scope boundary)

---

## Scope Boundaries

- No user-facing theme picker, `/theme` command, custom theme file loading, persisted theme choice, or settings UI.
- No global app-canvas background painting with normal text/background styling.
- No backend, JSON-RPC, session, agent, model, daemon, or command behavior changes.
- No attempt to solve all terminal rendering differences; unsupported environments must remain readable through text colors and markers.

---

## Context & Research

### Relevant Code and Patterns

- `tui/src/theme/themeConfig.ts` already centralizes the GitHub Dark text-only foreground palette.
- `tui/src/components/BodyPane.tsx` owns transcript row shaping, assistant `•` markers, user `❯` rows, row gaps, wrapping, and scrollbar rendering; it is already large enough that new background behavior should be split out instead of added inline.
- `tui/src/components/PromptComposer.tsx` owns prompt input, wrapping, validation error rendering, visible row reporting, and cursor placement.
- `tui/src/components/HomeScreen.tsx` owns bottom-sticky layout math for body, cwd, composer, and status rows.
- `tui/src/components/__tests__/HomeScreen.test.tsx` and `tui/src/components/__tests__/PromptComposer.test.tsx` already cover the core visual/layout contracts that this plan must preserve.
- `tui/AGENTS.md` requires cwd, composer, and status rows to stay bottom-sticky with exactly one blank separator row between body and cwd.

### Institutional Learnings

- `docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md` and `docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md` established centralized palette tokens as acceptable for the first TUI slice while deferring full theme configuration.
- `docs/features/r065_themes_terminal_background_aware_themes_and_project_user_theme_directori.md` describes broader future theme capability, but this plan deliberately stays below that product surface.
- `docs/kqode_architecture_spec.md` and `docs/kqode_build_path.md` keep the TypeScript Ink TUI responsible for rich surface rendering while Rust remains headless-capable.

### External References

- Gemini CLI `HalfLinePaddedBox` pattern: render top and bottom half-line padding with repeated `▄`/`▀` glyphs around a background-colored content box, with fallback behavior when truecolor/background rendering is unsuitable.
- Gemini CLI theme manager pattern: keep semantic theme tokens separate from rendering components, query terminal background when needed, and keep a switch to disable background color rendering.

---

## Key Technical Decisions

- Keep foreground theme tokens as the baseline: Text color is reliable enough for the current slice and preserves readability when background rendering is disabled.
- Add a dedicated internal background block primitive: This avoids spreading half-line padding and fallback logic through body/composer components.
- Do not paint the global TUI canvas: Prior attempts created visible row stripes, and the origin explicitly scopes background rendering to message/input blocks.
- Keep fallback policy local and conservative: If background rendering support is uncertain, render plain content with text colors and markers rather than producing artifacts.
- Split before expanding large components: `BodyPane.tsx` should not absorb additional row-shaping and background primitive complexity directly.

---

## Open Questions

### Resolved During Planning

- Fallback gate: Use a conservative internal gate that can be driven by explicit props/environment checks first; terminal capability querying can remain deferred unless implementation finds it necessary for the initial primitive.
- Terminal background blending: Start with a theme-token background color for the primitive and leave terminal-background querying as a follow-up unless the implementation can add it without changing scope.

### Deferred to Implementation

- Exact truecolor detection helper: The implementing agent should choose the smallest reliable detection or opt-out check that fits the current TUI stack.
- Exact row-count behavior for background-enabled blocks: The implementing agent should preserve existing body/composer layout tests and adjust only if background rows are explicitly expected in those tests.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
theme tokens
  -> foreground colors for all existing rows
  -> background block colors for opt-in primitive

BackgroundBlock primitive
  -> if disabled / unsupported / screen reader: children only
  -> if supported: half-line top glyph row + background content row(s) + half-line bottom glyph row

BodyPane / PromptComposer
  -> keep existing row models, wrapping, markers, and layout contracts
  -> opt into BackgroundBlock only for message/input blocks selected by the existing UI scope
```

---

## Implementation Units

### U1. Re-establish semantic theme tokens

**Goal:** Make the current GitHub Dark text-only palette explicit as semantic theme tokens and add internal background token slots without applying backgrounds globally.

**Requirements:** R1, R2, R3, R7, AE1, AE3, AE4

**Dependencies:** None

**Files:**
- Modify: `tui/src/theme/themeConfig.ts`
- Modify: `tui/src/components/Header.tsx`
- Modify: `tui/src/components/CwdLine.tsx`
- Modify: `tui/src/components/StatusBar.tsx`
- Modify: `tui/src/components/PromptComposer.tsx`
- Modify: `tui/src/components/BodyPane.tsx`
- Test: `tui/src/components/__tests__/HomeScreen.test.tsx`

**Approach:**
- Keep the theme internal and static for now.
- Separate text tokens from background-capable tokens so foreground styling can stay enabled even when background rendering is disabled.
- Preserve existing marker-based meaning for errors, user prompts, assistant rows, pending rows, and scrollbars.

**Patterns to follow:**
- Existing token import pattern from `tui/src/theme/themeConfig.ts`.
- Existing component-level color application in `tui/src/components/PromptComposer.tsx` and `tui/src/components/BodyPane.tsx`.

**Test scenarios:**
- Happy path: rendering the home screen exposes GitHub/Gemini-style foreground token usage for header, composer prefix, status model label, and body markers.
- Edge case: rendering an error entry still includes `ERROR:` and uses the error token without requiring background color.
- Scope guard: theme tests do not imply any user-facing theme picker, persistence, or custom theme loading.

**Verification:**
- Foreground colors are centralized and semantic.
- No app-wide or row-wide background painting is introduced by this unit.

---

### U2. Add an internal half-line background block primitive

**Goal:** Add a reusable internal rendering primitive for optional background blocks that can avoid row-seam artifacts with Gemini-style half-line glyph painting.

**Requirements:** R4, R5, R6, R7, AE2, AE3

**Dependencies:** U1

**Files:**
- Create: `tui/src/components/BackgroundBlock.tsx`
- Test: `tui/src/components/__tests__/BackgroundBlock.test.tsx`

**Approach:**
- Make the primitive opt-in and prop-driven rather than tied to global app state.
- Render children directly when background rendering is disabled or unsupported.
- When enabled, render full-width half-line top and bottom rows with `▄` and `▀`, surrounding the content block.
- Keep the primitive small and reusable; do not copy Gemini CLI source.

**Technical design:** *(directional guidance, not implementation specification)*

```text
BackgroundBlock(width, backgroundColor, enabled)
  disabled -> children
  enabled  -> lower-half glyph row
           -> background content container
           -> upper-half glyph row
```

**Patterns to follow:**
- Gemini CLI's concept of `HalfLinePaddedBox`, used as external product-behavior reference only.
- Existing Ink component test style in `tui/src/components/__tests__/HomeScreen.test.tsx`.

**Test scenarios:**
- Covers AE2. Happy path: enabled block renders a top half-line row, child content, and a bottom half-line row at the requested width.
- Covers AE3. Fallback path: disabled block renders only its children without half-line rows.
- Edge case: width below the content length does not crash and still returns deterministic rows.

**Verification:**
- The primitive can be tested independently from HomeScreen layout.
- The primitive does not introduce a user-facing setting or external dependency.

---

### U3. Wire optional background blocks into existing transcript/input surfaces

**Goal:** Apply the new background primitive only where it belongs in the current Ink TUI: existing user/message or input blocks selected by the current transcript/composer design.

**Requirements:** R4, R5, R6, R8, R9, R10, AE2, AE3, AE4

**Dependencies:** U1, U2

**Files:**
- Modify: `tui/src/components/BodyPane.tsx`
- Modify: `tui/src/components/PromptComposer.tsx`
- Modify: `tui/src/components/HomeScreen.tsx`
- Test: `tui/src/components/__tests__/HomeScreen.test.tsx`
- Test: `tui/src/components/__tests__/PromptComposer.test.tsx`

**Approach:**
- Keep the default transcript row model intact: assistant marker rows, user prompt rows, row gaps, soft-wrap continuation spacing, and scrollbars stay recognizable.
- Only wrap the surfaces that the current UI already treats as message/input blocks; do not paint empty canvas rows, global spacers, header, cwd, or status rows.
- Preserve composer visible-row reporting and cursor position calculations; if background rows are enabled around the composer, account for them explicitly without changing submit/edit behavior.
- Keep fallback rendering visually equivalent to today's GitHub Dark text-only mode.

**Patterns to follow:**
- `tui/src/components/HomeScreen.tsx` layout budgeting and bottom-sticky behavior.
- `tui/src/components/PromptComposer.tsx` visible row and cursor positioning logic.
- `tui/src/components/BodyPane.tsx` row wrapping and scroll-window logic.

**Test scenarios:**
- Covers AE2. Happy path: a background-enabled user/message block renders with half-line rows and no extra unrelated app-canvas painting.
- Covers AE3. Fallback path: with background disabled, user/message content renders with the same markers, text, and row counts as the text-only mode.
- Covers AE3. Edge case: background fallback preserves body item gaps and soft-wrapped continuation spacing.
- Covers AE3. Integration: composer wrapping and cursor row expectations remain stable after the wrapper is introduced.
- Covers AE4. Scope guard: no backend client, session, protocol, or model test fixtures change.

**Verification:**
- Existing HomeScreen and PromptComposer layout tests still prove bottom-sticky rows and wrapping behavior.
- Background-enabled tests cover only existing Ink TUI display surfaces.

---

### U4. Split transcript rendering helpers before adding more behavior

**Goal:** Keep TUI source files within the repository's focused-file guideline by extracting transcript row shaping or background-specific helpers out of `BodyPane.tsx`.

**Requirements:** R8, R9

**Dependencies:** U1

**Files:**
- Modify: `tui/src/components/BodyPane.tsx`
- Create: `tui/src/components/bodyRows.ts`
- Test: `tui/src/components/__tests__/HomeScreen.test.tsx`

**Approach:**
- Move pure transcript row derivation, wrapping, gap insertion, and entry labeling into a focused helper module if implementation would otherwise grow `BodyPane.tsx` further.
- Keep `BodyPane.tsx` responsible for rendering and scroll-window orchestration.
- Preserve existing exported behavior such as row counting for HomeScreen layout.

**Patterns to follow:**
- Repository file-size guideline in `AGENTS.md`.
- Existing helper extraction style in `tui/src/libs/text/clipText.ts` and `tui/src/libs/terminal/mouse.ts`.

**Test scenarios:**
- Happy path: existing BodyPane tests for scrollability, row gaps, prompt styling, and wrapping continue to pass after extraction.
- Edge case: multiline body entries still normalize before wrapping.
- Integration: HomeScreen row budgeting still uses the same body row count for scroll limits and layout.

**Verification:**
- `BodyPane.tsx` remains focused on rendering after the extraction.
- No visual behavior changes are introduced by the extraction alone.

---

### U5. Update planning/docs references from One Dark Pro to GitHub/Gemini direction

**Goal:** Align checked-in TUI planning docs with the chosen GitHub/Gemini-style internal theme direction without widening current scope into full theme configuration.

**Requirements:** R1, R2, R9, R10, AE4

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md`
- Modify: `docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md`

**Approach:**
- Update stale One Dark Pro wording only where it conflicts with the confirmed GitHub/Gemini direction.
- Preserve checked review states where existing plan bullets are already checked, and only reset changed content bullets if review tracking requires it.
- Keep broader theme configuration deferred.

**Patterns to follow:**
- Plan document checkbox rules in `AGENTS.md`.
- Existing requirement language that defers full theme configuration.

**Test scenarios:**
- Test expectation: none -- documentation-only alignment with no runtime behavior change.

**Verification:**
- Docs no longer contradict the active theme direction.
- Docs still state that user-facing theme configuration is deferred.

---

## System-Wide Impact

- **Interaction graph:** The work stays inside TypeScript Ink rendering components and tests; Rust backend, JSON-RPC, sessions, and model/runtime behavior remain untouched.
- **Error propagation:** Existing validation and backend failure messages continue to surface as text with `ERROR:` and error foreground color.
- **State lifecycle risks:** Background-enabled rendering must not change prompt state, body scroll state, composer visible row reporting, or cursor placement.
- **API surface parity:** No public API, CLI flag, JSON-RPC method, or user setting is added.
- **Integration coverage:** HomeScreen-level tests should prove that adding the primitive does not break layout priority or bottom-sticky behavior.
- [ ] **Unchanged invariants:** Ink remains the committed TUI and Rust remains headless-capable; theme rendering is not a backend concern.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Half-line background rows change layout height unexpectedly. | Keep the primitive opt-in and test both enabled and fallback rendering against HomeScreen/PromptComposer row expectations. |
| Background rendering reintroduces terminal artifacts in some environments. | Make fallback behavior first-class and keep text-only markers/colors as the baseline readability contract. |
| Scope drifts into Gemini-like theme configuration. | Keep the plan limited to internal tokens and primitives; defer `/theme`, custom theme files, and persistence. |
| `BodyPane.tsx` grows past the focused-file guideline. | Extract pure row shaping/background helpers before adding new rendering behavior. |

---

## Documentation / Operational Notes

- No user-facing documentation is required for this slice because there is no theme setting or command.
- Internal planning docs should be updated only to remove stale One Dark Pro direction and record the GitHub/Gemini-style internal theme decision.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-29-gemini-style-tui-theming-requirements.md](../brainstorms/2026-06-29-gemini-style-tui-theming-requirements.md)
- Existing TUI plan: [docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md](2026-06-25-003-feat-first-ink-tui-homepage-plan.md)
- Existing TUI requirements: [docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md](../brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md)
- TUI instructions: `tui/AGENTS.md`
- External reference: Gemini CLI `HalfLinePaddedBox` and theme manager patterns from `google-gemini/gemini-cli`
