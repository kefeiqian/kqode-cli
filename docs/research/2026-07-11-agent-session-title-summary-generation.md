---
date: 2026-07-11
topic: agent-session-title-summary-generation
question: "How do reference coding agents generate the short session title/summary shown in resume/history lists and terminal titles? When is the LLM called, which model, what prompt, sync vs async, fallback, caching/refresh, and where is it displayed?"
status: partial
---

# Agent Session Title / Summary Generation

## Summary

Reference agents split into two camps. **Claude Code** and **OpenCode** generate the session label with a dedicated **LLM call to a small/cheap model** (Claude Haiku; OpenCode's per-provider "small model"), fired **once, in the background** at the start of the first turn, with **first-prompt truncation as the fallback**. **Gemini CLI** also uses an LLM (its cheap `flash-lite`) but uniquely summarizes the *previous* session at the next startup, with a **5-second timeout**. In contrast, **Codex, Kimi Code, and KimiX use pure first-prompt truncation with no LLM at all** — and none of them gate on prompt length. Notably, KimiX carries unused `title_generated` fields, hinting an LLM path was planned but never shipped.

Across every agent the label is **generated once and never auto-refreshed**; a manual `/rename` (custom title that beats the auto title) is the near-universal companion. Terminal titles are set with **OSC escape sequences** everywhere they exist (OSC 0 or OSC 2), except Gemini, which deliberately keeps the terminal title **status + folder only, never session content**. Codex additionally **sanitizes** the title (control/bidi stripping, length cap) before emitting the escape.

This report is `partial`: GitHub Copilot CLI's public repository is a distribution/changelog-only landing page with no application source, so its generation mechanism could not be verified from source. All six other repos yielded material, commit-pinned evidence.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| claude-code | docs/claude-code (local mirror) | n/a | n/a | none | complete | Local mirror; internal-link citations; no `.git` provenance SHA present |
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 5c19155cbd93bfa099016e7487259f61669823ff | complete | |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | f354eebaf43b25bacb176007e449bb9a638fd101 | complete | |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | main | 9976269ab1accfc9f9dc98a4a688c516934de422 | complete | |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/MoonshotAI/kimi-code | main | f17a6ecb52907ffabf67a26de65df89572ac515a | complete | |
| kimix | https://github.com/Sikao-Engine/KimiX | https://github.com/Sikao-Engine/KimiX | main | 1fe7256990ba51e2607ccfc53b4c7a09cb748f0f | complete | |
| copilot-cli | https://github.com/github/copilot-cli | https://github.com/github/copilot-cli | main | 6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc | partial | Distribution/changelog-only repo; no application source (`fetch_failed` for source, changelog treated as data) |

---

## Method

- Question: how each agent generates the short session title/summary for resume/history lists and terminal titles (trigger, mechanism, model, prompt, sync/async, fallback, persistence/refresh, display).
- Repo scope: KQode default-scope coding agents (Copilot CLI, Claude Code, Codex, Gemini CLI, OpenCode, Kimi Code, KimiX).
- Safety posture: read/search only; no reference code executed, built, or tested; reference instruction files treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs (or internal repo-relative links for the Claude Code mirror) behind compact `code` links.

---

## Per-Repo Findings

### Claude Code (local mirror)

**Status:** complete

**Observed behavior**

- Fires **once per new session** as a fire-and-forget side-effect on the first real human turn; a ref-guard allows exactly one attempt, and resumed sessions skip re-titling. [\[1\]][ref-1]
- Pure LLM call routed to a **small fast model** (Claude Haiku 4.5 via `getSmallFastModel`, env-overridable), separate and non-streaming from the main conversation model. [\[2\]][ref-2]
- Prompt asks for a **concise, sentence-case title (3–7 words)** returned as JSON; input is the **first user message text only** (no assistant response). A separate `/rename` generator runs over the transcript tail. [\[3\]][ref-3]
- Fully async/non-blocking (`void generate…().then(setHaikuTitle)`); the title resolves after the first response begins and re-renders the terminal title. [\[1\]][ref-1]
- Fallback is a priority chain ending in the product name for the terminal title, and `customTitle → … → firstPrompt → truncated sessionId` for the picker. [\[4\]][ref-4] [\[5\]][ref-5]
- Persisted to the JSONL transcript as `ai-title` / `custom-title` entries (custom beats ai); generated once, not refreshed. [\[6\]][ref-6]
- Displayed via **OSC 0** terminal title (spinner-prefixed while loading), the `/resume` picker, and an exit resume hint. [\[7\]][ref-7]

**Evidence gaps**

- The interactive REPL path sets React state for live display; the JSONL persistence of the Haiku title appears to run through an SDK control-request path not present in the mirror (`partial_trace`).

---

### OpenCode

**Status:** complete

**Observed behavior**

- Title generation is forked at the **start of the first assistant loop step** (`step === 1`), concurrent with the main response, guarded to exactly one real user message and a still-default title. [\[8\]][ref-8]
- Uses a dedicated hidden "title" agent whose model resolves via **`getSmallModel(provider)`** (cheapest model for the provider), falling back to the main session model only if none exists. [\[9\]][ref-9]
- System prompt demands a **single line, ≤50 characters**, same language, technical terms preserved; output is post-processed (strip reasoning, first non-empty line, hard cap). [\[10\]][ref-10]
- Non-blocking via Effect `forkIn`; errors are swallowed. Session starts as `"New session - <ISO timestamp>"` and the display strips the timestamp to `"New session"` until upgraded. [\[8\]][ref-8] [\[11\]][ref-11]
- Persisted to **SQLite** (session row `title` column); an `isDefaultTitle` guard prevents regeneration; manual rename supported. [\[11\]][ref-11]
- Terminal title set via **OSC 2** as `"OC | <title>"` (40-char cap), reverting to `"OpenCode"` while the title is still default. [\[12\]][ref-12]

**Evidence gaps**

- `getSmallModel`'s exact per-provider mapping lives in an external package not traced here (`partial_trace`).

---

### Gemini CLI

**Status:** complete

**Observed behavior**

- Session `summary`/`displayName` is generated **fire-and-forget at the start of the *next* CLI invocation**, targeting the most-recently-modified *previous* session (needs >1 user message, not already summarized). [\[13\]][ref-13]
- Uses a **cheap `flash-lite`** model (`summarizer-default`), one-sentence ≤80-char intent prompt, fed a sliding window of up to 20 truncated messages, with a **5-second timeout**. [\[14\]][ref-14]
- On timeout/error/no content-generator, nothing is stored; the display falls back to the **first user message** (`"Empty conversation"` if none). Persisted as a JSONL `$set` record; generated once. [\[15\]][ref-15]
- The **terminal title is status + folder only** (`◇ Ready (folder)`, `✦ Working…`), never session content, via OSC 0. [\[16\]][ref-16]

**Evidence gaps**

- `flash-lite` runtime resolution depends on API access flags; verified structurally only.

---

### Codex

**Status:** complete

**Observed behavior**

- Title is **pure heuristic — no LLM**: the full first user message with the injected context prefix stripped, set once on the first user message and never overwritten (except explicit rename). [\[17\]][ref-17] [\[18\]][ref-18]
- Applied asynchronously by a metadata-sync layer, decoupled from the model response path. [\[17\]][ref-17]
- Terminal title is **OSC 0**, **user-configurable** via a `terminal_title` item list whose defaults are activity + project (thread title is *not* a default item); titles are **sanitized** (control/bidi/Trojan-Source stripping) and capped at 240 chars. [\[19\]][ref-19]
- Picker fallback is `name ?? preview ?? "(no message yet)"`; imported external-agent sessions may read (not generate) an `ai-title` record produced by the source app. [\[20\]][ref-20]

**Evidence gaps**

- The exact wiring of the live thread title into the `TerminalTitleItem::Thread` render was not fully traced (`partial_trace`).

---

### Kimi Code

**Status:** complete

**Observed behavior**

- Title is **pure heuristic**: sanitized (PII-redacted) first-prompt text truncated to 200 chars — no LLM call anywhere. [\[21\]][ref-21]
- Computed **eagerly and synchronously on first prompt submit**, awaited and persisted *before* the agent turn dispatches (blocks the first response briefly). [\[21\]][ref-21]
- Default title `"New Session"`; `/title`/`/rename` locks a custom title; stored in `state.json`. Not refreshed after the first prompt. [\[22\]][ref-22]
- Shown in the `/sessions` (alias `/resume`) picker; **no OSC terminal-title sequence found** in the repo. [\[22\]][ref-22]

**Evidence gaps**

- Terminal-title behavior unconfirmed (no OSC code found; `not_found`).

---

### KimiX

**Status:** complete

**Observed behavior**

- Title is **pure heuristic**: first `TurnBegin` user input shortened to 50 chars, derived **lazily when the session list is (re)scanned** — not at submit time. [\[23\]][ref-23]
- State carries **unused `title_generated` / `title_generate_attempts` fields** with no generator implementation — evidence of a planned or legacy LLM-title path that was never shipped. [\[23\]][ref-23]
- Fallback `"Untitled"` / `"Session {id[:12]}"`; only `custom_title` is persisted, the display title is recomputed on load. No OSC terminal title found.

**Evidence gaps**

- Whether `title_generated` was ever LLM-backed is unresolved (`not_found`).

---

### GitHub Copilot CLI

**Status:** partial (source unavailable)

**Observed behavior**

- The public repo is distribution/changelog-only; no application source exists to verify generation. From the changelog (data): the terminal title is formatted as **`<session title> — GitHub Copilot`**, sessions live in a database with `/rename` and `--name=`, and — tellingly — `/worktree` branch naming was changed to use **the active model "instead of a fixed small one."** [\[24\]][ref-24]

**Evidence gaps**

- Trigger, mechanism, model, prompt, sync/async, and persistence for *session titles* are all unverifiable from source (`fetch_failed` for source; `citation_gap` on changelog line anchors).

---

## Cross-Repo Comparison

| Repo | Mechanism | Model | Trigger / timing | Input | Blocks first response? | Fallback | Terminal title | Confidence |
|---|---|---|---|---|---|---|---|---|
| Claude Code | LLM [\[2\]][ref-2] | Small (Haiku 4.5) [\[2\]][ref-2] | Once, first turn, fire-and-forget [\[1\]][ref-1] | First prompt only [\[3\]][ref-3] | No [\[1\]][ref-1] | First-prompt / product name [\[4\]][ref-4] [\[5\]][ref-5] | OSC 0 [\[7\]][ref-7] | high |
| OpenCode | LLM [\[9\]][ref-9] | Small (per-provider) [\[9\]][ref-9] | Once, first loop step, forked [\[8\]][ref-8] | History up to first prompt [\[10\]][ref-10] | No [\[8\]][ref-8] | Default "New session" [\[11\]][ref-11] | OSC 2 [\[12\]][ref-12] | high |
| Gemini CLI | LLM [\[14\]][ref-14] | Cheap (flash-lite) [\[14\]][ref-14] | Prev session, next startup [\[13\]][ref-13] | ≤20 msgs of prior session [\[14\]][ref-14] | No [\[13\]][ref-13] | First user message [\[15\]][ref-15] | Status+folder only [\[16\]][ref-16] | high |
| Codex | Heuristic [\[17\]][ref-17] | None | Once, first msg, async [\[17\]][ref-17] | First prompt only [\[18\]][ref-18] | No [\[17\]][ref-17] | name/preview/"(no message yet)" [\[20\]][ref-20] | OSC 0, sanitized, configurable [\[19\]][ref-19] | high |
| Kimi Code | Heuristic [\[21\]][ref-21] | None | Once, first submit, sync [\[21\]][ref-21] | First prompt only [\[21\]][ref-21] | Yes (briefly) [\[21\]][ref-21] | "New Session" [\[22\]][ref-22] | None found [\[22\]][ref-22] | high |
| KimiX | Heuristic [\[23\]][ref-23] | None (fields unused) [\[23\]][ref-23] | Lazy, on list scan [\[23\]][ref-23] | First TurnBegin [\[23\]][ref-23] | No [\[23\]][ref-23] | "Untitled"/id [\[23\]][ref-23] | None found | high |
| Copilot CLI | Unknown | Unknown (active model for `/worktree`) [\[24\]][ref-24] | Unknown | Unknown | Unknown | OSC, "… — GitHub Copilot" [\[24\]][ref-24] | low |

---

## KQode Lessons

### Product behavior

- **Target a short, sentence-case phrase for the title.** The LLM implementers all cap tightly (Claude Code 3–7 words; OpenCode ≤50 chars; Gemini ≤80 chars), which fits KQode's 72-char title cap and the narrower `/resume` Summary column. [\[3\]][ref-3] [\[10\]][ref-10] [\[14\]][ref-14]
- **Keep first-prompt truncation as the seed and fallback.** It is the universal safety net — Codex/Kimi/KimiX *are* truncation, and Claude Code/Gemini fall back to it — which validates KQode's "seed placeholder, upgrade to LLM summary, keep placeholder on failure." [\[5\]][ref-5] [\[15\]][ref-15] [\[17\]][ref-17] [\[21\]][ref-21]
- **Generate once; expect `/rename` as the companion.** No agent auto-refreshes the label, and manual rename that overrides the auto title is near-universal (Claude Code, OpenCode, Codex, Kimi Code, Copilot CLI) — supporting KQode's "generate once" and flagging `/rename` as the natural deferred follow-up. [\[6\]][ref-6] [\[11\]][ref-11] [\[20\]][ref-20]

### Architecture implications

- **Run generation off the turn's critical path.** Every LLM implementer fires background/fire-and-forget (Claude Code `void…then`, OpenCode `forkIn`, Gemini `.catch` no-await); Kimi Code is the cautionary counter-example that blocks the first response by awaiting synchronously. This validates KQode's "background, after the first turn settles" choice. [\[1\]][ref-1] [\[8\]][ref-8] [\[13\]][ref-13] [\[21\]][ref-21]
- **Persist the generated title in durable truth, not just the index.** Peers store it in the durable record — Claude Code and Gemini as JSONL entries, OpenCode and Codex in SQLite. Because KQode's SQLite is a rebuildable index over JSONL, the generated summary must be written as an append-only session-log event, or an index rebuild silently reverts to the truncated first prompt. [\[6\]][ref-6] [\[11\]][ref-11] [\[15\]][ref-15]
- **OSC is the right terminal-title mechanism, but status-only is a real alternative.** Claude Code/OpenCode/Codex all push the session label via OSC (0 or 2), matching KQode's OSC 2 approach — but Gemini deliberately shows only status + folder in the terminal title, a design KQode could offer as a toggle later. [\[7\]][ref-7] [\[12\]][ref-12] [\[16\]][ref-16] [\[19\]][ref-19]

### Evaluation ideas

- **Deterministic title test with a stubbed provider.** Given a fixed first prompt + response, assert a single-line, sanitized, length-bounded title, and assert the deterministic fallback when the provider is stubbed to fail or time out (mirroring Gemini's 5s timeout + fallback). [\[14\]][ref-14] [\[15\]][ref-15]
- **Seed→upgrade→persist transition test.** Assert the placeholder shows immediately on first submit, upgrades once the summary lands, and survives a simulated index rebuild (the durability invariant above). [\[6\]][ref-6] [\[11\]][ref-11]

### Risks and tradeoffs

- **Cost: KQode calls the full active model, unlike the peers' cheap models.** Claude Code (Haiku), OpenCode (small model), and Gemini (flash-lite) all use a cheap tier; Copilot CLI explicitly noted moving `/worktree` naming to the active model "instead of a fixed small one" as a deliberate change. KQode's "always generate" is therefore relatively more expensive per session — a future small-model tier is the mitigation. [\[2\]][ref-2] [\[9\]][ref-9] [\[14\]][ref-14] [\[24\]][ref-24]
- **Prompt-injection / Trojan-Source: sanitize before OSC + picker.** The title is built from user/model text and written as a terminal escape and shown in a list; Codex strips control/bidi characters and caps length precisely for this reason. KQode must sanitize model output before writing the OSC 2 sequence or storing it. [\[19\]][ref-19]
- **Timing tradeoff KQode accepted: signal vs immediacy.** KQode summarizes prompt + response *after* the first turn (better signal), whereas Claude Code/OpenCode fire on the first prompt (immediacy); consequently KQode's polished title lags the first response, covered by the seeded placeholder. [\[1\]][ref-1] [\[8\]][ref-8]

---

## Evidence Gaps

- **GitHub Copilot CLI**: no application source in the public repo (`fetch_failed`); session-title generation mechanism unverifiable, changelog-only, line anchors unavailable (`citation_gap`). Conclusions about it are low-confidence.
- **KimiX**: `title_generated`/`title_generate_attempts` fields exist without a generator; whether an LLM path ever existed is unresolved (`not_found`).
- **Kimi Code / KimiX terminal titles**: no OSC sequences found; terminal-title behavior is `not_found` rather than confirmed-absent.
- **Claude Code**: JSONL persistence of the AI title runs through an SDK path absent from the local mirror (`partial_trace`).
- **OpenCode / Gemini small-model resolution**: exact per-provider cheap-model mapping lives in external packages (`partial_trace`).

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Claude Code (local mirror): one-shot fire-and-forget title call on the first turn ([code](../claude-code/screens/REPL.tsx#L2677-L2698)).
- <a id="ref-2"></a>[2] Claude Code (local mirror): small fast model selection for the title (Haiku) ([code](../claude-code/utils/model/model.ts#L36-L38)).
- <a id="ref-3"></a>[3] Claude Code (local mirror): `SESSION_TITLE_PROMPT` (3–7 words, sentence case, first user message) ([code](../claude-code/utils/sessionTitle.ts#L59-L108)).
- <a id="ref-4"></a>[4] Claude Code (local mirror): terminal-title priority chain ending in the product name ([code](../claude-code/screens/REPL.tsx#L1135)).
- <a id="ref-5"></a>[5] Claude Code (local mirror): session-list fallback chain to first prompt / session id ([code](../claude-code/utils/log.ts#L30-L55)).
- <a id="ref-6"></a>[6] Claude Code (local mirror): `ai-title`/`custom-title` JSONL persistence and read priority ([code](../claude-code/utils/sessionStorage.ts#L2640-L2673)).
- <a id="ref-7"></a>[7] Claude Code (local mirror): OSC 0 terminal-title writer ([code](../claude-code/ink/hooks/use-terminal-title.ts#L17-L30)).
- <a id="ref-8"></a>[8] OpenCode: title forked at first loop step, non-blocking ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/prompt.ts)).
- <a id="ref-9"></a>[9] OpenCode: small-model waterfall for the title agent ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/agent/agent.ts)).
- <a id="ref-10"></a>[10] OpenCode: ≤50-char single-line title system prompt ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/agent/prompt/title.txt)).
- <a id="ref-11"></a>[11] OpenCode: default `"New session - <ISO>"`, `isDefaultTitle` guard, SQLite persistence ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/session.ts)).
- <a id="ref-12"></a>[12] OpenCode: OSC 2 terminal title `"OC | <title>"` with default-title fallback ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/tui/src/app.tsx)).
- <a id="ref-13"></a>[13] Gemini CLI: background summary of the previous session at startup ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/AppContainer.tsx#L510-L513)).
- <a id="ref-14"></a>[14] Gemini CLI: `flash-lite` summarizer, ≤80-char prompt, 5s timeout ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/services/sessionSummaryService.ts)).
- <a id="ref-15"></a>[15] Gemini CLI: `displayName` fallback to first user message; JSONL `$set` persistence ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/utils/sessionUtils.ts)).
- <a id="ref-16"></a>[16] Gemini CLI: terminal title is status + folder only ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/utils/windowTitle.ts)).
- <a id="ref-17"></a>[17] Codex: heuristic first-message title set once, applied async ([code](https://github.com/openai/codex/blob/5c19155cbd93bfa099016e7487259f61669823ff/codex-rs/thread-store/src/thread_metadata_sync.rs#L168-L183)).
- <a id="ref-18"></a>[18] Codex: `strip_user_message_prefix` / `USER_MESSAGE_BEGIN` ([code](https://github.com/openai/codex/blob/5c19155cbd93bfa099016e7487259f61669823ff/codex-rs/protocol/src/protocol.rs#L120-L127)).
- <a id="ref-19"></a>[19] Codex: OSC 0 terminal title, configurable items, sanitized + 240-char cap ([code](https://github.com/openai/codex/blob/5c19155cbd93bfa099016e7487259f61669823ff/codex-rs/tui/src/terminal_title.rs#L27-L32)).
- <a id="ref-20"></a>[20] Codex: picker fallback `name ?? preview ?? "(no message yet)"` ([code](https://github.com/openai/codex/blob/5c19155cbd93bfa099016e7487259f61669823ff/codex-rs/tui/src/resume_picker.rs)).
- <a id="ref-21"></a>[21] Kimi Code: heuristic `prompt.slice(0,200)` computed synchronously on first submit ([code](https://github.com/MoonshotAI/kimi-code/blob/f17a6ecb52907ffabf67a26de65df89572ac515a/packages/agent-core/src/session/rpc.ts#L187-L194)).
- <a id="ref-22"></a>[22] Kimi Code: default `"New Session"`, `/sessions` picker, no OSC title found ([code](https://github.com/MoonshotAI/kimi-code/blob/f17a6ecb52907ffabf67a26de65df89572ac515a/packages/agent-core/src/session/index.ts#L151-L158)).
- <a id="ref-23"></a>[23] KimiX: heuristic first-TurnBegin title (≤50), lazy on list scan; unused `title_generated` fields ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/kimi-cli/src/kimi_cli/session.py#L151-L167)).
- <a id="ref-24"></a>[24] GitHub Copilot CLI: changelog — terminal title `"… — GitHub Copilot"`; `/worktree` naming uses the active model "instead of a fixed small one" (source private; changelog-only, `citation_gap`) ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/changelog.md)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
[ref-20]: #ref-20
[ref-21]: #ref-21
[ref-22]: #ref-22
[ref-23]: #ref-23
[ref-24]: #ref-24
