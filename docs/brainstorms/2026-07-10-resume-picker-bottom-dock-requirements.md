---
date: 2026-07-10
topic: resume-picker-bottom-dock
---

# Resume Picker Bottom Dock and Table Fixes

## Summary

Rework the `/resume` picker from a full-screen surface into a compact panel docked at the bottom of the Home screen, keeping the live conversation visible above it. Fix the session table so columns align under their headers, render each session's folder as a home-relative `~` path, collapse the three-line header into a single `Resume Session:` label, add a clear divider between the conversation and the panel, and cap the visible list at ~10 rows with scrolling beyond that.

This is a visual and interaction rework of the existing resume feature (`docs/brainstorms/2026-07-08-local-session-resume-requirements.md`); the backend session-list/resume APIs are unchanged.

---

## Problem Frame

`/resume` today takes over the whole terminal, hiding the conversation the user is deciding whether to leave. The session table is also visibly broken: assembling the row runs a whitespace-collapsing normalize over the already-padded columns, so every cell's padding is squeezed to a single space and nothing lines up under its `# Summary Status Modified Created Folder` headers. The `Folder` column shows a raw absolute path (`C:\Users\…`) that end-truncates away the one part that identifies the session — the leaf folder. And the panel carries a three-line preamble (`/resume`, `Resume a saved local session.`, `Local sessions only · newest modified first`) that costs vertical space without earning it.

---

## Requirements

**Layout and docking**
- R1. Render `/resume` as a panel docked at the bottom of the Home screen, keeping the conversation body visible above it (like the slash-command menu), instead of a full-screen surface that replaces Home.
- R2. Place a full-width horizontal divider (an `<hr>`-equivalent rule) between the conversation body and the resume panel so the boundary is visually unambiguous.
- R3. Replace the three header lines (`/resume`, `Resume a saved local session.`, `Local sessions only · newest modified first`) with a single `Resume Session:` label above the table.

**Table formatting**
- R4. Align each column under its header with padding preserved — do not collapse inter-column whitespace when assembling or truncating a row. Per-cell truncation stays; whole-row normalize is the bug to remove.
- R5. Render the `Folder` column as a home-relative path: when the folder is inside the user's home directory, replace the home prefix with `~`; when it exceeds the column width, middle-truncate so the meaningful tail folder is kept (e.g. `~\...\blog-v0.1`), not the leading segments.

**Capping and scrolling**
- R6. Cap the visible session list at ~10 rows regardless of terminal height (the panel no longer expands to fill the screen).
- R7. When more sessions exist than the cap, scroll through them within the fixed window, keeping the highlighted row in view.

**State feedback and interaction**
- R8. Preserve loading / empty / failed / resuming feedback and the "current draft is not listed until you submit its first prompt" hint within the compact panel, now that the three-line block that carried some of it is gone.
- R9. While the panel is open it owns navigation: `↑/↓` moves the highlight, `enter` resumes the highlighted session, `esc` closes the panel back to the conversation. The composer underneath is not interactive while the panel is open.

---

## Acceptance Examples

- AE1. **Covers R4.** Given three saved sessions of differing summary/folder lengths, when the panel renders, each row's `Status`, `Modified`, `Created`, and `Folder` cells start at the same column as their headers.
- AE2. **Covers R5.** Given a session whose folder is `C:\Users\kefeiqian\Projects\KQode\blog-v0.1` and a narrow column, when rendered, the cell shows a home-relative middle-truncated path ending in `blog-v0.1` (e.g. `~\...\blog-v0.1`).
- AE3. **Covers R5.** Given a session whose folder is outside the user's home directory, when rendered, no `~` substitution occurs and the path is shown/truncated as an absolute path.
- AE4. **Covers R6, R7.** Given 15 saved sessions, when the panel opens, at most ~10 rows are visible and pressing `↓` past the last visible row scrolls the window while keeping the highlight in view.
- AE5. **Covers R1, R9.** Given an active conversation, when `/resume` opens, the conversation remains visible above the divider, and pressing `esc` returns to the conversation with the composer active again.

---

## Success Criteria

- The table reads as a real aligned table: a user can scan down any column and see values under the correct header.
- The folder column identifies each session at a glance via its tail folder, with `~` standing in for the home directory.
- Opening `/resume` no longer hides the conversation; the divider makes the panel read as an overlay on the current session, not a new screen.
- A downstream implementer can build this from the requirements without re-deciding layout, path formatting, or cap behavior.

---

## Scope Boundaries

- No `Type` column and no `All / Local / Remote` tabs from the reference screenshot — KQode is local-only, so there is no remote/type dimension to show.
- No new footer actions (search, delete, sort) — keep today's `↑/↓ · enter · esc` hints.
- No change to the backend `kqode.session.list` / `kqode.session.resume` contracts or to what data a session carries.
- No change to resume semantics (which turns restore, compaction handling, blocking while a turn is active).

---

## Key Decisions

- Bottom-docked panel over Home (not a bottom-pinned variant of the full-screen surface): keeps the conversation as context while choosing, matching the reference screenshot.
- Fix alignment by removing the whole-row whitespace normalize, not by switching to literal tab characters: preserves column padding while keeping terminal-safe fixed-width rendering.
- Home-relative middle-truncation for `Folder`: the tail folder is the identifying part, so truncate the middle rather than the end.
- Panel takes over input while open (composer inert) rather than sharing input like the slash menu: resume has no text query, so there is nothing to type into the composer.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Whether the `~` substitution and middle-truncation happen backend-side (in the session summary) or TUI-side at render. Product intent is fixed (R5); the seam is a planning choice.
- [Affects R8][Technical] Exact placement of loading / empty / failed / resuming states and the "current draft not listed" hint within the compact panel — inline beside/under the `Resume Session:` label vs in the table body area.
- [Affects R6][Technical] Whether the ~10-row cap is a constant or derives from a fraction of terminal height, and how it behaves on very short terminals.
- [Affects R1, R2][Technical] How the docked panel and divider compose with the existing bottom-sticky cwd/composer/status stack and the safe-render column/cursor rules in `tui/AGENTS.md`.
