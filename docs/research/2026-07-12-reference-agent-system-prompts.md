---
date: 2026-07-12
topic: reference-agent-system-prompts
question: "What is the system prompt of the other reference coding agents, and how is it constructed?"
status: partial
---

# Reference Coding-Agent System Prompts

## Summary

Every default-scope agent opens its system prompt with a one-line **identity** ("You are &lt;name&gt;, a … coding assistant/agent") and then layers on: a bounded **environment block** (cwd, OS/platform, date, git-repo flag, model), **project instruction files** (the `AGENTS.md` family), **tool/behavior/safety guidance**, and one or more **specialized sub-prompts** (compaction, planning, review, sub-agents). What differs is *how* the prompt is built:

- **Static markdown** compiled into the binary — **Codex** ([\[13\]][ref-13]).
- **Dynamic section assembler** that concatenates cached sections at runtime — **Claude Code** ([\[2\]][ref-2]) and **Gemini CLI** ([\[22\]][ref-22]).
- **Provider-specific prompt files** selected by model id — **OpenCode** ([\[29\]][ref-29]).
- **Branded template with `{{VAR}}` interpolation** — **Kimi Code** ([\[37\]][ref-37]).
- **Role/persona template** assembled per agent role — **KimiX** ([\[41\]][ref-41]).

Two cross-cutting patterns dominate: (1) a shared **Claude-lineage prompt spine** (the "NEVER generate or guess URLs", "minimize output tokens", "fewer than 4 lines / one-word answers" text) is visibly reused by OpenCode's default prompt ([\[28\]][ref-28]) and echoed in Claude Code's own simple intro ([\[3\]][ref-3]); and (2) an **`AGENTS.md`-style project instruction file** injected as context by every readable repo.

**Status is partial:** the **GitHub Copilot CLI** public repo does not ship its system prompt — it is a docs + installer bundle that downloads a compiled binary, so the prompt is server-/binary-side and `not_found` in source ([\[33\]][ref-33] [\[34\]][ref-34]). All six other targets yielded material, cited evidence.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| copilot-cli | https://github.com/github/copilot-cli | https://github.com/github/copilot-cli | main | 6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc | partial | prompt `not_found`; docs + installer only |
| claude-code | docs/claude-code (local mirror) | n/a | n/a | n/a | complete | local mirror; source-map snapshot exposed 2026-03-31; no commit SHA carried; internal-link citations |
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 385c0a9351e2199929e01f7864ec78a8f7d5e580 | complete |  |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | f354eebaf43b25bacb176007e449bb9a638fd101 | complete |  |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 9976269ab1accfc9f9dc98a4a688c516934de422 | complete |  |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd | complete |  |
| kimix | https://github.com/Sikao-Engine/KimiX | https://github.com/Sikao-Engine/KimiX | master | 1fe7256990ba51e2607ccfc53b4c7a09cb748f0f | complete | Python fork of Kimi-CLI |

---

## Method

