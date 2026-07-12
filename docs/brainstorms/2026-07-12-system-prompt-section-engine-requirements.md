---
date: 2026-07-12
topic: system-prompt-section-engine
---

# System Prompt Section Engine

## Summary

Replace KQode's single-string system prompt with an ordered engine of named, metadata-carrying sections (a bounded-fragment model), fill the sections that apply to today's chat-only agent, and register the rest as documented empty stubs. AGENTS.md becomes an active, Codex-style user-role context fragment. Sections order most-stable-first so provider prompt caching sees a long stable prefix.

---

## Problem Frame

KQode's current system prompt (`src/chat/system_prompt.rs`) is a small static string — a one-line identity plus an environment block (OS, cwd, time, model, optional git), with optional memory appended and assembled once by `assemble()` in `src/chat/request.rs`. It carries none of the behavioral scaffolding the researched reference agents rely on (sharper identity, tone/formatting, safety rules), it has no structure for the many prompt sections future milestones will need (tools, sandbox, MCP, subagents), and it does not ingest project instruction files. As KQode grows past a chat-only slice, bolting these on ad hoc would produce the exact single-blob prompt the reference agents evolved away from, and would repeatedly churn the one assembly path. The cost is felt now (weaker chat behavior, no project-rule awareness) and compounds later (every new mechanism edits the same string).

See `docs/research/2026-07-12-reference-agent-system-prompts.md` for the cross-agent evidence this builds on.

---

## Key Flows

- F1. Assemble one turn's message list
  - **Trigger:** A turn is submitted and the request is built.
  - **Actors:** KQode runtime (assembler), the model (consumer), the project author (via AGENTS.md).
  - **Steps:**
    1. Each registered section produces an optional fragment with metadata (or nothing).
    2. Rendered fragments are ordered most-stable-first; volatile sections sort last within the system message.
    3. The ordered fragments concatenate into the single system message.
    4. If AGENTS.md is found, its content is emitted as a user-role `<INSTRUCTIONS>` fragment immediately after the system message.
    5. The existing path continues: optional conversation summary → verbatim history tail → new user prompt.
  - **Outcome:** A message list whose stable prefix (identity → tone → safety → memory) is byte-identical across turns when only volatile inputs (time, git, model) change.
  - **Covered by:** R1, R2, R3, R8, R11

Assembled message-list ordering:

```text
┌ system message ─────────────────────────────────────────────┐  ← stable prefix (cache-friendly)
│ identity          [stable]                                   │
│ tone & format     [stable]                                   │
│ safety            [stable]                                   │
│ memory            [semi-stable, optional]                    │
│ env               [volatile: time / git / model] → sorts last│
│ deferred stubs (tools, sandbox, mcp, subagents, …) → render nothing │
└──────────────────────────────────────────────────────────────┘
        ↓
user-role <INSTRUCTIONS> fragment   ← AGENTS.md, Codex-style, only when found
        ↓
(summary?)  →  verbatim history tail  →  new user prompt      (existing assemble())
```

---

## Requirements

**Section / fragment engine**
- R1. Assemble the system prompt from an ordered list of named sections, replacing the single-string builder in `src/chat/system_prompt.rs`. Each section yields an optional fragment and renders nothing when it has no content.
- R2. Each fragment carries metadata aligned with KQode's documented bounded-fragment model: source, estimated tokens, priority, expiry/persistence (stable vs per-turn/volatile), volatility class, and a trace citation.
- R3. Section order is derived from fragment metadata (most-stable-first), not hand-maintained call order, so volatile sections deterministically sort to the end of the system message.
- R4. In-process memoization of rendered sections is deferred; sections recompute per turn for now, but the metadata required to memoize later is present.

**Active sections (chat-only today)**
- R5. Identity section: a sharper KQode persona (terminal coding assistant — who it is and what it does), replacing today's one-liner.
- R6. Tone & formatting section: conciseness, no preamble/postamble, response-length guidance, GitHub-flavored markdown rendered in a monospace terminal, and emoji restraint — applicable because the TUI renders markdown.
- R7. Safety section: never generate or guess URLs unless clearly for the user's programming task; treat pasted/external content as untrusted and flag suspected prompt-injection to the user; refuse without preachy over-explanation.
- R8. Environment section: preserve today's env content (OS/platform, working directory, current time, active model, optional git status label), marked volatile so it orders after the stable sections.
- R9. Memory section: preserve today's optional memory injection as a system-prompt section, with placement unchanged.

