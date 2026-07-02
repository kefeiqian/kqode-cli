---
title: "feat: TUI exit summary card and KQode emblem"
type: feat
status: completed
date: 2026-07-01
origin: docs/brainstorms/2026-07-01-tui-exit-summary-card-requirements.md
---

# feat: TUI exit summary card and KQode emblem

## Summary

On TUI exit, print a compact Copilot-CLI-style summary card — a KQode emblem beside a column of stat rows (Changes, Duration, Cost, Tokens, Resume) — to the terminal's normal buffer immediately after the app leaves the alternate screen, so it lands in the user's real scrollback with the shell prompt returning below it. The card is rendered entirely TUI-side as a pure formatted string; Changes and Duration carry real values, while Cost, Tokens, and Resume render as deliberate placeholders until the provider layer and session store land.

---

## Problem Frame

Quitting the TUI today is abrupt: the app runs in the alternate-screen buffer, so on exit `leaveAlternateScreen()` restores the user's pre-launch terminal with no session recap at all. Mature terminal agents (Copilot CLI) close with a branded summary card that recaps the run and hands the prompt back cleanly. See origin (`docs/brainstorms/2026-07-01-tui-exit-summary-card-requirements.md`) for the full product framing.

> **Mechanism correction vs origin:** the origin doc framed the problem as a "leftover frame polluting scrollback." Research confirmed the TUI renders in the alternate-screen buffer (`tui/src/libs/terminal/alternateScreen.ts`, DEC mode 1049), so exit already discards the frame and restores real scrollback. The desired outcome is unchanged — the card just needs to print to the normal buffer *after* the alt-screen leave, which realizes origin R1/R12/R13 without any frame-erase logic.

---

## Requirements

- R1. Print a summary card on TUI exit that lands in the restored normal buffer (origin R1).
- R2. Lay the card out as a compact KQode emblem on the left with a right-hand column of labeled stat rows (origin R2).
- R3. Rows in order: Changes, Duration, Cost, Tokens, Resume (origin R3).
- R4. Changes = git working-tree line delta (`+added −removed`) vs a startup baseline; placeholder when not a git repo / git unavailable (origin R4).
- R5. Duration = real wall-clock elapsed from TUI start to exit (origin R5).
- R6. Cost renders as a placeholder now, not implying subscription credits (origin R6).
- R7. Tokens renders as a placeholder now, shaped to later carry up/down + cached/reasoning counts (origin R7).
- R8. Resume renders as a placeholder now, shaped to later carry a real `kqode --resume=<id>` command (origin R8).
- R9. Placeholder rows use a consistent, deliberate marker (dim `—`) so the card reads as intentional (origin R9).
- R10. Provide a reusable compact KQode emblem (~2–4 rows) beside the stat column (origin R10).
- R11. The emblem degrades gracefully in narrow terminals (origin R11).
- R12. The live frame is gone before the card prints — satisfied by the alt-screen leave preceding the print (origin R12).
- R13. Card prints to the normal buffer; scrollback preserved; shell prompt returns below it (origin R13).
- R14. Existing terminal-state restoration on exit (background, alt screen, mouse, title) is preserved unchanged (origin R14).

**Origin actors:** A1 (User), A2 (Ink TUI), A3 (Rust backend — no data today), A4 (Local git)
**Origin flows:** F1 (Exit summary)
**Origin acceptance examples:** AE1 (card replaces frame, prompt below), AE2 (Changes `+3 −1`), AE3 (non-repo → placeholder), AE4 (Duration `2m 5s`), AE5 (Cost/Tokens/Resume placeholders while Changes/Duration real)

---

## Scope Boundaries

- No backend or protocol changes; the card is built from data the TUI already holds or computes at exit.
- No AI-attributed change tracking or VFS diff; Changes is a raw git working-tree delta, not "edits the agent made."
- No startup Header redesign (`tui/src/components/Header.tsx`); the emblem is authored reusably but is only wired into the exit path here.
- Not a session-analytics or history surface — exit card only.

### Deferred to Follow-Up Work

- Real Cost/Tokens values: depend on the provider/streaming milestone (`docs/brainstorms/2026-06-30-llm-provider-streaming-chat-requirements.md`), which itself defers cost/token display.
- Real Resume value: depends on the session store + `/resume` being surfaced to the TUI (`docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md`).
- Wiring the emblem into a startup splash.

