# KQode Core Implementation Details

This file expands R1-R84 from `2026-06-25-kqode-requirements.md`.

## R1-R8. Core product

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R1 | Terminal-first AI Coding / Code Agent | Ship `kqode` as a Rust CLI and `kqode-tui` as a TypeScript Ink app. | A user can start KQode in a repo from the terminal. |
| R2 | Standalone reference-informed product | Keep reference projects as feature benchmarks only. Do not fork or vendor them. | README names inspirations but KQode code is original. |
| R3 | Interactive, one-shot, headless | Support `kqode`, `kqode run <prompt>`, and `kqode run --json/--stream-json`. | Same core loop works in all three modes. |
| R4 | Coding task modes | Implement mode metadata that changes prompt and permission defaults. | `implement`, `debug`, `review`, and `explain` run with different defaults. |
| R5 | User-switchable modes | Add slash command and CLI flag for mode selection. | User can switch between plan and act without restarting. |
| R6 | Reviewable results | Every code task ends with diff, checks, and summary. | Final output includes changed files and check results. |
| R7 | Dogfooding | Maintain a local task suite using KQode's own codebase. | First demo task edits KQode itself. |
| R8 | Install and startup | Keep startup path small; lazy-load heavy integrations. | Empty TUI opens quickly on a clean machine. |

## R9-R18. Agent harness

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R9 | Agent harness | Build `kqode-core` around sessions, turns, tool calls, and state transitions. | A unit test can run a fake model through a tool loop. |
| R10 | Planning | Add plan step for non-trivial tasks and plan-only mode. | In plan mode no file write is applied. |
| R11 | Tool calling | Normalize native function calls and text-fallback tool calls into one internal shape. | A fake provider can call `read_file` and `complete_task`. |
| R12 | Completion signals | Add `complete_task`, `ask_user`, `blocked`, and `cancelled` end states. | Loop stops only through explicit stop state or budget exhaustion. |
| R13 | Budgets | Track turn count, tool count, token estimate, cost estimate, and max steps. | Max-step hit returns partial summary and remaining work. |
| R14 | Tool results | Standardize success, continuation, display text, payload, and typed error. | Failed read can be recovered from by trying another file. |
| R15 | Structured logs | Emit JSONL events for every model call, tool call, approval, diff, and result. | A session trace can be replayed into a timeline. |
| R16 | Goal mode | Store a long-running objective with completion criteria and current status. | User can pause and resume a goal. |
| R17 | Todos | Store todos with status, priority, owner, and ordering. | TUI can show open/done/blocked tasks. |
| R18 | System agents | Run title, summary, and compaction as hidden internal tasks. | Long session gets an auto title and summary. |

## R19-R27. Tools and editing

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R19 | Core tools | Implement tool registry and built-ins for file, shell, git, search, web, ask, and complete. | Tool list is discoverable from CLI and trace. |
| R20 | VFS | Route all file reads/writes/patches through `kqode-vfs`. | Direct out-of-workspace writes are rejected. |
| R21 | Edit modes | Start with patch and whole-file write; keep edit-format enum for future modes. | Patch failure leaves file unchanged. |
| R22 | Git workflows | Add git status/diff/log helpers before commit automation. | Final summary references current diff. |
| R23 | LSP | Defer server management; define diagnostics input format now. | TUI can display diagnostics from a fake provider. |
| R24 | Non-code artifacts | Defer; define attachment abstraction with MIME type and source. | Image/PDF attachment can be represented in trace. |
| R25 | Shell | Execute through sandbox-lite with cwd, timeout, env, output cap, and policy check. | Long command times out with typed error. |
| R26 | Structured output | Add JSON output mode for headless tasks. | `kqode run --json` returns parseable result. |
| R27 | Tool discovery | Mark tools as always-loaded or discoverable. | Unknown capability can return "tool not loaded" with guidance. |

## R28-R41. Context engineering and memory

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R28 | Project instructions | Discover AGENTS.md, GEMINI.md, `.clinerules`, and KQODE.md from root to cwd. | Trace lists loaded instruction files. |
| R29 | Init command | Generate a starter KQODE.md or AGENTS.md from repo scan. | `/init` creates a concise project guide. |
| R30 | Attachments | Support file mentions, folder mentions, URLs, screenshots metadata, issues, and inline comments. | Prompt can include `@path` context. |
| R31 | Targeted reads | Prefer search plus range reads over full repo context. | Large repo task reads only selected files. |
| R32 | Repo map | Defer AST map; implement file tree and symbol hooks first. | Repo map command returns bounded summary. |
| R33 | Working set | Track files read, edited, mentioned, and tested. | TUI shows active working set. |
| R34 | Long context | Add compaction trigger based on token estimate. | Long session compacts before provider limit. |
| R35 | Memory | Landed: markdown topic files under `~/.kqode/memory/<scope>` are item truth; a rebuildable SQLite V3 index + `memory_events.jsonl` back `/memory` list/show. | User views memory via the `/memory` surface. |
| R36 | Memory correction | Landed: `/memory` add/edit/forget plus an inbox with approve/reject/stale/undo (rollback-conflict aware) and content-free correction suppression keys. | User removes/undoes a bad memory; it is not recreated. |
| R37 | Memory scopes | Landed: user/repo/folder/session scopes keyed by opaque ids hashed from canonical workspace identity; ambiguous repo/folder identity fails closed. Team scope reserved. | Repo memory does not leak into an unrelated repo. |
| R38 | Auto extraction | Landed seam: cursor-gated, coalesced, proposal-only extraction scheduler over settled turns produces inbox candidates/active-audit entries; provider-backed extraction is deferred behind the worker trait. | Settled turns produce reviewable candidate entries without provider calls. |
| R39 | Prompt settings | Support system prompt override and generation knobs in config. | Config can change temperature/reasoning for a profile. |
| R40 | Ignore/trust rules | Add `.kqodeignore` and trusted-root config. | Ignored files are excluded from search/read. |
| R41 | Advanced RAG | Defer; keep context adapter interface open. | No vector DB required for first demo. |

