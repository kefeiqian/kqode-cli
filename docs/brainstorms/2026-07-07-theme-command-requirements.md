---
date: 2026-07-07
topic: theme-command
---

# Theme Command

## Summary

KQode will add a `/theme` command that lets users choose from a small built-in catalog of dark, readability-first terminal themes. The selected theme applies immediately, persists in KQode's user-global settings database, and is reused on future TUI starts.

---

## Problem Frame

KQode already has centralized theme tokens and a Dracula-style default palette, but the theme is fixed at build time. Users who prefer another common terminal/editor color scheme have no in-app way to choose it, even though theme preference is a durable personal setting.

Earlier theming work intentionally excluded a picker, persisted theme settings, custom theme files, and backend changes so the first visual slice could stay focused on safe rendering. This feature reopens only the user-facing selection and persistence part of R65, without expanding into custom theme infrastructure or light-theme support.

---

## Key Decisions

- **Dark-only v1.** The first catalog stays dark-only to reduce terminal-background surprises while still giving users meaningful choice.
- **Readability over breadth.** KQode should ship fewer high-quality presets rather than a large catalog with inconsistent contrast or incomplete token coverage.
- **User-global preference.** Theme selection is personal UI configuration and should follow the user across workspaces rather than becoming project behavior.
- **Immediate apply and persist.** Selecting a theme should update the current TUI session right away and make the same choice the default on restart.

---

## Actors

- A1. User: Chooses a preferred dark theme and expects the TUI to remain readable.
- A2. TUI: Presents the `/theme` surface, previews enough styling to make a choice, and applies the selected theme.
- A3. Settings store: Persists the selected theme without storing secrets or project-specific state.
- A4. Terminal environment: Receives the active theme's foreground and background choices through existing terminal-safe rendering behavior.

---

## Key Flows

- F1. Choose a theme
  - **Trigger:** The user enters `/theme`.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** KQode opens a theme picker, shows the current selection, lets the user navigate built-in dark presets, and applies the selected theme when confirmed.
  - **Outcome:** The visible TUI and terminal background switch to the selected theme, and the choice is saved for future sessions.
  - **Covered by:** R1, R2, R3, R4, R6, R8

- F2. Start with a saved theme
  - **Trigger:** The user starts KQode after previously selecting a theme.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** KQode reads the saved theme preference before the opening frame uses theme tokens.
  - **Outcome:** The TUI starts with the user's saved theme instead of briefly painting the default and then switching.
  - **Covered by:** R4, R5, R8

- F3. Continue when persistence is unavailable
  - **Trigger:** KQode cannot read or write the user settings database.
  - **Actors:** A1, A2, A3
  - **Steps:** The TUI keeps running with the default theme or the current in-memory selection and surfaces persistence failure only when the user tries to save a theme.
  - **Outcome:** Theme configuration does not block chat or crash the TUI.
  - **Covered by:** R5, R9

---

## Requirements

**Theme catalog**
- R1. `/theme` must expose built-in dark theme presets only for v1.
- R2. The initial catalog must include the current Dracula-style palette plus a small set of popular dark terminal/editor themes, such as One Dark, Nord, Gruvbox Dark, Tokyo Night, and Catppuccin Mocha.
- R3. Every preset must define the complete semantic token set needed by the current TUI, including foreground, muted text, accent colors, warning, error, border, message background, input background, and terminal background.
- R4. Every preset must meet a readability threshold for normal text, muted text, selection markers, warnings, and errors on its own dark background.

**Selection behavior**
- R5. The active theme must load before the first TUI frame that uses theme tokens.
- R6. Selecting a theme from `/theme` must apply it immediately in the current session.
- R7. The selected theme must persist as a user-global preference and be reused across workspaces.
- R8. `/theme` must make the current selection visible and let the user leave without changing it.
- R9. If persistence is unavailable, KQode must keep the session usable and tell the user when a theme choice cannot be saved.

**TUI integration**
- R10. Theme changes must update the same centralized TUI tokens used by transcript text, composer text, command surfaces, status rows, errors, borders, and backgrounds.
- R11. Theme changes must update the terminal background through the existing terminal-background setup and restore behavior.
- R12. The feature must preserve current bottom-sticky layout, composer growth behavior, scroll behavior, and manual cursor placement.
- R13. Color must not become the only signal for errors, selected rows, loading states, or other semantic states.

**Scope control**
- R14. The v1 feature must not add light themes, custom theme files, project theme directories, plugin-contributed themes, theme editing, or theme import/export.
- R15. Built-in preset sources and licenses must be traceable and compatible with shipping KQode.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R6, R7, R8.** Given the user opens `/theme`, when they select `Nord` and confirm, then the TUI switches to Nord styling, shows Nord as active when `/theme` is reopened, and persists Nord for future sessions.
- AE2. **Covers R5, R7, R10, R11.** Given the user previously selected `Gruvbox Dark`, when KQode starts again in another workspace, then the opening frame and terminal background use Gruvbox Dark without first flashing the default theme.
- AE3. **Covers R3, R4, R13.** Given any built-in preset is active, when the TUI renders transcript rows, status hints, selected rows, warnings, and errors, then each state remains readable and is not conveyed by color alone.
- AE4. **Covers R9.** Given the settings database cannot save preferences, when the user selects a theme, then KQode keeps running and tells the user the selection cannot be persisted.
- AE5. **Covers R12, R14.** Given the feature is complete, when a reviewer checks the TUI behavior, then they find no layout/cursor regression and no light theme, custom theme file, project theme directory, or plugin theme support.

---

## Success Criteria

- Users can choose a familiar dark terminal theme without editing files or restarting manually.
- The selected theme survives restart and workspace changes.
- The TUI remains readable across all built-in presets.
- The feature satisfies the user-visible part of R65 without pulling in custom theme infrastructure.

---

## Scope Boundaries

- Light themes are deferred until KQode has a stronger terminal-background and contrast story for light palettes.
- Custom theme files, user/project theme directories, plugin-contributed themes, and theme editing are deferred.
- Theme selection does not change model/provider settings, transcript data, agent behavior, or workspace state.
- Full terminal capability probing is outside v1 unless planning finds it required to preserve existing safe background behavior.

---

## Dependencies / Assumptions

- The existing slash-command system can host another full-screen selection surface.
- The existing theme token model can become selectable without replacing the current semantic tokens.
- The user settings database is the right persistence home for personal UI preferences.
- Built-in presets can use source palettes whose licenses allow redistribution or attribution in KQode.

---

## Sources / Research

- `docs/brainstorms/2026-06-29-gemini-style-tui-theming-requirements.md` records the prior internal-only theming slice and its explicit exclusion of `/theme`.
- `docs/features/r065_themes_terminal_background_aware_themes_and_project_user_theme_directori.md` names themes as an R65 CLI/TUI experience feature.
- `tui/src/theme/themeConfig.ts` defines the current static Dracula-style theme tokens.
- `tui/src/libs/commands/registry.ts` defines the shared slash-command registry used by command menu, filtering, help, and execution.
- `src/store/providers.rs` shows the existing user-global settings persistence pattern.
- `tui/AGENTS.md` documents the bottom-sticky layout and manual cursor-placement constraints this feature must preserve.