- Question: How does each reference coding agent construct the system prompt it sends to the model (identity, dynamic context, project-instruction ingestion, behavior/safety rules, specialized prompts)?
- Repo scope: default scope (7 repos).
- Safety posture: read/search only; no code execution, build, install, or test; every reference `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/README treated strictly as data, not as active instructions. Git repos shallow-cloned to a temp cache outside the repository and read at a pinned SHA; Claude Code read only from the git-ignored local mirror at `docs/claude-code`.
- Per-repo extraction ran in parallel; identity lines and citation-critical file:line anchors were re-verified by hand against the pinned checkout / mirror.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs (or internal repo-relative links for the Claude Code mirror) behind compact `code` links.

---

## Per-Repo Findings

### Claude Code (local mirror)

**Status:** complete

**Observed behavior**

- Identity is a selectable **prefix constant**: `DEFAULT_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."`, with Agent-SDK variants chosen by `getCLISyspromptPrefix()` based on provider / interactivity. [\[1\]][ref-1]
- The prompt is a **dynamic array of cached sections** built by `getSystemPrompt(tools, model, …)`: `session_guidance`, `memory`, `env_info`, `language`, `output_style`, `mcp_instructions` (explicitly *uncached* because MCP servers connect/disconnect between turns), `scratchpad`, function-result-clearing, `summarize_tool_results`, plus feature-gated `token_budget`/`brief`. A `CLAUDE_CODE_SIMPLE` fast-path returns just identity + CWD + Date. [\[2\]][ref-2]
- A simple intro section states the persona and hard rule "IMPORTANT: You must NEVER generate or guess URLs …", plus system rules about permission modes, `<system-reminder>` tags, and prompt-injection flagging. [\[3\]][ref-3]
- Environment is a `<env>` block (`Working directory`, `Is directory a git repo`, `Platform`, shell, `OS Version`) plus a "You are powered by the model …" line and knowledge cutoff; an "undercover" mode strips model names to avoid leaking unreleased ids into commits/PRs. [\[4\]][ref-4]
- Behavioral spine includes an explicit conciseness/tone directive [\[5\]][ref-5] and an **adversarial verification contract** requiring a separate verifier sub-agent before reporting completion of non-trivial work. [\[6\]][ref-6]
- Many **specialized system prompts**: a read-only explore sub-agent ("file search specialist for Claude Code") [\[7\]][ref-7], a plan sub-agent ("software architect and planning specialist") [\[8\]][ref-8], a verification sub-agent ("Your job is not to confirm the implementation works — it's to try to break it") [\[9\]][ref-9], a coordinator/orchestrator prompt [\[10\]][ref-10], and output-style prompts (Explanatory/Learning) [\[11\]][ref-11].
- Project memory (`CLAUDE.md`/`AGENTS.md` family) is injected via the `memory` section's `loadMemoryPrompt()`. [\[12\]][ref-12]

**Evidence gaps**

- Mirror carries no commit SHA (source-map snapshot, not a git checkout); a stray user folder (`kefei-study`) exists in the mirror and was ignored as non-source.

### Codex CLI

**Status:** complete

**Observed behavior**

- The base prompt is **static markdown compiled in via `include_str!`**: `BASE_INSTRUCTIONS_DEFAULT` at `models.rs:1389` points to `prompts/base_instructions/default.md`, which opens "You are a coding agent running in the Codex CLI, a terminal-based coding assistant." [\[13\]][ref-13] [\[14\]][ref-14]
- Codex is unique in shipping **per-model persona variants** as separate `.md` files (`gpt_5_1_prompt.md`, `gpt_5_2_prompt.md`, `gpt_5_codex_prompt.md`, `gpt-5.1-codex-max_prompt.md`, `gpt-5.2-codex_prompt.md`) — e.g. "You are Codex, based on GPT-5. …" — and an apply-patch-specific variant. [\[15\]][ref-15] [\[16\]][ref-16]
- Runtime context is **not concatenated into the base markdown**; instead an environment/world-state snapshot (`<cwd>`, shell, platform, date/timezone, network & filesystem/sandbox policy, approval mode) is rendered separately from turn context. [\[17\]][ref-17]
- `AGENTS.md` (preferring `AGENTS.override.md`, then `AGENTS.md`) is discovered from project root down to cwd, concatenated, and **rendered as a `user`-role fragment** wrapped in `<INSTRUCTIONS>`, not merged into the system block. [\[18\]][ref-18] [\[19\]][ref-19]
- A dedicated `prompts` crate holds specialized prompts: compaction (`compact.rs`), review (`review_request.rs`), realtime (`realtime.rs`), and apply-patch (`apply_patch.rs`). [\[20\]][ref-20]

### Gemini CLI

**Status:** complete

**Observed behavior**