## R42-R52. Safety, permissions, and sandbox

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R42 | Approval modes | Define mode presets as policy bundles. | Read-only blocks writes and shell. |
| R43 | Per-tool rules | Match rules by tool name and optional path/command class. | `shell` can be ask while `read_file` is allow. |
| R44 | Trust boundary | Workspace roots define allowed file scope. | Parent directory read requires approval or denial. |
| R45 | Gates | Route file, shell, network, cost, and ambiguous actions through policy. | Network command asks before execution. |
| R46 | Risk detection | Add simple classifiers for destructive shell, secrets, and path escape. | `rm -rf` is flagged before approval. |
| R47 | Sandbox | Build KQode-owned sandbox-lite as the first-scope process isolation layer. | Command runs with timeout and cwd restriction. |
| R48 | Isolation | Enforce time, resource, path, and network controls per backend. | Sandbox event records limits used. |
| R49 | Policy engine | Centralize allow/ask/deny decisions in `kqode-policy`. | Same rule works for TUI and headless. |
| R50 | Approval surfaces | Implement CLI/TUI approval first; file IPC later. | User can approve/edit/reject a diff in TUI. |
| R51 | Non-TTY fail closed | In headless mode, missing approval returns a denied error unless auto mode permits. | CI run does not hang waiting for input. |
| R52 | Trace safety events | Persist policy input, decision, approver, and reason. | Replay shows why a command ran. |

## R53-R63. Sessions and replay

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R53 | Session transcripts | Store per-session JSONL under KQode home grouped by workspace key. | Session file appears after first run. |
| R54 | Session management | SQLite index for list/resume/delete/rename/title. | `kqode sessions` lists current repo sessions. |
| R55 | Checkpoint/rewind/fork | Checkpoint event plus snapshot summary. | User can fork from previous turn. |
| R56 | Durable state | Rebuild session state from JSONL plus snapshots. | Restart can resume after model output. |
| R57 | Side-effect idempotency | Assign side-effect IDs and record apply completion. | Replay does not reapply completed patch. |
| R58 | Trajectory format | Include messages, actions, observations, exit status, config, and stats. | Exported trajectory is self-contained. |
| R59 | Replay | Replay in dry-run/read-only mode first. | Inspector can reconstruct timeline. |
| R60 | Demo conversion | Convert trace into Markdown demo script. | Demo file explains task steps. |
| R61 | Inspector UI | Defer; start with terminal timeline view. | `kqode replay <id>` shows timeline. |
| R62 | Export | Debug ZIP and Markdown export commands. | Export warns about sensitive data. |
| R63 | Sharing | Defer; design local export before public share. | No network sharing in first scope. |

## R64-R84. CLI, TUI, models, and config

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R64 | Rendering | TUI renders markdown, code, diffs, and tool events. | Diff panel is readable. |
| R65 | Themes | Keep theme tokens in TypeScript TUI config. | Dark/light theme switch works. |
| R66 | Keybindings | Central command registry with keybindings and help overlay. | Help shows available keys. |
| R67 | Prompt UX | Store draft/history locally; queue follow-up while running. | User can queue text during tool run. |
| R68 | Editor composer | Respect `$VISUAL`/`$EDITOR` for long prompts. | Editor text returns to prompt. |
| R69 | Copy/clear | Copy latest message; clear screen only affects UI state. | Session persists after clear. |
| R70 | Commands | Implement status, usage, model, provider, permissions, settings, doctor. | `/status` reports current session metadata. |
| R71 | Custom commands | Load markdown/config commands from user and project dirs. | `/custom` command appears in help. |
| R72 | Command inputs | Support args, file includes, shell-output includes, and routing metadata. | Custom command can include a file. |
| R73 | Model controls | Configurable model and reasoning effort per session. | `/model` changes provider model. |
| R74 | Variants | Defer; model profile cycling can use named profiles. | `/model next` cycles configured profiles. |
| R75 | Routing | Provider layer can fallback on unavailable model. | Simulated unavailable model falls back. |
| R76 | Local model | Defer; keep OpenAI-compatible adapter ready. | Ollama can be added later without core rewrite. |
| R77 | Provider auth | OAuth/API key/subscription config with secure storage. | Provider health check succeeds. |
| R78 | Provider plugins | Defer; start with built-in provider adapters. | Provider trait supports external adapter later. |
| R79 | Config layers | Merge defaults, user, project, profile, and CLI overrides. | Project config overrides user config safely. |
| R80 | Feature flags | Gate unstable features behind config/env flags. | Experimental command hidden by default. |
| R81 | Prompt caching | Track stable fragments and provider cache hints where supported. | Cache metadata appears in trace. |
| R82 | Quota/cost | Track budget and hard-limit abort. | Cost limit stops a run cleanly. |
| R83 | Credentials | Store secrets in OS keychain when possible; env fallback. | Token is not printed in trace. |
| R84 | Startup | Lazy-load MCP, plugins, LSP, and telemetry. | Basic TUI starts without initializing all integrations. |
