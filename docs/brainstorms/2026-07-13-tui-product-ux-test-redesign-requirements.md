---
date: 2026-07-13
topic: tui-product-ux-test-redesign
---

# TUI Product UX Test Redesign

## Summary

KQode will redesign its TUI product and UX regression coverage by tracing shipped TUI behavior to test evidence first, then auditing the existing TUI test suite for weak or missing assertions. The first pass treats requirements docs, plans, git commit history, and recent bug reports as product sources, and explicitly separates automatable checks from live-terminal evidence.

---

## Problem Frame

KQode already has substantial TUI coverage, but the composer cursor regression showed a gap between "the expected state is correct" and "the terminal experience is correct." Tests asserted cursor-coordinate math and rendered frames, while the failure lived in Ink's raw terminal update behavior when a trailing-space edit left the padded frame byte-identical.

Recent TUI work has many product promises recorded in brainstorms and plans: safe terminal edges, bottom-pinned chrome, composer scrolling, command surfaces, model/connect flows, selection, clipboard, markdown rendering, and theme behavior. Some of those promises are encoded in tests, some are covered only by indirect assertions, and some are documented as requiring live-terminal checks because `ink-testing-library` frames cannot observe them.

Plans are not the complete shipped record. KQode has ad-hoc behavior and regression fixes captured only in git commit subjects and bodies, so the traceability source must include full commit history before deciding what the product has promised to preserve.

The redesign exists to make feature work prove that it preserves KQode's product design and user experience, not only that the local helper or component state changed as expected.

---

## Key Decisions

- **Traceability before broad cleanup.** Start from product requirements and acceptance examples, then inspect test files with that risk map in hand so the audit does not become generic assertion polishing.
- **Commit history is shipped truth.** Use git history alongside brainstorms and plans so ad-hoc shipped behavior is not invisible to the coverage map.
- **Commit messages before diffs.** Extract shipped behavior from full commit subjects and bodies first; inspect path-filtered diffs only when the commit message leaves user-visible behavior ambiguous.
- **Traceability map as a committed audit.** Keep the coverage map in `docs/audits/` so it is reviewable, durable, and separate from implementation tests.
- **TUI product/UX first.** The first pass focuses on the TypeScript Ink TUI because the reported regression was visual/interactive and the TUI has the densest recent product surface.
- **Automated where meaningful, manual where necessary.** Terminal rendering, cursor landing, and hover-boundary behavior must not receive fake confidence from snapshots when the observable defect requires raw terminal or live-terminal evidence.
- **Preserve implementation flexibility.** The requirements define test outcomes and evidence expectations; planning decides whether to use existing component tests, pure helpers, raw stdout probes, live smoke scripts, or documentation updates.

---

## Requirements

**Requirement-to-test traceability**

- R1. Every shipped TUI product requirement, acceptance example, or ad-hoc user-visible behavior discovered from git history has an explicit test-evidence status.
- R2. The traceability pass records the source type for each item: brainstorm, plan, commit history, bug report, or current product behavior.
- R3. A missing-coverage item records the user-visible regression it could allow, not only the source file or helper it touches.
- R4. Requirements whose behavior is visible only in a real terminal are tracked as live-terminal checks rather than forced into weak unit tests.
- R5. The traceability map is a committed Markdown audit under `docs/audits/`.

**Existing test-suite audit**

- R6. Every existing TUI test file is reviewed after the traceability pass and classified by whether it protects product behavior, implementation mechanics, or regression badcases.
- R7. Weak assertions are updated when they claim product/UX coverage but only verify internal state, helper return values, or snapshots that cannot observe the promised behavior.
- R8. Tests that are intentionally implementation-level remain allowed, but their names and assertions must not imply broader product coverage than they provide.
- R9. Redundant or overlapping tests are consolidated only when the same user-visible promise remains protected by at least one clear test.

**Regression capture**

- R10. Every recently fixed user-visible bug gets either an automated regression test or an explicit live/manual check with the reason automation is insufficient.
- R11. Badcase-style regressions include the trigger, expected behavior, and the prior failure mode so future contributors can understand why the test exists.
- R12. Cursor, layout, safe-edge, mouse, clipboard, command-surface, and provider-selection regressions are treated as high-risk TUI categories for the first pass.

**Feature-change workflow**

- R13. New TUI feature work must include matching test evidence for the product promises it introduces or changes.
- R14. A feature that changes terminal layout, cursor placement, mouse routing, or raw terminal output must update the live-terminal verification checklist when automation cannot observe the full behavior.
- R15. A feature that changes documented user-facing behavior must update the relevant help copy, requirements/plan trace, or tests in the same work unit.
- R16. Test commands and documentation use the repo's Cargo-facing TUI validation commands.

---

## Key Flows

- F1. Requirement traceability pass
  - **Trigger:** A contributor begins the TUI test redesign.
  - **Steps:** TUI brainstorms, plans, and git commit history are scanned for shipped user-visible behavior; each item is mapped to automated, manual/live, deferred, or missing evidence; missing items are grouped by user-visible risk.
  - **Outcome:** A committed audit records which product promises are protected and which can still regress silently.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. Existing test audit
  - **Trigger:** The traceability map identifies the high-risk areas.
  - **Steps:** Existing TUI test files are reviewed area by area; weak assertions are tightened where they over-claim product coverage; redundant tests are consolidated only when product protection is preserved.
  - **Outcome:** The test suite becomes clearer about what it proves and where it intentionally stops.
  - **Covered by:** R6, R7, R8, R9