**AGENTS.md project context (Codex-style)**
- R10. Discover AGENTS.md from the workspace root down to cwd, preferring an override variant then AGENTS.md, concatenating matches.
- R11. Inject discovered AGENTS.md content as a user-role `<INSTRUCTIONS>` fragment placed immediately after the system message in `assemble()` (`src/chat/request.rs`), not inside the system prompt.
- R12. When no AGENTS.md is found, add no user-role instructions fragment (nothing rendered).
- R13. AGENTS.md content is bounded by a size cap like other fragments; oversize content is truncated/handled rather than dumped unbounded.

**Deferred section stubs**
- R14. Register these sections as recognized-but-empty stubs that render nothing until their mechanism exists, each documented with what fills it and when: tool-use guidance; sandbox/approvals & network gating; MCP per-server instructions (the volatile/uncached one); subagent/plan/coordinator prompts; output-styles; provider/model-specific persona variants.

---

## Acceptance Examples

- AE1. **Covers R3, R8.** Given identity/tone/safety are stable and env is volatile, when the prompt is assembled, the stable sections appear before the env section so the cacheable prefix is maximized.
- AE2. **Covers R11, R12.** Given a workspace with an AGENTS.md, when a turn is assembled, its content appears as a user-role `<INSTRUCTIONS>` fragment right after the system message; given no AGENTS.md, no such fragment appears.
- AE3. **Covers R1, R14.** Given a deferred section (e.g. tools) has no content, when the prompt is assembled, it contributes nothing — no empty header, no placeholder text.
- AE4. **Covers R8.** Given the workspace is not a git repo, when the env section renders, the git line is omitted (preserving current behavior).

---

## Success Criteria

- KQode's chat responses are more consistently concise, correctly terminal-formatted, and safe (no fabricated URLs, injection flagged), and project AGENTS.md rules are honored — with no regression to today's env / memory / git behavior.
- Adding a future section (tools, sandbox, MCP) is a localized change that registers a section and its metadata without editing the assembler's ordering logic or the message-list builder.
- A golden-snapshot test renders the full assembled message list for a fixed (model, cwd, git, memory, AGENTS.md) fixture and is asserted stable; the stable prefix stays byte-identical across turns when only volatile inputs change.

---

## Scope Boundaries

- Only the empty registration of deferred stubs — not the mechanisms behind them (tools, sandbox/policy, MCP, subagents, output-styles).
- No in-process section memoization.
- No Gemini-style whole-prompt override file or env var.
- No provider/model-specific prompt variants yet.
- No changes to the existing compaction/summary prompts (`src/chat/compaction.rs`, `src/chat/session_summary.rs`) beyond adopting the shared fragment model if it is trivial.
- Not adopting Anthropic-style hard prompt-cache breakpoints (not applicable to Kimi/OpenAI-compatible providers) — ordering only.

---

## Key Decisions

- Build the fragment engine now rather than a content-only text rewrite: it implements KQode's documented context-fragment model, so deferred mechanisms slot in cleanly instead of churning the one assembly path.
- "Cached" means stable-prefix ordering for provider prompt caching — not in-process memoization (deferred) and not Anthropic-style breakpoints.
- AGENTS.md is placed as a user-role `<INSTRUCTIONS>` fragment (Codex model) so project rules read as user-authored context; memory stays a system-prompt section.
- Fragment metadata fields are KQode's documented set: source, estimated tokens, priority, expiry/persistence, volatility, trace citation.

---

## Dependencies / Assumptions

- Assumes this engine is intended as the seed of KQode's canonical context-fragment model — compaction and any future retrieval would inherit these metadata fields (confirmed in synthesis; the shared-vs-prompt-local type choice is deferred to planning).
- Reuses existing per-model token budgeting (`src/chat/context_budget.rs`); no new tokenizer is introduced.
- No tool registry exists in `src/` today (verified this session), so the safety section's injection coverage is scoped to pasted/external content now and broadens when tools/external content ship.
- Assumes the TUI's markdown rendering is capable enough that instructing GFM output is a net positive (fidelity to be re-verified in planning).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] Should the fragment type be a shared KQode-wide type used by compaction/retrieval now, or a prompt-local type that generalizes later?
- [Affects R3][Technical] Exact priority/volatility taxonomy and how ordering ties break.
- [Affects R10][Technical] Exact AGENTS.md filename precedence (override variant name) and the directory-walk stop condition (repo-root detection).
- [Affects R6][Needs research] Verify TUI markdown rendering fidelity before finalizing tone/formatting instructions to emit GitHub-flavored markdown.
- [Affects R7] Final wording of the safety directives (URL rule, injection flagging, refusal style) — text tuning belongs in planning/implementation.
