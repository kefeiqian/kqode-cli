---
date: 2026-07-01
topic: tui-exit-summary-card
---

# TUI Exit Summary Card and KQode Emblem

## Summary

When the KQode TUI exits, replace the leftover full-screen frame with a compact, Copilot-CLI-style summary card: a KQode emblem on the left and a column of stat rows on the right (Changes, Duration, Cost, Tokens, Resume). Rows whose data isn't wired yet render as deliberate placeholders; the shell prompt returns just below the card with earlier scrollback preserved.

---

## Problem Frame

Today, quitting the TUI leaves its last rendered frame — the "KQode v0.1.0" header over a mostly empty body — sitting in the terminal scrollback. There is no sense of closure, no session recap, and the abandoned frame reads like a glitch rather than a deliberate sign-off.

Mature terminal agents (e.g. GitHub Copilot CLI) end a session with a branded summary card that recaps the run at a glance and hands the prompt cleanly back to the shell. KQode has neither the card nor a visual brand mark to anchor it. The gap is pure polish today, but it compounds: every later milestone that produces real session data (tokens, cost, resumable sessions, diffs) will want somewhere to surface it at exit, and there is currently no home for it.

---

## Actors

- A1. User: Quits the TUI (Ctrl+C today) and reads the summary card the shell leaves behind.
- A2. Ink TUI: Owns the card — captures TUI-side session data (start time, message count), renders the emblem and rows, collapses the live frame, and prints the card inline on exit.
- A3. Rust backend: Produces none of the card's data today; the future source of real Tokens/Cost/Resume values once the provider layer and session store land.
- A4. Local git: Queried by the TUI to compute the Changes row; an absent git or non-repo cwd is a valid state.

---

## Key Flows

- F1. Exit summary
  - **Trigger:** The user quits the TUI (Ctrl+C today; future explicit-exit paths).
  - **Actors:** A1, A2, A4
  - **Steps:** The TUI reads the session data it captured during the run (start time → duration, messages sent, startup git baseline → working-tree delta); assembles the card (emblem + rows, real values where available, placeholders otherwise); collapses/erases the live TUI frame; prints the card to normal output so it lands in scrollback; the backend is disposed and the shell prompt returns directly below the card.
  - **Outcome:** A branded recap replaces the abandoned frame, earlier scrollback is preserved, and the prompt returns cleanly.
  - **Escape path:** If session data or git is unavailable, affected rows render as placeholders rather than blocking or erroring the exit.

---

## Requirements

**Exit summary card**
- R1. On TUI exit, render a summary card that replaces KQode's live full-screen frame instead of leaving it in scrollback.
- R2. Lay the card out as a compact KQode emblem on the left with a right-hand column of labeled stat rows, mirroring the Copilot CLI exit card's structure.
- R3. Include these rows, in this order: Changes, Duration, Cost, Tokens, Resume. Order and labels are KQode's adaptation of the reference, not a literal copy.

Illustrative layout (art and marker not final — see Outstanding Questions):

```
 [KQode]    Changes   +12 −4     (real)
 [emblem]   Duration  2m 5s      (real)
            Cost      —          (placeholder)
            Tokens    —          (placeholder)
            Resume    —          (placeholder)
```

**Stat rows and data sources**
- R4. Changes shows a git working-tree line delta (`+added −removed`) computed against a baseline captured at TUI startup; when the cwd is not a git repo or git is unavailable, it renders as a placeholder.
- R5. Duration shows real wall-clock elapsed time from TUI start to exit.
- R6. Cost occupies the slot Copilot labels "AI Credits"; it renders as a placeholder now and is shaped to show real spend once a provider is wired. It must not imply subscription credits.
- R7. Tokens renders as a placeholder now, shaped to later carry up/down counts with cached/reasoning breakdowns once the provider layer reports usage.
- R8. Resume renders as a placeholder now, shaped to later show a real `kqode --resume=<id>` command once the session store surfaces a session id.
- R9. Placeholder rows render with a consistent, deliberate marker (e.g. a dim `—`) so the card reads as intentional, never broken or half-loaded.

**KQode emblem**
- R10. Provide a compact KQode emblem (roughly 2–4 rows tall) sized to sit beside the stat column, authored as a reusable brand asset rather than an exit-only string.
- R11. The emblem must degrade gracefully in narrow terminals, consistent with the TUI's existing width-based header collapse.