- F3. New feature evidence gate
  - **Trigger:** A future TUI feature changes user-visible behavior.
  - **Steps:** The feature's product promises are identified; automated tests are added where they can observe the behavior; live-terminal checks are recorded where automation cannot; user-facing docs or help copy are updated when behavior changes.
  - **Outcome:** New features carry regression protection that matches the user experience they alter.
  - **Covered by:** R13, R14, R15, R16

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R5.** Given a TUI behavior that appears in a requirements document, plan, or git commit but not in another source, when the traceability pass runs, then the committed audit records its coverage status and any missing item names the regression a user could see.
- AE2. **Covers R4, R10, R14.** Given a terminal cursor behavior that `ink-testing-library` cannot observe, when coverage is assessed, then the item is recorded as a live-terminal check rather than marked covered by a helper-coordinate unit test alone.
- AE3. **Covers R6, R7, R8.** Given an existing test that asserts internal state for a product-level behavior, when the audit reaches that file, then the test is either strengthened to observe the user-visible outcome or renamed/scoped so it no longer over-claims coverage.
- AE4. **Covers R9.** Given two tests that overlap, when one is removed or consolidated, then the remaining coverage still protects the same product promise and the traceability status stays covered.
- AE5. **Covers R13, R15.** Given a new command-surface behavior, when the feature lands, then its user-facing flow has matching test evidence and any changed help or prompt copy is updated with it.
- AE6. **Covers R16.** Given a contributor validates the TUI redesign, when they run project checks, then the documented commands use `cargo xtask tui-typecheck` and `cargo xtask tui-test`.

---

## Success Criteria

- The TUI has a committed traceability audit from shipped product/UX behavior to automated, manual/live, deferred, or missing test evidence.
- Commit-history-only behavior is visible in the map instead of being lost because it never appeared in a plan.
- High-risk missing coverage is converted into tests or explicit live-terminal checks before broad low-risk assertion cleanup.
- The existing TUI test suite communicates what each test protects and no longer implies product coverage from helper-only assertions.
- A future TUI feature PR can be reviewed against a clear rule: changed user experience requires matching test or live-verification evidence.

---

## Scope Boundaries

- First pass is TUI product/UX coverage, not a full Rust harness, provider, eval, or benchmark redesign.
- The redesign does not require rewriting component architecture solely to make tests easier.
- Live-terminal checks are valid outputs when automation cannot observe the real behavior; the goal is honest evidence, not 100% unit-test automation.
- General code-style, formatting, and low-level helper cleanup are out of scope unless they affect product/UX regression protection.
- Public benchmark and agentic eval strategy remains governed by `docs/kqode_evaluation_spec.md`.

---

## Dependencies / Assumptions

- Existing TUI validation runs through `cargo xtask tui-typecheck` and `cargo xtask tui-test`.
- The requirements and plan documents under `docs/brainstorms/` and `docs/plans/` are product-design sources for recent TUI behavior, but git history is the shipped-source backstop when implementation diverged from plans.
- The git-history source pass reads full commit subjects and bodies, then opens path-filtered diffs only for ambiguous commits.
- `ink-testing-library` is useful for rendered-frame and component-state checks, but it does not prove every terminal-level cursor or stale-cell behavior.
- Some live-terminal checks may need to stay manual until KQode has a stronger raw-terminal or terminal-emulation test harness.

---

## Outstanding Questions

### Deferred to Planning

- Decide the exact `docs/audits/` filename and section structure for the traceability audit.
- Decide the exact audit order for TUI test areas.
- Decide the exact command/query shape for extracting full commit subjects and bodies plus ambiguous path-filtered diffs.
- Decide whether raw stdout probes belong in existing component tests or a separate terminal-rendering test suite.
- Decide how live-terminal evidence is recorded so it remains reviewable without becoming stale process documentation.

---

## Sources / Research

- `AGENTS.md` documents Cargo-facing TUI validation commands and TUI workflow expectations.
- `tui/AGENTS.md` documents the product-level TUI layout, cursor, command-surface, and selection invariants that tests should protect.
- `docs/kqode_evaluation_spec.md` defines KQode's layered evaluation model, including deterministic tests, local golden tasks, behavioral regressions, safety, replay, and multi-agent layers.
- `docs/brainstorms/2026-07-07-tui-ink-safe-rendering-requirements.md` records safe-edge and cursor requirements whose verification includes startup, resize, and surface switching.
- `docs/brainstorms/2026-07-07-tui-drop-bottom-guard-row-requirements.md` records edge-to-edge rendering and cursor-baseline requirements that are easy to regress through layout changes.
- `docs/plans/2026-07-04-001-feat-tui-composer-height-cap-scroll-plan.md` records that cursor drift and hover-boundary behavior have live-terminal verification needs beyond `ink-testing-library` frame assertions.
- `tui/src/__tests__/components/PromptComposer.test.tsx` contains existing cursor-coordinate and composer behavior tests that protect part of the product surface but did not observe the raw terminal cursor-only update path.
- `git log --date=short --pretty=format:'%h %ad %s' --reverse` was inspected as the shipped-history backstop; current history contains 376 commits through the composer cursor fix.
