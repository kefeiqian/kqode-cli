---
date: 2026-07-08
topic: local-session-resume
---

# Local Session Resume

## Summary

Add a local-only `/resume` flow that lets KQode reopen prior non-empty sessions after restart. The v1 experience is a single session table sorted by last modified time, spanning every workspace, and resuming directly into the original session folder.

---

## Problem Frame

KQode can now persist local state in SQLite, but there is no user-facing way to reopen past work after closing the app. That forces every restart to behave like a fresh session even when the user expects to continue an earlier conversation.

The missing behavior is not just transcript recovery. Users need a predictable picker that shows which sessions exist, enough metadata to distinguish them, and a clear way to continue work from any prior workspace without exposing internal IDs.

---

## Actors

- A1. KQode user: Reopens a prior session to continue work after restarting the app.
- A2. KQode TUI: Lists resumable sessions, shows distinguishing metadata, and lets the user select one.
- A3. Local session store: Persists session metadata and history needed to rebuild a selected session.

---

## Key Flows

- F1. Resume a prior session
  - **Trigger:** The user opens `/resume`.
  - **Actors:** A1, A2, A3
  - **Steps:** The TUI loads the local session list, orders rows by last modified time, renders the table, the user selects a row, and KQode restores that session's history and switches into its original folder.
  - **Outcome:** The selected session becomes the active session and can continue normally.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R9

- F2. Create a resumable session
  - **Trigger:** A brand-new KQode session receives its first submitted prompt.
  - **Actors:** A1, A3
  - **Steps:** KQode records the session identity, saves session metadata, stores conversation history, and makes the session eligible for future `/resume` listings.
  - **Outcome:** Restarting KQode later can show and reopen that session.
  - **Covered by:** R7, R8

---

## Requirements

**Session persistence**
- R1. KQode must persist enough local session history and metadata to reopen a prior session after the app is closed and reopened.
- R2. `/resume` must be backed by local storage only; no remote session support is included in v1.
- R3. A resumed session must restore the conversation history needed for the user to continue the same session rather than starting a new one.

**Resume table**
- R4. `/resume` must show a single session table with no top tab bar.
- R5. The table must include the same visible columns as the screenshot except for `Type`: `#`, `Summary`, `Status`, `Modified`, `Created`, and `Folder`.
- R6. The table must list sessions from any workspace, not only the current folder.
- R7. Rows must be sorted by last modified time, newest first.
- R8. The `#` column must be a display-order number only; KQode must not show the real session ID in the UI.
- R9. Each row must show a summary seeded from the session's first user prompt in v1.
- R10. The `Folder` column must let the user distinguish sessions from different workspaces.
- R11. The `Status` column must use a simple local-only state model in v1: the active session shows `Current`, and all other listed sessions show `Idle`.

**Eligibility and resume behavior**
- R12. A newly created session must not appear in `/resume` until it has at least one submitted prompt.
- R13. Selecting a row in `/resume` must switch KQode into that session's original folder before continuing the resumed session.
- R14. Resuming a session must continue using the selected session record rather than creating a replacement copy.

**Deliberate exclusions**
- R15. The v1 `/resume` UI must not expose raw session IDs.
- R16. The v1 `/resume` UI must not include remote/local switching controls.
- R17. The v1 `/resume` UI must not depend on LLM-generated titles; richer titles can be added later.

---

## Acceptance Examples

- AE1. **Covers R4, R5, R6, R7, R8, R10, R11.** Given KQode has stored sessions from multiple folders, when the user opens `/resume`, then the UI shows one local-only table with `#`, `Summary`, `Status`, `Modified`, `Created`, and `Folder`, ordered by most recently modified, with no raw session IDs and no top tabs.
- AE2. **Covers R9, R12.** Given a brand-new session has been opened but no prompt was submitted, when the user later opens `/resume`, then that session is absent; once the first prompt is submitted, it appears with a summary based on that first user prompt.
- AE3. **Covers R3, R13, R14.** Given the user selects a session created in a different folder, when resume completes, then KQode switches into that original folder, restores the session history, and continues the same session record.
- AE4. **Covers R2, R16, R17.** Given the user opens `/resume` in v1, when they inspect the UI, then they see no remote tab, no remote-session affordance, and no LLM-generated title requirement.

---

## Success Criteria

- A user can close KQode, reopen it later, and continue a prior non-empty session without needing to remember or enter a session ID.
- A planner or implementer can build `/resume` without inventing which sessions are listed, which metadata columns appear, or how cross-folder resume behaves.

---

## Scope Boundaries

- No remote session sync, remote tab, or local/remote toggle.
- No raw session ID display in the picker.
- No LLM-generated title in v1; the first user prompt is the initial summary source.
- No listing of empty sessions that never received a submitted prompt.

---

## Key Decisions

- Single-table picker over tabbed navigation: v1 is local-only, so the table should be the whole experience.
- Display-order numbering instead of visible IDs: users choose sessions by recency and summary, not by internal identifiers.
- Cross-workspace resume is in scope: the picker is global, and selecting a session switches into that session's original folder.
- Screenshot fidelity matters for table metadata: keep the visible structure from the reference image, but drop `Type` because it would be redundant in local-only v1.

---

## Dependencies / Assumptions

- SQLite is now available as the local index for session listing and lookup.
- KQode can persist and later reload the history needed to continue a session.
- The first user prompt is an acceptable temporary summary source until richer title generation exists.