---

## Context & Research

### Relevant Code and Patterns

- `tui/src/libs/git/gitStatus.ts` — the git shell-out template: `execFileSync('git', ['-C', cwd, …], { stdio: ['ignore','pipe','ignore'], timeout })` wrapped in try/catch → `undefined`, with pure `parse*`/`format*` split. Mirror this for the Changes reader/parser.
- `tui/src/state/global/workspace.ts` — plain value atoms (`workspaceCwdAtom`, `productVersionAtom`) seeded at boot via `store.set`. Template for the new session atoms.
- `tui/src/state/global/gitStatus.ts` — derived atom reading a `@libs/git` helper plus a `TestOverride` seam; confirms `state/**` may import `@libs/git` (type/text stays clear of the guardrail's forbidden strings).
- `tui/src/libs/terminal/{terminalBackground,alternateScreen,windowTitle,mouse}.ts` — TTY-guarded writers with pure sequence builders (`if (!stream.isTTY) return;`). Home for a new ANSI color helper and the pattern the card writer follows.
- `tui/src/libs/tui/bodyRows.ts` — pure row-building formatters using `theme.colors.*`; template for the pure card formatter.
- `tui/src/bootstrap.ts` / `tui/main.tsx` — composition root; `createAppRuntime` seeds atoms and returns `{ store, dispose }`; `main.tsx` runs `waitUntilExit().finally(dispose)`. `dispose` → `resetTerminalBackground()` then `leaveAlternateScreen()`.
- `tui/src/backend/runtime/backendRuntime.ts` — dependency-injection + isolated-store test pattern to mirror for `computeExitSummary`/`printExitSummary`.
- `tui/src/test/renderWithJotai.tsx` — Jotai `Provider` + isolated store test harness (`ink-testing-library`).

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — own process/session-lived lifecycles at the **composition root** (`main.tsx`/`bootstrap.ts`), never in React effects or Jotai atoms; centralize teardown at `waitUntilExit().finally(dispose)`. The committed guardrail `tui/src/__tests__/backendIsolation.test.ts` forbids `components/**` and `state/**` from textually referencing `node:child_process` (and launch modules). → The exit-card render and git shell-out live at the composition root and in `libs/`; session atoms stay value-only. The KB has **no** terminal-rendering/exit-sequencing learnings — capture this work with `/ce-compound` after it lands.

### External References

- None. The codebase has strong, well-documented local Ink/terminal patterns; external research skipped.

---

## Key Technical Decisions

- **Print after the alt-screen leave.** The card is written to the normal buffer on the clean-exit path, strictly after `dispose()` (which runs `leaveAlternateScreen()`). This restores real scrollback first, then lands the card inline with the prompt below — realizing origin R1/R12/R13 with no frame-erase logic. Anything written *before* the leave would be discarded with the alt buffer.
- **Card as a pure formatted string + `stdout.write`, not a second Ink render.** Simplest lifecycle (no re-mount after the app unmounts and leaves the alt screen), fully deterministic tests, and matches the `libs/` pure-formatter + TTY-guarded-writer conventions.
- **Truecolor ANSI via a small injected `colorize` helper.** No `chalk` (not a direct dependency); a pure `hex → \x1b[38;2;r;g;bm` builder matches the raw-escape convention in `libs/terminal`. Injecting `colorize` keeps the formatter color-agnostic so tests assert plain structure.
- **Changes = working-tree delta vs a startup baseline, clamped ≥ 0.** Baseline (working-tree insertions/deletions vs HEAD) is captured once at boot; at exit the delta is recomputed and the baseline subtracted so pre-existing dirtiness isn't counted. Undefined baseline or exit read → Changes placeholder. Command mirrors `gitStatus.ts` (`git diff --shortstat HEAD`, tracked changes).
- **Capture start-time + baseline once at boot into value-only atoms** via a pure `resolveSessionSeed` (returns the values; the composition root does the `store.set`, so `libs → state` stays a non-edge); git shell-out stays in `libs/`, never in `state/**` or `components/**` (guardrail).
- **Both entry points wire the card through one shared `finishSession` helper.** The packaged binary compiles from `tui/packaged/entry.packaged.tsx`, not `main.tsx`; routing both through `finishSession` prevents the card from working in dev/tests but silently missing from the shipped executable.
- **Colors stay legible on the restored (arbitrary) terminal background.** The card prints after the OSC-11 background override is reset, so it uses the terminal's default foreground for the emblem/labels/Duration and reserves truecolor only for the `+`/`−` Changes semantics and the muted placeholder — avoiding an invisible near-white card on light themes.
- **Card prints only on the clean-exit `finally` path**, not the `process.once('exit')` hard-exit safety net, so crash/error output stays clean.
- **`printExitSummary` is defensive** — a formatting/git error must never throw during teardown and break clean shutdown.
- **Emblem art and the exact placeholder glyph are directional**, settled during implementation.

---

## Open Questions

### Resolved During Planning

- Where does exit logic live? → Composition root: `bootstrap.ts` seeds atoms; a shared `finishSession` helper (called from both the source `main.tsx` and packaged `entry.packaged.tsx`) runs `dispose()` then prints (per the lifecycle learning + guardrail).
- How to "collapse the live frame"? → The existing alt-screen leave already restores the normal buffer; print after it.
- Colorization without `chalk`? → Small injected ANSI truecolor helper in `libs/terminal`, applied only to `+`/`−` semantics so the card stays legible on any terminal background.
- Emblem narrow-terminal degradation? → Reuse `Header`'s COMPACT/HIDE column thresholds: full → single-line wordmark → omitted (rows reflow left).
- Changes semantics? → Baseline-subtracted working-tree delta vs HEAD, clamped ≥ 0 (accepts git's singular and plural shortstat forms); placeholder on failure/non-repo.

### Deferred to Implementation

- Exact emblem artwork (~2–4 rows) — directional only.
- Column alignment widths and whether a leading/trailing blank line improves spacing.
- On-terminal validation (WezTerm + Windows Terminal + a light-background terminal) that the card actually prints on Ctrl+C and lands in restored scrollback with the prompt below and no blink.
- Whether not-applicable placeholders (non-repo Changes) should read differently from not-yet-built placeholders (Cost/Tokens/Resume), since both currently render `—`.
- Fresh repo with an unborn HEAD: `git diff --shortstat HEAD` errors → Changes placeholder (handled by try/catch); confirm this is acceptable.
- Whether error/hard-exit should ever show a reduced card (default: no).

---

## Output Structure

    tui/src/
      libs/
        terminal/
          ansiColor.ts                    # new: truecolor SGR builder (pure)
          __tests__/ansiColor.test.ts     # new
        exitSummary/                       # new module
          types.ts                        # new: ExitSummaryData, row types
          emblem.ts                       # new: reusable KQode emblem lines
          formatDuration.ts               # new: ms -> "Hh Mm Ss"
          formatExitSummaryCard.ts        # new: pure card string builder
          computeExitSummary.ts           # new: store + git + duration -> data
          printExitSummary.ts             # new: TTY-guarded writer (reads stream.columns)
          resolveSessionSeed.ts           # new: pure boot-time seed {startedAt, baseline}
          finishSession.ts                # new: dispose() then printExitSummary; shared by both entries
          __tests__/                      # new: one test per module above
        git/
          lineDelta.ts                    # new: working-tree +/- reader + parser
          __tests__/lineDelta.test.ts     # new
      state/global/
        session.ts                        # new: value-only session atoms
        index.ts                          # modify: re-export session atoms
      bootstrap.ts                        # modify: seed session atoms at boot
      main.tsx                            # modify: finally -> finishSession(...)
    tui/packaged/
      entry.packaged.tsx                  # modify: finally -> finishSession(...) (packaged binary entry)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Exit sequence (composition root):

```text
user quits (Ctrl+C)
  -> Ink unmounts, waitUntilExit() resolves
  -> .finally: finishSession({ store, dispose })   # main.tsx AND packaged entry
       dispose()                     # existing: reset background, leaveAlternateScreen()
       printExitSummary({ store })   # NEW: normal buffer now active
         -> computeExitSummary(store) # duration = now - startedAt (guarded);
         |                            # changes = clamp(readLineDelta(cwd) - baseline)
         -> formatExitSummaryCard(data, { colorize, columns })  # columns from stream
         -> stream.write(card)        # TTY-guarded; no-op on non-TTY
  -> shell prompt returns below the card
```

Card layout (illustrative — emblem art and marker not final):

```text
 ┌─┐┌─┐    Changes   +12 −4
 │ ││ │    Duration  2m 5s
 └─┘└─┘    Cost      —
  KQode    Tokens    —
           Resume    —
```

---

## Implementation Units

### U1. Git working-tree line-delta reader

**Goal:** Read the working-tree insertion/deletion counts vs HEAD as a structured delta, with a pure parser for `git diff --shortstat` output.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `tui/src/libs/git/lineDelta.ts`
- Test: `tui/src/libs/git/__tests__/lineDelta.test.ts`

**Approach:**
- Export `GitLineDelta = { insertions: number; deletions: number }`.
- `readWorkingTreeLineDelta(cwd)`: `execFileSync('git', ['-C', cwd, 'diff', '--shortstat', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout })`; try/catch → `undefined` (non-repo / git missing / timeout).
- Pure `parseShortstat(output)`: extract insertions/deletions accepting git's **singular and plural** forms (`insertions?\(\+\)` / `deletions?\(-\)`, so `1 insertion(+)` parses to `1`); clean tree / empty output → `{ insertions: 0, deletions: 0 }`; unparseable → `undefined`.

**Patterns to follow:**
- `tui/src/libs/git/gitStatus.ts` (execFileSync guards, timeout const, pure parse split, try/catch → undefined).

**Test scenarios:**
- Happy: `"3 files changed, 12 insertions(+), 4 deletions(-)"` → `{12,4}`. (Covers AE2.)
- Happy: insertions-only `"1 file changed, 5 insertions(+)"` → `{5,0}`; deletions-only → `{0,7}`.
- Happy: singular form `"1 file changed, 1 insertion(+), 1 deletion(-)"` → `{1,1}` (single-line edits must not drop to `+0`).
- Edge: empty string / clean tree → `{0,0}`.
- Edge: unparseable garbage → `undefined`.

**Verification:** `parseShortstat` handles every shortstat shape; reader returns `undefined` outside a repo (exercised via U4 fakes, not real git in tests).

---

### U2. Session timing and git-baseline atoms

**Goal:** Value-only Jotai atoms holding the session start time and the startup git baseline.

**Requirements:** R4, R5

**Dependencies:** U1 (GitLineDelta type)

**Files:**
- Create: `tui/src/state/global/session.ts`
- Modify: `tui/src/state/global/index.ts` (re-export)

**Approach:**
- `sessionStartedAtAtom = atom<number>(0)`; `sessionGitBaselineAtom = atom<GitLineDelta | undefined>(undefined)`.
- Import `GitLineDelta` as a **type-only** import so `state/**` stays free of the guardrail's forbidden strings.
- No side effects in the atoms — seeding happens at the composition root (U5), per the lifecycle learning.

**Patterns to follow:**
- `tui/src/state/global/workspace.ts` (plain value atoms), `tui/src/state/global/index.ts` (barrel re-export).

**Test scenarios:**
- Test expectation: none — pure value atoms with no behavior. Defaults and process-import isolation are covered by U4/U5 tests and `tui/src/__tests__/backendIsolation.test.ts`.

**Verification:** Atoms exported and typecheck clean; `backendIsolation.test.ts` stays green.

---

### U3. Exit summary card renderer (emblem, color, duration, formatter)

**Goal:** Pure, deterministic, colorized rendering of the card string — emblem beside aligned rows, real values styled, placeholders as dim `—`.

**Requirements:** R2, R3, R5, R6, R7, R8, R9, R10, R11

**Dependencies:** U1 (GitLineDelta type)

**Files:**
- Create: `tui/src/libs/terminal/ansiColor.ts` + `tui/src/libs/terminal/__tests__/ansiColor.test.ts`
- Create: `tui/src/libs/exitSummary/types.ts`
- Create: `tui/src/libs/exitSummary/emblem.ts` + `__tests__/emblem.test.ts`
- Create: `tui/src/libs/exitSummary/formatDuration.ts` + `__tests__/formatDuration.test.ts`
- Create: `tui/src/libs/exitSummary/formatExitSummaryCard.ts` + `__tests__/formatExitSummaryCard.test.ts`

**Approach:**
- `ansiColor.ts`: pure `foregroundSequence(hex)` → `\x1b[38;2;r;g;bm`, `RESET`, and `colorize(text, hex)`. No TTY logic (that lives in the writer).
- `types.ts`: `ExitSummaryData` = emblem input + ordered rows; each row is `{ label, value }` or a placeholder marker.
- `emblem.ts`: returns the reusable KQode emblem lines (2–4 rows) plus a defined narrow-terminal degradation (R11): reuse `Header`'s `COMPACT_HEADER_BELOW_COLUMNS` / `HIDE_HEADER_BELOW_COLUMNS` thresholds (`@libs/tui/layout.ts`) — full emblem at wide widths, a single-line `KQode` wordmark below COMPACT, omitted below HIDE with the stat rows reclaiming the left column. Art is directional.
- `formatDuration.ts`: ms → `"Hh Mm Ss"` (drop leading zero units; `"0s"` floor).
- `formatExitSummaryCard(data, { colorize, columns })`: compose emblem-left + rows-right, aligned label/value columns. Colors must stay legible on the user's **restored** terminal background (the OSC-11 override is reset before the card prints, so it is NOT the app's dark background): use the terminal's default foreground for the emblem, labels, and Duration, and reserve truecolor only for the `+` green / `−` red Changes semantics and the muted `—` placeholder. Keep glyphs off the final column (AGENTS.md). `colorize` is injected (identity in tests).

**Patterns to follow:**
- `tui/src/libs/tui/bodyRows.ts` (pure row builders + `theme.colors`), `tui/src/libs/terminal/terminalBackground.ts` (pure sequence builder), `tui/src/theme/themeConfig.ts`.

**Test scenarios:**
- Happy: full data → output contains rows in order Changes/Duration/Cost/Tokens/Resume, with `+12`/`−4`, `2m 5s`, and three `—`. (Covers AE5.)
- Happy: emblem present, ≥ 2 rows, positioned left of the stat rows. (Covers R2, R10.)
- Edge: at/above COMPACT width → full emblem; below COMPACT → single-line wordmark; below HIDE → emblem omitted and rows reflow to the left column; nothing in the final column. (Covers R11.)
- Edge: placeholder rows use the chosen placeholder marker (dim `—`), muted. (Covers R9.)
- Edge: labels/emblem/Duration use the default foreground (no hard-coded near-white), so the card stays legible on a light terminal background.
- Edge: Changes `{0,0}` → `+0 −0`.
- ansiColor: `"#50FA7B"` → correct truecolor SGR; `colorize` wraps with `RESET`.
- formatDuration: `0 → "0s"`, `65_000 → "1m 5s"`, `3_725_000 → "1h 2m 5s"`. (Covers AE4.)

**Verification:** With an identity `colorize`, output is deterministic and free of escape codes; structural assertions on rows/emblem/placeholders pass.

---

### U4. Exit summary compute + print seam

**Goal:** Assemble `ExitSummaryData` from the store (duration + baseline-subtracted Changes + placeholders) and print the formatted card to a stream, TTY-guarded.

**Requirements:** R1, R4, R5, R6, R7, R8, R13

**Dependencies:** U1, U2, U3

**Files:**
- Create: `tui/src/libs/exitSummary/computeExitSummary.ts` + `__tests__/computeExitSummary.test.ts`
- Create: `tui/src/libs/exitSummary/printExitSummary.ts` + `__tests__/printExitSummary.test.ts`

**Approach:**
- `computeExitSummary({ store, now, readLineDelta })`: read `sessionStartedAtAtom`, `sessionGitBaselineAtom`, `workspaceCwdAtom`. `duration = startedAt > 0 ? now() - startedAt : undefined` (unseeded start → Duration placeholder, never a ~56-year value). `final = readLineDelta(cwd)`; `changes = (baseline && final) ? { insertions: max(0, final.ins - base.ins), deletions: max(0, final.del - base.del) } : undefined`. Cost/Tokens/Resume → placeholder markers.
- `printExitSummary({ store, stream = process.stdout, now, readLineDelta, colorize })`: if `!stream.isTTY` return; read the terminal width from `stream.columns` (fallback when undefined) and thread it into `formatExitSummaryCard(data, { colorize, columns })`; build data, format, `stream.write(card)`. Wrap defensively so teardown never throws. Defaults wire `Date.now`, `readWorkingTreeLineDelta`, and the ANSI `colorize`.

**Patterns to follow:**
- `tui/src/backend/runtime/backendRuntime.ts` (DI seam + isolated-store tests), `tui/src/libs/terminal/*` (TTY-guarded writers).

**Test scenarios:**
- Happy (compute): baseline `{2,1}`, final `{12,4}`, `startedAt = now - 125000` → changes `{10,3}`, duration `"2m 5s"`, placeholders for Cost/Tokens/Resume. (Covers AE2, AE4, AE5.)
- Edge (compute): baseline `undefined` OR `readLineDelta → undefined` → Changes placeholder. (Covers AE3.)
- Edge (compute): `final < baseline` (mid-session commit) → clamp to `{0,0}`.
- Edge (compute): `startedAt = 0` (unseeded) → Duration renders the placeholder, not a giant elapsed value.
- Happy (print): TTY stream + injected identity `colorize` → writes a non-empty card containing the five rows. (Covers AE1 card content.)
- Edge (print): non-TTY stream → no write.
- Edge (print): narrow `stream.columns` → the written card shows the degraded emblem (width is threaded from the stream). (Covers R11 wiring.)
- Integration (print): seeded isolated store + fake `now`/`readLineDelta`/TTY stream → asserts the exact rows/values written end-to-end.

**Verification:** Given a seeded store and fakes, `printExitSummary` writes the expected card on a TTY and nothing on a non-TTY, and never throws.

---

### U5. Composition-root wiring

**Goal:** Capture start-time + git baseline at boot, and print the card on the clean-exit path after the app leaves the alt screen.

**Requirements:** R1, R12, R13, R14

**Dependencies:** U1, U2, U4

**Files:**
- Create: `tui/src/libs/exitSummary/resolveSessionSeed.ts` + `__tests__/resolveSessionSeed.test.ts`
- Create: `tui/src/libs/exitSummary/finishSession.ts` + `__tests__/finishSession.test.ts`
- Modify: `tui/src/bootstrap.ts` (seed atoms from `resolveSessionSeed` at boot)
- Modify: `tui/main.tsx` (finally → `finishSession({ store, dispose })`)
- Modify: `tui/packaged/entry.packaged.tsx` (same `finishSession` wiring — the packaged binary compiles from this entry, not `main.tsx`)

**Approach:**
- `resolveSessionSeed({ cwd, now = Date.now, readLineDelta = readWorkingTreeLineDelta })`: pure — returns `{ startedAt: now(), baseline: readLineDelta(cwd) }`. It does NOT import atoms, so `libs → state` stays a non-edge; the composition root does the `store.set`.
- `bootstrap.ts`: call `resolveSessionSeed({ cwd: workspaceCwd })` early (baseline reflects the tree at launch) and `store.set` the two session atoms. `dispose` is unchanged — it still leaves the alt screen last.
- `finishSession({ store, dispose })`: runs `dispose()` (restores the normal buffer) then `printExitSummary({ store })`. Both entry points call it in `waitUntilExit().finally(...)` so the source and packaged paths cannot drift.
- `main.tsx` and `tui/packaged/entry.packaged.tsx`: `void waitUntilExit().finally(() => finishSession({ store, dispose }));`. The `process.once('exit')` safety net is untouched, so hard exits print nothing (clean crash output).

**Execution note:** Validate on WezTerm + Windows Terminal **and a light-background terminal** that the card actually prints and lands in the restored normal buffer with the prompt directly below and no per-frame blink. Confirm the card *prints on Ctrl+C* specifically — the `process.once('exit')` safety net can mask a `finally` that never fires under the pinned `ink@^7.1.0`, so "the app exits cleanly today" does not prove the card path runs.

**Patterns to follow:**
- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`; existing `store.set` seeding in `tui/src/bootstrap.ts`; existing `waitUntilExit().finally(dispose)` in `tui/main.tsx`.

**Test scenarios:**
- Happy (resolveSessionSeed): fake `now`/`readLineDelta` → returns `{ startedAt, baseline }` with the expected values.
- Edge (resolveSessionSeed): `readLineDelta → undefined` (non-repo) → `baseline: undefined`, `startedAt` still set.
- Happy (finishSession): calls `dispose()` **before** `printExitSummary` (assert call order with spies), and prints via the seeded store.
- Integration (manual, per execution note): quitting the TUI (both source and packaged builds) prints the card to the restored terminal with the prompt below, no leftover frame, no blink. The one-line entry wiring is covered behaviorally by `finishSession` + `printExitSummary` tests plus this on-terminal check.

**Verification:** Launch → quit (source and packaged) shows the card in the restored terminal with the prompt beneath; `resolveSessionSeed` / `finishSession` tests pass; typecheck and `backendIsolation.test.ts` stay green.

---

## System-Wide Impact

- **Interaction graph:** Hooks the existing `waitUntilExit().finally(dispose)` seam in both entry points (`main.tsx` and `tui/packaged/entry.packaged.tsx`) via a shared `finishSession` helper, and adds boot-time seeding in `bootstrap.ts`. No change to the backend, protocol, or the Ink render tree.
- **Error propagation:** git read failures → `undefined` → placeholder; `printExitSummary` is defensively wrapped so a formatting/git error at exit can never break clean shutdown.
- **State lifecycle risks:** Session atoms are value-only and seeded once. The load-bearing invariant is teardown ordering — leave alt screen, *then* print.
- **API surface parity:** None — no exported API or protocol surface. The emblem is reusable for a future startup splash but not wired now.
- **Integration coverage:** The alt-screen-leave-then-print ordering is the cross-cutting behavior unit tests can't fully prove → covered by U5's on-terminal check.
- **Unchanged invariants:** Backend echo protocol, incremental rendering / `FULLSCREEN_GUARD_ROWS`, the existing `dispose` teardown (background reset, alt-screen leave), and the `backendIsolation` guardrail are all preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Card written while Ink still owns the screen → garbled output | Print strictly after `dispose()` on the `finally` path (post-unmount, post-`leaveAlternateScreen`). |
| Card printed into the alt buffer (discarded) → card lost | Ordering decision: print only after the alt-screen leave; covered by U5 on-terminal check. |
| WezTerm/win32 quirks (blink, final-column drop) | Card prints to the normal buffer after Ink is done; keep glyphs off the final column; on-terminal validation. |
| git shell-out latency blocks teardown | 2s `execFileSync` timeout (mirrors `gitStatus.ts`) + try/catch → placeholder. |
| `printExitSummary` throws during teardown | Defensive wrapping so exit never crashes. |
| `backendIsolation` guardrail regression | Keep `child_process` in `libs/` only; session atoms use type-only imports. |
| Card wired only into `main.tsx` → invisible in the shipped binary | Wire both entries (source + `tui/packaged/entry.packaged.tsx`) through one shared `finishSession` helper. |
| `finally` never fires under the pinned `ink` fork → card silently no-ops on Ctrl+C | On-terminal check that the card actually *prints* on Ctrl+C, not just that it lands correctly. |
| Card illegible on a light terminal background | Use the terminal's default foreground for text; reserve color for `+`/`−` only; validate on a light-bg terminal. |

---

## Documentation / Operational Notes

- After this lands, capture the alt-screen-exit-card ordering and any new `libs/terminal` helpers as a `docs/solutions/` entry via `/ce-compound` — the KB currently has zero terminal-rendering learnings and this is the novel part.
- Consider codifying the "leave alt screen, then print" teardown-ordering invariant in `tui/AGENTS.md` if it proves subtle in review.

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-07-01-tui-exit-summary-card-requirements.md`
- Lifecycle learning: `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
- Git pattern: `tui/src/libs/git/gitStatus.ts`
- Composition root: `tui/src/bootstrap.ts`, `tui/main.tsx`
- Alt screen: `tui/src/libs/terminal/alternateScreen.ts`
- Guardrail: `tui/src/__tests__/backendIsolation.test.ts`
