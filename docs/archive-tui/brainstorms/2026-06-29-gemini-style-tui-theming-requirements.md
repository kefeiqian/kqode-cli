---
date: 2026-06-29
topic: gemini-style-tui-theming
---

# Gemini-Style TUI Theming

## Summary

Refine the existing U3/U4 TUI work so KQode keeps the current home screen, body transcript, and composer behavior while adopting Gemini CLI's safer theme-rendering idea: centralized foreground colors plus optional internal background primitives that avoid terminal row-seam artifacts.

---

## Problem Frame

The current U3/U4 slice has already established the Ink home screen, bottom-sticky composer layout, body transcript wrapping, row gaps, and GitHub Dark text-only foreground palette. Attempts to paint the app or message backgrounds directly exposed terminal-specific horizontal color gaps caused by row-height and cell-background rendering.

Gemini CLI handles a similar problem by separating theme semantics from rendering mechanics. It keeps a theme system with text/background/message tokens, detects terminal background where possible, and uses a dedicated wrapper for background blocks rather than relying only on normal row background painting. KQode needs the same idea scoped to the current TUI slice, without adding a user-facing theme picker or new product behavior.

---

## Actors

- A1. User: Reads the TUI transcript, types prompts, and expects message blocks and text colors to be visually clear without artifacts.
- A2. TUI implementer: Extends the existing U3/U4 components while preserving layout, wrapping, and bottom-sticky behavior.
- A3. Terminal environment: May support truecolor and background rendering differently across Windows Terminal, IDE terminals, and plain terminal profiles.

---

## Key Flows

- F1. Transcript renders with text-only theme
  - **Trigger:** The TUI renders assistant/body output, user-submitted prompts, composer text, errors, or status rows.
  - **Actors:** A1, A2
  - **Steps:** The TUI applies centralized foreground colors and non-color markers to existing transcript and composer elements.
  - **Outcome:** The UI remains readable and styled without requiring any background color support.
  - **Covered by:** R1, R2, R3, R8

- F2. Optional background block renders without row seams
  - **Trigger:** A message or input block opts into background rendering.
  - **Actors:** A1, A2, A3
  - **Steps:** The TUI renders the block using a Gemini-inspired half-line strategy where supported, and falls back cleanly when not supported or disabled.
  - **Outcome:** Background blocks look continuous in capable terminals and do not degrade readability elsewhere.
  - **Covered by:** R4, R5, R6, R7, R8

---

## Requirements

**Theme semantics**
- R1. KQode must use a centralized GitHub/Gemini-inspired text theme for the existing TUI elements, including primary text, muted text, accents, success, warning, error, and border/scrollbar colors.
- R2. The theme must remain internal to U3/U4 for this slice; it must not introduce a `/theme` command, persisted theme selection, custom theme files, or user-facing theme settings.
- R3. Foreground colors must enhance meaning without being the only signal; existing non-color markers such as `ERROR:`, `❯`, `•`, selected-row pointers, pending labels, and scrollbars remain part of the visual contract.

**Background rendering**
- R4. Background rendering, when used, must be an internal rendering primitive for existing message/input blocks rather than a global app-canvas paint strategy.
- R5. Background blocks must avoid the observed row-seam artifact by following Gemini CLI's half-line padding idea, not by painting every app row with normal text/background styling.
- R6. Background rendering must be optional or fallback-aware so unsupported terminals, screen-reader contexts, or color-disabled sessions can render the same content without background blocks.
- R7. Background colors must be derived from centralized theme tokens and should account for the terminal background where that information is available.

**Existing U3/U4 behavior preservation**
- R8. The update must preserve current body wrapping, tighter soft-wrap continuation spacing, larger gaps between transcript items, scroll behavior, bottom-sticky cwd/composer/status rows, and composer cursor behavior.
- R9. The update must remain limited to existing U3/U4 surfaces: static home screen components, body transcript rows, prompt composer, status/cwd/header styling, and related tests.
- R10. The update must not add new backend behavior, agent/session features, command execution, slash-command behavior, model calls, or daemon/runtime changes.

---

## Acceptance Examples

- AE1. **Covers R1, R3, R8.** Given the TUI renders body output and user prompts, when colors are enabled, the user sees GitHub/Gemini-style foreground colors with `•` assistant markers, `❯` user markers, red error text, and readable status/composer text.
- AE2. **Covers R4, R5, R7.** Given a user or input block uses background rendering in a capable terminal, when the block is displayed, the background appears continuous without thin horizontal seams between terminal rows.
- AE3. **Covers R6, R8.** Given background rendering is disabled or unsupported, when the same transcript renders, content remains readable with text colors and non-color markers, and layout/wrapping behavior is unchanged.
- AE4. **Covers R2, R9, R10.** Given the update is complete, when a downstream reviewer checks scope, they find no theme picker, persisted theme settings, custom theme loading, backend protocol changes, or new agent features.

---

## Success Criteria

- KQode's TUI looks closer to mature coding-agent CLIs without reintroducing background stripe artifacts.
- A downstream planner can implement theming as reusable internal primitives while preserving U3/U4 layout and interaction contracts.
- Reviewers can verify that the work is a visual/rendering refinement only, not an expansion into theme configuration or agent behavior.

---

## Scope Boundaries

- User-facing theme selection, custom theme files, `/theme`, and theme persistence are out of scope.
- Global app-canvas painting with normal row backgrounds is out of scope because it caused visible seam artifacts.
- Backend/session/agent features are out of scope; the work stays on current TUI display components and tests.
- Exact terminal capability probing and fallback mechanics are deferred to planning, but the requirements require fallback-aware behavior.

---

## Key Decisions

- Internal theme primitives only: This keeps the work aligned with existing U3/U4 functions instead of creating a new configuration feature.
- GitHub/Gemini visual direction: This replaces earlier One Dark Pro wording for this refinement while keeping colors centralized.
- Background blocks as optional rendering primitive: The default readability contract comes from text colors and markers; background blocks are polish that must not break unsupported terminals.

---

## Dependencies / Assumptions

- The current scope is based on the existing U3/U4 TUI work and the referenced change range `7ccc99ae346bdca9ed974798b46a7c08f0dbc4b9..00f2460d592338e8354d6bc7af263c8bbb64a58d`.
- Gemini CLI's observed pattern is used as a product behavior reference only; KQode should copy the idea, not vendor or fork Gemini source.
- Terminal rendering differs enough that background support must be treated as capability-dependent.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5, R6][Technical] Decide the exact fallback gate for the half-line background primitive, including truecolor support, screen-reader mode, and color-disabled sessions.
- [Affects R7][Technical] Decide whether this slice should query terminal background color or simply blend against a known theme background token.