- Identity comes from `renderPreamble()`: "You are Gemini CLI, an interactive CLI agent specializing in software engineering tasks." (an "autonomous" wording in non-interactive mode), with the **approval mode injected** into the opening line (Default / Plan / YOLO / Auto-Edit). [\[21\]][ref-21]
- The prompt is assembled by `getCoreSystemPrompt()` from many `render*` snippets (core mandates, primary workflows, operational guidelines, sandbox, git-repo, planning workflow, sub-agents, agent-skills), then wrapped with user memory + context filenames by `renderFinalShell()`. A modern-vs-legacy snippet set is chosen by model capability. [\[22\]][ref-22]
- The **entire base prompt is overridable via `GEMINI_SYSTEM_MD`** (path or `~/.gemini/system.md`), with `GEMINI_WRITE_SYSTEM_MD` to dump the composed prompt to disk. [\[23\]][ref-23]
- Tone/safety rules (concise/minimal output, credential protection, "explain critical commands before running", untrusted-tool-output handling) live in the operational-guidelines snippet. [\[24\]][ref-24]
- A separate **history-compression prompt** is produced by `getCompressionPrompt()`. [\[25\]][ref-25]
- Sandbox status, git-repo state, and planning workflow are conditional render sections. [\[26\]][ref-26]
- Context files are configurable (`GEMINI.md`, `MEMORY.md`, legacy variants) discovered hierarchically (global `~/.gemini`, project tree, extensions) with `@import` resolution, then injected as "user memory". [\[27\]][ref-27]

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode ships **one prompt file per provider/model family** under `session/prompt/` (`default.txt`, `anthropic.txt`, `beast.txt`, `gpt.txt`, `gemini.txt`, `codex.txt`, `kimi.txt`, `meta.txt`, `trinity.txt`). [\[29\]][ref-29]
- Selection is a simple id-substring match: `muse-spark→meta`, `gpt-4|o1|o3→beast`, `gpt…codex→codex`, other `gpt→gpt`, `gemini-→gemini`, `claude→anthropic`, `trinity`, `kimi`, else `default`. [\[29\]][ref-29]
- The default prompt is **Claude-lineage**: "You are opencode, an interactive CLI tool that helps users with software engineering tasks", the "NEVER generate or guess URLs" rule, a "# Tone and style" section, "minimize output tokens", and "fewer than 4 lines … One word answers are best." [\[28\]][ref-28]
- A separate `environment()` builder appends the model line and an `<env>` block (working directory, workspace root, git-repo flag, platform, today's date) plus available `<references>`. [\[30\]][ref-30]
- Project instructions are discovered and injected by an `Instruction` module that looks for `AGENTS.md`, optionally `CLAUDE.md` (unless `disableClaudeCodePrompt`), and deprecated `CONTEXT.md`, plus configured `instructions`. [\[31\]][ref-31]
- Plan-mode / user-reminder prompts are injected via a reminders module using dedicated assets (`plan-mode.txt`, `plan-reminder-anthropic.txt`, `build-switch.txt`). [\[32\]][ref-32]

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- A **branded template file** `profile/default/system.md` opens "You are Kimi Code CLI, an interactive general AI agent running on a user's computer." with a `{{ ROLE_ADDITIONAL }}` slot. [\[36\]][ref-36]
- The template is filled by mapping runtime values to `KIMI_*` variables: `KIMI_OS`, `KIMI_NOW`, `KIMI_WORK_DIR`, `KIMI_WORK_DIR_LS` (a cwd directory listing), `KIMI_AGENTS_MD`, `KIMI_SKILLS`, `KIMI_ADDITIONAL_DIRS_INFO`. [\[37\]][ref-37]
- `AGENTS.md` discovery is Kimi-branded: brand home (`KIMI_CODE_HOME`/`~/.kimi-code`), generic `~/.agents`, then the project tree up to repo root including `.kimi-code/AGENTS.md`; merged content becomes `KIMI_AGENTS_MD`. [\[38\]][ref-38]
- Safety/behavior rules embedded in the prompt include a git-mutation guard ("Do not run `git commit`, `git push`, `git reset`, `git rebase` …") and a project-trust/precedence boundary. [\[39\]][ref-39]
- Specialized profiles exist as sibling YAML: `coder` (delegated file-editing sub-agent), `explore` (read-only), `plan` (read-only), plus a `DEFAULT_INIT_PROMPT` for generating `AGENTS.md`. [\[40\]][ref-40]

### KimiX

**Status:** complete

**Observed behavior**

- A **Python fork of Kimi-CLI** that builds prompts from a role template `_SYSTEM_PROMP = "{AGENT_ROLE}:\n{NUMBERED}\n{AGENTS_MD}{SKILLS}"`. [\[41\]][ref-41]
- Identity is **role/persona-driven**: `get_system_prompt()` branches on a `SystemPromptType` — the Worker persona resolves to "You are a persistent autonomous agent", with additional Planner / Reader / Supervisor / Sub-agent personas. [\[42\]][ref-42]
- Injected context: `OS`/`Work-Dir` (with a Windows path rule), platform-conditional interactive tool names (`Bash`/`Powershell`/`Run`), `AGENTS.md` read from `work_dir/AGENTS.md`, a `Skills:` block, and a pre-compaction export path. [\[43\]][ref-43]
- Specialized roles are backed by agent JSON definitions dispatched by session helpers (planner `agent_planner.json`, sub-agent `agent_subagent.json`, supervisor `agent_boss.json`, reader `agent_useless.json`). [\[44\]][ref-44]
- Distinctive prompt directives include "DO NOT use your own knowledge", "One action per turn", a verification gate, and a `ContextRetrieval` mandate. [\[42\]][ref-42]

### GitHub Copilot CLI

**Status:** partial — prompt `not_found` in source

**Observed behavior**

- The public repo is a **docs + release-installer bundle** (`README.md`, `changelog.md`, `install.sh`, `.github/`); there is no readable `src/`/`dist/` prompt source. [\[33\]][ref-33]
- `install.sh` downloads a signed release tarball and installs a `copilot` binary, so the agent logic (including the system prompt) ships compiled, not as source. [\[34\]][ref-34]
- The only "system prompt" mentions are changelog entries about prompt-related *features* (section-level overrides, custom agents, per-server MCP instructions), not prompt text. [\[35\]][ref-35]

**Evidence gaps**

- The actual Copilot CLI system prompt is not present in the public repo (`not_found`); it is binary-/server-side and out of scope for source research.

---

## Cross-Repo Comparison

| Dimension | Copilot CLI | Claude Code | Codex | Gemini CLI | OpenCode | Kimi Code | KimiX | Confidence |
|---|---|---|---|---|---|---|---|---|
| Identity / persona | not in repo [\[33\]][ref-33] | "You are Claude Code…" prefix const [\[1\]][ref-1] | "You are a coding agent … Codex CLI" [\[13\]][ref-13] | "You are Gemini CLI…" preamble [\[21\]][ref-21] | "You are opencode…" default.txt [\[28\]][ref-28] | "You are Kimi Code CLI…" [\[36\]][ref-36] | role persona e.g. "persistent autonomous agent" [\[42\]][ref-42] | high (6/7) |
| Base prompt form | binary/server [\[34\]][ref-34] | dynamic cached sections [\[2\]][ref-2] | static markdown via `include_str!` [\[14\]][ref-14] | dynamic `render*` snippets [\[22\]][ref-22] | per-provider `.txt`, id-selected [\[29\]][ref-29] | branded template + `{{VARS}}` [\[37\]][ref-37] | role template string [\[41\]][ref-41] | high |
| Env/context block | unknown | `<env>`: cwd/git/platform/OS/model [\[4\]][ref-4] | separate world-state snapshot [\[17\]][ref-17] | conditional sandbox/git sections [\[26\]][ref-26] | `<env>` builder: cwd/git/platform/date [\[30\]][ref-30] | `KIMI_*` incl. cwd listing [\[37\]][ref-37] | OS/Work-Dir/tools [\[43\]][ref-43] | high |
| Project instruction file | unknown | `CLAUDE.md`/memory [\[12\]][ref-12] | `AGENTS.md` as user-role fragment [\[18\]][ref-18] | `GEMINI.md`/`MEMORY.md` hierarchical [\[27\]][ref-27] | `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md` [\[31\]][ref-31] | `AGENTS.md` incl. `.kimi-code/` [\[38\]][ref-38] | `AGENTS.md` from work_dir [\[43\]][ref-43] | high |
| System-prompt override | unknown | `CLAUDE_CODE_SIMPLE` fast-path [\[2\]][ref-2] | per-model variant files [\[15\]][ref-15] | `GEMINI_SYSTEM_MD` file/env [\[23\]][ref-23] | provider file swap [\[29\]][ref-29] | profile `systemPromptPath` [\[37\]][ref-37] | `--agent-file` / role callback [\[42\]][ref-42] | high |
| Specialized prompts | unknown | explore/plan/verify/coordinator/output-style [\[7\]][ref-7] | compact/review/realtime/apply-patch [\[20\]][ref-20] | compression + plan/subagent sections [\[25\]][ref-25] | plan-mode reminders + beast [\[32\]][ref-32] | coder/explore/plan + init [\[40\]][ref-40] | planner/reader/supervisor/subagent [\[44\]][ref-44] | high |
| Tone/safety lineage | product docs only [\[33\]][ref-33] | "never guess URLs" + verify gate [\[3\]][ref-3] [\[6\]][ref-6] | precise/safe, sandbox-aware [\[13\]][ref-13] | concise + explain-critical-cmd [\[24\]][ref-24] | Claude-lineage ("minimize tokens") [\[28\]][ref-28] | git-mutation guard [\[39\]][ref-39] | "one action per turn" [\[42\]][ref-42] | high |

---

## KQode Lessons

### Product behavior

- **Adopt the shared identity + bounded `<env>` shape.** KQode's current prompt already follows the common pattern (identity line + OS/cwd/time/model block in `src/chat/system_prompt.rs`), matching Claude Code's `<env>` [\[4\]][ref-4] and OpenCode's env builder [\[30\]][ref-30]. Keeping the git line and model line optional/bounded is consistent with the field; this validates KQode's direction. (Derived from [\[4\]][ref-4] [\[30\]][ref-30].)
- **Plan for an `AGENTS.md` ingestion path.** All six readable agents inject a project instruction file; KQode's `docs/` architecture calls for bounded context fragments, and `AGENTS.md` (root + nested, root-to-cwd merge) is the de-facto standard to support. Codex's choice to inject it as a **user-role** fragment rather than the system prompt is a notable, copyable decision for trust separation. (Derived from [\[18\]][ref-18] [\[19\]][ref-19] [\[31\]][ref-31] [\[38\]][ref-38].)

### Architecture implications

- **Model the system prompt as ordered, individually-cacheable sections, not one string.** Claude Code's `systemPromptSection` vs `DANGEROUS_uncachedSystemPromptSection` split (MCP instructions kept uncached because they change between turns) directly informs KQode's planned prompt-cache and bounded-fragment design; it argues for tagging each fragment with cache/expiry metadata. This is a concrete upgrade path for KQode's single-string `assemble()` (`src/chat/request.rs`). (Derived from [\[2\]][ref-2].)
- **Normalize provider/model prompt variance behind the provider layer.** OpenCode selects an entire prompt file by model-id substring [\[29\]][ref-29] and Codex ships per-model variant files [\[15\]][ref-15]; Gemini switches modern-vs-legacy snippet sets [\[22\]][ref-22]. KQode's provider layer should own any per-model prompt divergence so vendor formats don't leak into core, rather than branching in the agent loop. (Derived from [\[15\]][ref-15] [\[22\]][ref-22] [\[29\]][ref-29].)
- **Reserve dedicated prompts for lifecycle stages, not just the main turn.** Compaction/summarization (Codex `compact.rs` [\[20\]][ref-20], Gemini `getCompressionPrompt` [\[25\]][ref-25]) and review are separate prompts. KQode already has `src/chat/compaction.rs`/`session_summary.rs`; these confirm a distinct, centralized summary/compaction prompt is standard and should be a first-class prompt, not an inline string. (Derived from [\[20\]][ref-20] [\[25\]][ref-25].)

### Evaluation ideas

- **Golden-snapshot the assembled system prompt.** Because these prompts are assembled from many conditional sections, small refactors silently change them. A deterministic test that renders KQode's full system message for a fixed (model, cwd, git, memory) fixture and asserts against a checked-in snapshot mirrors KQode's "deterministic harness tests first" principle. (Derived from [\[2\]][ref-2] [\[22\]][ref-22].)
- **Add a prompt-injection / URL-guard eval.** The "NEVER generate or guess URLs" rule [\[3\]][ref-3] [\[28\]][ref-28] and untrusted-tool-output flagging [\[3\]][ref-3] are common safety directives; KQode can seed a badcase that feeds hostile tool output and asserts the agent flags rather than obeys it. (Derived from [\[3\]][ref-3] [\[28\]][ref-28].)

### Risks and tradeoffs

- **Prompt lineage / licensing hygiene.** OpenCode's default prompt is near-verbatim Claude-lineage text [\[28\]][ref-28]. Per KQode's "reference for behavior, don't fork/copy source" rule, KQode should re-derive its own wording rather than paste these strings, even though the *structure* is safe to emulate. (Derived from [\[28\]][ref-28].)
- **Don't over-fragment early.** KimiX's many personas [\[42\]][ref-42] and Claude Code's large section set [\[2\]][ref-2] add real complexity (cache-busting, drift between variants). KQode's milestone order favors a single working local prompt first; multi-persona/sub-agent prompts belong to the later MCP/subagent milestone. (Derived from [\[2\]][ref-2] [\[42\]][ref-42].)

---

## Evidence Gaps

- **GitHub Copilot CLI:** system prompt `not_found` — the public repo is docs + installer only; the prompt is compiled into the shipped binary / lives server-side. Comparison cells for it are "unknown". [\[33\]][ref-33] [\[34\]][ref-34]
- **Claude Code:** read from a local source-map snapshot mirror with no commit SHA; findings reflect that snapshot's date (2026-03-31), not a pinned upstream commit.
- **Line-range precision:** ranges for large TypeScript render-section files (Gemini `snippets.ts`, Claude Code `prompts.ts`) point at the function/section start; exact end lines may shift slightly within the cited section.
- **Codex per-model variants:** the family of `.md` files was enumerated on disk; only `default.md`, `gpt_5_codex_prompt.md`, and the apply-patch variant had their opening lines quoted verbatim.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Claude Code (local mirror): identity prefix constants + `getCLISyspromptPrefix` selector ([code](../claude-code/constants/system.ts#L10-L46)).
- <a id="ref-2"></a>[2] Claude Code (local mirror): `getSystemPrompt` dynamic section assembler (cached vs uncached sections) ([code](../claude-code/constants/prompts.ts#L444-L560)).
- <a id="ref-3"></a>[3] Claude Code (local mirror): simple intro (no-URL rule) + system rules (permission modes, injection flagging) ([code](../claude-code/constants/prompts.ts#L167-L211)).
- <a id="ref-4"></a>[4] Claude Code (local mirror): `computeEnvInfo` `<env>` block + model line + undercover suppression ([code](../claude-code/constants/prompts.ts#L606-L650)).
- <a id="ref-5"></a>[5] Claude Code (local mirror): conciseness/tone directive ([code](../claude-code/constants/prompts.ts#L412)).
- <a id="ref-6"></a>[6] Claude Code (local mirror): adversarial verification contract (verifier sub-agent gate) ([code](../claude-code/constants/prompts.ts#L394)).
- <a id="ref-7"></a>[7] Claude Code (local mirror): explore sub-agent system prompt (read-only "file search specialist") ([code](../claude-code/tools/AgentTool/built-in/exploreAgent.ts#L13-L34)).
- <a id="ref-8"></a>[8] Claude Code (local mirror): plan sub-agent system prompt ("software architect and planning specialist") ([code](../claude-code/tools/AgentTool/built-in/planAgent.ts#L14-L28)).
- <a id="ref-9"></a>[9] Claude Code (local mirror): verification sub-agent prompt ("try to break it") ([code](../claude-code/tools/AgentTool/built-in/verificationAgent.ts#L10-L11)).
- <a id="ref-10"></a>[10] Claude Code (local mirror): coordinator/orchestrator system prompt ([code](../claude-code/coordinator/coordinatorMode.ts#L111-L120)).
- <a id="ref-11"></a>[11] Claude Code (local mirror): output-style prompts (Explanatory/Learning) ([code](../claude-code/constants/outputStyles.ts#L44-L60)).
- <a id="ref-12"></a>[12] Claude Code (local mirror): `loadMemoryPrompt` (CLAUDE.md/memory section) ([code](../claude-code/memdir/memdir.ts#L419)).
- <a id="ref-13"></a>[13] Codex CLI: default base instructions markdown (identity + capabilities + tone) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/protocol/src/prompts/base_instructions/default.md#L1-L15)).
- <a id="ref-14"></a>[14] Codex CLI: `BASE_INSTRUCTIONS_DEFAULT` compiled via `include_str!` ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/protocol/src/models.rs#L1389)).
- <a id="ref-15"></a>[15] Codex CLI: per-model persona variant prompt (GPT-5 Codex) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/core/gpt_5_codex_prompt.md#L1)).
- <a id="ref-16"></a>[16] Codex CLI: apply-patch variant prompt identity ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/core/prompt_with_apply_patch_instructions.md#L1)).
- <a id="ref-17"></a>[17] Codex CLI: environment/world-state snapshot render (cwd, shell, platform, date, network/filesystem policy) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/core/src/context/world_state/environment.rs#L221-L260)).
- <a id="ref-18"></a>[18] Codex CLI: `AGENTS.md` discovery/merge loader (override → AGENTS.md, root→cwd) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/core/src/agents_md.rs#L37-L80)).
- <a id="ref-19"></a>[19] Codex CLI: user instructions rendered as a `user`-role `<INSTRUCTIONS>` fragment ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/core/src/context/user_instructions.rs#L9-L29)).
- <a id="ref-20"></a>[20] Codex CLI: specialized prompts crate index (compact/review/realtime/apply-patch) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/prompts/src/lib.rs#L1-L26)).
- <a id="ref-21"></a>[21] Gemini CLI: `renderPreamble` identity + approval-mode injection ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/snippets.ts#L183-L195)).
- <a id="ref-22"></a>[22] Gemini CLI: `getCoreSystemPrompt` assembler + `renderFinalShell` (snippets vs legacy) ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/snippets.ts#L136-L180)).
- <a id="ref-23"></a>[23] Gemini CLI: `GEMINI_SYSTEM_MD` / `GEMINI_WRITE_SYSTEM_MD` full-prompt override ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/promptProvider.ts#L53-L122)).
- <a id="ref-24"></a>[24] Gemini CLI: operational guidelines (tone, explain-critical-command, untrusted output) ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/snippets.ts#L384-L429)).
- <a id="ref-25"></a>[25] Gemini CLI: history-compression prompt `getCompressionPrompt` ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/snippets.ts#L875-L955)).
- <a id="ref-26"></a>[26] Gemini CLI: sandbox / git-repo / planning-workflow conditional sections ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/prompts/snippets.ts#L430-L649)).
- <a id="ref-27"></a>[27] Gemini CLI: context filenames + hierarchical memory discovery/import ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/tools/memoryTool.ts#L7-L90)).
- <a id="ref-28"></a>[28] OpenCode: default prompt identity + tone/URL/token rules (Claude-lineage) ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/prompt/default.txt#L1-L19)).
- <a id="ref-29"></a>[29] OpenCode: per-provider prompt files + model-id selector ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/system.ts#L27-L41)).
- <a id="ref-30"></a>[30] OpenCode: `environment()` builder (model line + `<env>` cwd/worktree/git/platform/date) ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/system.ts#L60-L96)).
- <a id="ref-31"></a>[31] OpenCode: instruction loader (AGENTS.md / optional CLAUDE.md / deprecated CONTEXT.md) ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/instruction.ts#L58-L122)).
- <a id="ref-32"></a>[32] OpenCode: plan-mode / reminder prompt injection assets ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/opencode/src/session/reminders.ts#L11-L44)).
- <a id="ref-33"></a>[33] GitHub Copilot CLI: repo is docs + installer bundle; README (approval/product) ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/README.md#L20)).
- <a id="ref-34"></a>[34] GitHub Copilot CLI: installer downloads release tarball/binary (prompt is binary/server-side) ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/install.sh#L49-L141)).
- <a id="ref-35"></a>[35] GitHub Copilot CLI: changelog references prompt features, not prompt text ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/changelog.md#L270)).
- <a id="ref-36"></a>[36] Kimi Code CLI: base template `system.md` identity + `ROLE_ADDITIONAL` slot ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/profile/default/system.md#L1-L11)).
- <a id="ref-37"></a>[37] Kimi Code CLI: `KIMI_*` variable mapping + profile `systemPromptPath` template load ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/profile/resolve.ts#L122-L165)).
- <a id="ref-38"></a>[38] Kimi Code CLI: AGENTS.md discovery (brand home `.kimi-code`, user dir, project tree) ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/profile/context.ts#L58-L110)).
- <a id="ref-39"></a>[39] Kimi Code CLI: git-mutation guard + project-trust rules in prompt ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/profile/default/system.md#L45-L79)).
- <a id="ref-40"></a>[40] Kimi Code CLI: specialized profiles (coder/explore/plan) + init prompt ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/profile/default/agent.yaml#L1-L37)).
- <a id="ref-41"></a>[41] KimiX: base role template `_SYSTEM_PROMP` ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/kimix/utils/system_prompt.py#L14-L15)).
- <a id="ref-42"></a>[42] KimiX: role personas (Worker/Planner/Reader/Supervisor/Sub-agent) + directives ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/kimix/utils/system_prompt.py#L56-L150)).
- <a id="ref-43"></a>[43] KimiX: OS/Work-Dir/tools/AGENTS.md/skills injection ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/kimix/utils/system_prompt.py#L63-L99)).
- <a id="ref-44"></a>[44] KimiX: role-backed agent sessions (planner/supervisor/subagent/reader JSON) ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/kimix/utils/session.py#L178-L203)).

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
[ref-25]: #ref-25
[ref-26]: #ref-26
[ref-27]: #ref-27
[ref-28]: #ref-28
[ref-29]: #ref-29
[ref-30]: #ref-30
[ref-31]: #ref-31
[ref-32]: #ref-32
[ref-33]: #ref-33
[ref-34]: #ref-34
[ref-35]: #ref-35
[ref-36]: #ref-36
[ref-37]: #ref-37
[ref-38]: #ref-38
[ref-39]: #ref-39
[ref-40]: #ref-40
[ref-41]: #ref-41
[ref-42]: #ref-42
[ref-43]: #ref-43
[ref-44]: #ref-44