**Terminal behavior**
- R12. Collapse or erase the live TUI frame before printing the card so the card is not stacked on top of the abandoned frame.
- R13. Print the card to normal terminal output so earlier scrollback is preserved and the shell prompt returns directly below the card.
- R14. Restore terminal state on this exit path (background color, mouse tracking, window title) exactly as the current clean-shutdown path does.

---

## Acceptance Examples

- AE1. **Covers R1, R12, R13.** Given a running TUI, when the user quits, then the leftover full-screen frame is gone, the summary card appears in its place, and the shell prompt sits directly below the card with prior scrollback still visible above it.
- AE2. **Covers R4.** Given the workspace is a git repo with 3 added and 1 removed line since TUI start, when the user exits, then Changes shows `+3 −1`.
- AE3. **Covers R4, R9.** Given the cwd is not a git repo, when the user exits, then Changes renders the placeholder marker rather than `+0 −0` or an error.
- AE4. **Covers R5.** Given the TUI ran for 2 minutes 5 seconds, when the user exits, then Duration shows a human-readable elapsed time (e.g. `2m 5s`).
- AE5. **Covers R6, R7, R8, R9.** Given no provider or session store is wired, when the user exits, then Cost, Tokens, and Resume each show the placeholder marker while Changes and Duration show real values.

---

## Success Criteria

- Quitting the TUI feels like a deliberate sign-off: the user sees a branded recap, not an abandoned frame, and the prompt returns cleanly.
- The card is visibly the same shape as the Copilot CLI reference (emblem-left, rows-right) while staying honest about which values are real.
- A downstream implementer can populate any placeholder row later by supplying data to that row, without restructuring the card or the emblem.
- ce-plan can build v1 entirely TUI-side, with no backend or protocol change required, from this document.

---

## Scope Boundaries

- No backend or protocol changes to source Tokens, Cost, or Resume data in v1 — those rows are placeholders until their milestones land.
- No AI-attributed change tracking or VFS diff; Changes is a raw git working-tree delta, not "edits the agent made."
- No redesign of the startup Header (`tui/src/components/Header.tsx`); the emblem is authored reusably, but wiring it into startup is out of scope here.
- Not a general session-analytics or history surface — this is the exit card only.
- Exact emblem artwork and the exact placeholder glyph are design/planning details, not fixed here.

---

## Key Decisions

- Full Copilot-style layout now with placeholder rows (over a smaller real-data-only card): visual parity first; rows fill in as data becomes available.
- "Cost" plus a real "Duration" row replace Copilot's "AI Credits": KQode is bring-your-own-key, so a subscription-credit row would misrepresent the model.
- Emblem is a compact left-side mark reusable at startup, not a figlet banner or a one-line wordmark.
- Exit collapses the live frame and prints the card inline, preserving scrollback (over a full-screen clear or a plain append): matches the reference and the TUI's scrollback-preserving rendering design.
- The card is rendered TUI-side from data the TUI already holds or computes, since the backend produces none of it today.

---

## Dependencies / Assumptions

- Assumes the backend remains a pure echo for this work; real Tokens/Cost values depend on the planned provider/streaming milestone (`docs/brainstorms/2026-06-30-llm-provider-streaming-chat-requirements.md`), which itself defers cost/token-usage display.
- Assumes a real Resume value depends on the session store and `/resume` from the homepage plan (`docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md`) being wired through to the TUI; neither is present in the current echo backend.
- Assumes git may be invoked from the workspace cwd at startup and exit to compute Changes; the TUI already runs outside the backend's scrubbed-env sandbox.
- Assumes the existing clean-shutdown teardown (`tui/src/bootstrap.ts` background/title restore, `tui/main.tsx` `waitUntilExit().finally(dispose)`) is the hook the card renders around.
- Card rendering must respect the TUI's incremental-rendering and final-column constraints documented in `tui/AGENTS.md`.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R12][Technical] How to erase Ink's final incremental-rendered frame and print the card cleanly on exit without reintroducing the win32 clear/blink issue described in `tui/AGENTS.md` (Ink unmount + manual write vs `<Static>` vs alt-screen).
- [Affects F1][Technical] Which exit triggers show the card (Ctrl+C only today, plus any future `/exit`, Ctrl+D, or error-exit paths) and whether error exits should suppress it.
- [Affects R4][Technical] Exact git baseline mechanics: `git diff --shortstat` against a startup snapshot vs another method, and behavior when the working tree is already dirty at startup.
- [Affects R10][Needs research] The actual emblem artwork — a KQode mark that reads at ~2–4 rows and degrades in narrow terminals.
- [Affects R9][Design] The exact placeholder marker and row styling (dim `—` vs other) for unfilled rows.
