# KQode agent instructions

## Source of truth

Inspect the checked-in implementation before relying on plans or older
documentation. Files under `docs/plans/` describe product direction and
implementation order; they may be ahead of the code. Files under
`docs/archive-tui/` are historical and must not be treated as the current product
surface.

Preserve unrelated working-tree changes. This repository is often developed
through release worktrees, so do not revert, overwrite, or reformat changes
outside the requested scope.

## Current repository map

- `crates/kqode-desktop/src/` is the Tauri desktop Rust application. It owns
  startup, application SQLite state, conversation orchestration, settings, and
  Tauri commands/events.
- `crates/kqode-core/` is the Tauri-independent provider-neutral contract crate.
  It currently contains cancellation, conversation DTOs, model response,
  validation, turn queue, runtime event/outcome, and tool registry/ledger
  contracts. It is not yet a complete agent loop.
- `crates/kqode-provider/` contains concrete model provider adapters, HTTP/SSE
  handling, and the Copilot CLI/SDK integrations.
- `crates/kqode-cli/` builds the `kqode` binary. The binary currently supports
  version output and a placeholder message only; `kqode run` and `kqode acp` do
  not exist yet.
- `crates/kqode-desktop/frontend/` is the React 19 + Vite frontend embedded by
  Tauri.
- `xtask/` contains Cargo-facing development automation.
- `evaluation/golden/` is the native Harbor golden-task dataset.
- `blog/` is the bilingual Docusaurus development blog and has additional
  instructions in `blog/AGENTS.md`.
- `docs/plans/` contains active delivery plans, and `docs/research/` contains
  supporting implementation research.
- `crates/kqode-desktop/capabilities/`, `icons/`, `tauri.conf.json`, and
  `build.rs` configure the packaged desktop application.
- `scripts/`, `.github/workflows/`, and `.run/` contain workspace-level
  packaging, CI, and IDE support.
- `.kqode-dev/` shadows external development tooling. Do not treat it as KQode
  product source or edit it during normal product work.

The legacy `tui/` package has been removed. Do not introduce a terminal UI or
new Ink/TUI code.

## Current execution architecture

The implemented desktop path is:

```text
React UI
  -> Tauri invoke commands and emitted events
  -> ConversationService
  -> LlmService
  -> provider router and provider adapter
  -> provider-neutral AssistantResponse / ChatCompletion
  -> SQLite conversation and settings stores
```

The frontend uses `useConversationHistory` and `useLlmSettings` as its main IPC
and state boundaries. Rust emits `conversation-updated` and
`conversation-message-stream`; the TypeScript listeners merge those updates into
local UI state. Keep command arguments, event names, serialized field casing, and
the Rust/TypeScript types synchronized when either side changes.

The desktop application currently supports:

- persisted conversations, messages, pending turns, workspace selection,
  provider/model selection, archive, retry, delete, and steering;
- streamed assistant text and background title generation;
- per-provider settings and cached model lists in SQLite;
- Kimi, OpenAI, Anthropic, DeepSeek, GitHub Copilot CLI, GitHub Copilot SDK, and
  custom OpenAI-compatible providers.

Kimi, OpenAI, DeepSeek, and custom providers share the OpenAI-compatible
implementation. Anthropic has its own protocol adapter. Copilot CLI and Copilot
SDK have separate adapters and lifecycle behavior. Keep provider-native request,
response, streaming, and tool-call formats inside
`crates/kqode-provider/src/provider/`; do not leak them into conversation or
frontend types.

## Runtime migration status

`kqode-core` is the dependency direction for reusable runtime work:

```text
kqode-desktop ─> kqode-provider ─> kqode-core
kqode-cli ─────> kqode-provider ─> kqode-core
```

`kqode-core` must remain independent of Tauri, desktop SQLite state, Harbor, and
ACP. `kqode-provider` must remain independent of desktop and CLI adapters.
`kqode-cli` must remain usable without desktop system libraries. The desktop
crate may adapt application services and providers to core contracts, but
reusable runtime state machines must live in `kqode-core`.

The current core crate provides:

- provider-neutral chat messages, assistant text/tool-call actions, streaming
  deltas, prompt cache keys, and typed chat errors;
- provider-neutral conversation DTOs, chat validation, and keyed turn queue
  coordination;
- cancellation tokens;
- model-step, usage, finish-reason, runtime-event, turn-budget, stop-reason, and
  turn-outcome contracts;
- tool definitions, effects, exposure, execution mode, source, limits, registry
  snapshots, schema validation, handlers, call ledger, and typed results.

The built-in `run_command`, `fetch_web_url`, and `ask_user` registrations
currently use deterministic fake handlers. Provider adapters can serialize and
parse tool calls, but the desktop chat path deliberately rejects a model tool
action instead of executing it.

Do not describe or depend on the following as implemented until the code exists:

- an executable multi-step `AgentRuntime`;
- production command, web, or user-interaction handlers;
- policy, approval, sandbox, VFS, mutation observation, or durable JSONL trace;
- `kqode run`, `kqode acp`, Harbor agent integration, or Paseo integration;
- MCP, subagents, browser automation, or plugin execution.

Follow
`docs/plans/2026-09-06-002-feat-agent-runtime-tools-acp-delivery-plan.md` for the
approved implementation order. Build the shared headless runtime before ACP, and
keep ACP/Harbor/Paseo integrations as thin adapters over that runtime.

## Runtime and tool invariants

- Canonical tool names are `run_command`, `fetch_web_url`, and `ask_user` on
  every provider, runtime, trace, CLI, and protocol surface.
- Normalize provider-native tool calls into one `ToolCall` shape before runtime
  handling. Preserve provider parse failures as correlated malformed-argument
  data instead of dropping the call.
- Freeze a `ToolExposureSnapshot` for each model step. Validate and invoke calls
  against the same snapshot so registry mutation cannot change in-flight
  semantics.
- Keep tool-call IDs stable. Every accepted call must move through the ledger
  once and receive exactly one terminal result.
- Keep execution success separate from loop control. `ToolResult` includes
  `success`, `should_continue`, `summary`, `content`, optional `error_kind`,
  optional `display`, and optional `metadata`.
- Enforce turn budgets and cancellation before starting model requests or tool
  batches. Rejected work must not consume partial budget or produce
  success-shaped output.
- Runtime events and final outcomes are provider-neutral. Desktop, CLI, trace,
  ACP, and evaluation adapters translate them without changing semantics.
- Tool definitions must declare observable effects and exposure explicitly.
  Never expose a production tool before its required safety dependencies exist.
- Non-interactive/headless paths fail closed when user input, approval, sandbox
  support, or another required capability is unavailable.

## Persistence, credentials, and IPC

The desktop database lives at `~/.kqode/kqode.sqlite3`. Database schema changes
must be append-only migrations under
`crates/kqode-desktop/src/database/migrations/`; register each migration,
increment `LATEST_DATABASE_VERSION`, and test both fresh and upgraded databases.
Never rewrite an already-released migration.

Conversation persistence belongs in
`crates/kqode-desktop/src/conversation/store/`; desktop use cases belong in
`crates/kqode-desktop/src/conversation/service/`, while provider-neutral queue
behavior belongs in `crates/kqode-core/src/runtime/turn_queue/`. Do not embed SQL
or queue transitions in Tauri commands or React components.

Provider API keys are stored by the Rust settings store but must never be
serialized back to the frontend. The IPC shape returns an empty `apiKey` plus a
redacted `apiKeyPreview`; preserve the existing key only when the matching
provider URL and preview prove the user did not replace it. Never print secrets
in logs, errors, traces, fixtures, or tests.

Keep Tauri command functions thin: deserialize input, call an application
service, translate the error, and emit required events. Long-running model work
must not hold a `rusqlite` connection or `MutexGuard` across `.await`.

## Code organization

Prefer focused source files at or below roughly 200 lines. Split
modules/components/helpers before they grow beyond that size unless there is a
clear, review-documented reason to keep them larger. Existing oversized files
are not precedent; split them when materially extending their behavior.

Keep `mod.rs` files as module entry points containing declarations, re-exports,
and only minimal shared type wiring. Move implementation functions and
substantial logic into focused submodules. Keep each module responsible for one
clear concern.

Use rustdoc comments (`///`) for non-trivial public functions, structs, enums,
traits, modules, and helpers. Add a `# Errors` section when failure behavior is
not obvious. Use `# Panics`, `# Safety`, and `# Examples` only when they add real
value.

Avoid hard-coded protocol names, event names, status strings, provider
identifiers, and non-obvious numeric literals. Define shared enums or named
constants. When a value crosses the Rust/TypeScript boundary, update both sides
and add a serialization or integration test where practical.

Prefer typed errors and explicit failure paths. Do not add broad catches,
silently ignore invalid state, fabricate successful fallbacks, or replace
recoverable correlated failures with panics. Preserve unrelated user work and
avoid unnecessary dependencies.

## Build, test, and lint

The supported Rust baseline is 1.94.0 with edition 2024. Run commands from the
repository root:

```bash
cargo build --workspace --all-targets
cargo xtask desktop-dev
cargo test --workspace
cargo test -p <crate-name> <test_name>
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo xtask workspace-boundaries
```

Use the smallest focused test while iterating, then run the checks relevant to
the changed surface. The CI Rust gate is format, Clippy, workspace build, and
workspace tests.

Provider and tool-selection live tests are marked `#[ignore]` because they use
ambient credentials, `~/.kqode/kqode.sqlite3`, and network services. Run them
only when the user explicitly wants live validation and the required
credentials/services are available. Never make ordinary tests depend on them.

### Desktop frontend

Prefer the Cargo-facing command for development:

```bash
cargo xtask desktop-dev
```

For focused frontend validation, run from
`crates/kqode-desktop/frontend/`:

```bash
bun run typecheck
bun run build
```

Use the existing Bun lockfile and scripts. Keep async IPC, event subscription,
and persistence logic in hooks/services rather than presentational components.

### Xtask

List commands with `cargo xtask help`. Keep command modules under
`xtask/src/commands/` as thin wrappers around reusable implementations under
`xtask/src/support/`.

When adding or renaming an xtask command, register its `CommandSpec`, add tests
where appropriate, and add a matching checked-in IDE run profile under `.run/`
using the `xtask: <command>` naming pattern.

Running two or more `cargo xtask` commands at once fails on Windows because each
call relinks the shared `target\debug\xtask.exe`. For long-lived or parallel
commands, use the launcher, which builds once and runs per-invocation copies:

```powershell
./scripts/xtask.ps1 blog-serve
```

```bash
./scripts/xtask.sh blog-serve
```

### Blog

Follow `blog/AGENTS.md`. Prefer:

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

### Harbor golden tasks

Keep each `evaluation/golden/tasks/<task-id>/` directory self-contained and
compatible with Harbor task schema 1.4. Do not add a parallel KQode task schema.
Fixtures must be deterministic, offline, secret-free, and independent of the
working tree. Hidden verifier files and `solution/` must not be exposed during
the agent phase, and every verifier must write a numeric
`/logs/verifier/reward.json` even on failure.

## Plan document review checkboxes

When creating or updating Markdown plans under `docs/plans/`, keep the top `#`
title clean. When review tracking is requested, put the checkbox directly on the
affected content bullet:

```md
- [ ] New or updated decision that needs review
- [x] Existing decision whose checked state should be preserved
```

Use item-level checkboxes so only changed content returns to unchecked. Preserve
the checked state of unchanged bullets. Do not use section-level review
callouts, heading checkboxes, checkboxes inside tables, or standalone
`- [ ] Reviewed` bullets. If a section only contains reviewed subsections, track
review on the changed bullets inside those subsections rather than on the parent.

## Provider configuration and storage

Provider credentials and the active `(provider, model)` selection are **user-global**. Workspace `.env` files are loaded only for development toggles such as `KQODE_DEBUG`; they do not configure provider credentials, model ids, or base URLs.

- **SQLite index** at `~/.kqode/kqode.db` holds non-secret provider settings + the active selection (plus a provisional sessions/turns spine). It is a rebuildable index over the JSONL transcript truth, opened/migrated at backend init via compile-time-embedded, forward-only `refinery` migrations (`refinery_schema_history`). The store is now fail-closed: any DB open/migrate/sanity failure prevents `kqode.backend.ready`, exits with the store-fatal code, and prints a `KQODE_STORE_FATAL:` remedy. The DB is **never auto-deleted**. The store holds **no key material** — only a non-secret `key_present` bit.
- **Pre-`refinery` reset:** databases created by the former `user_version` runner (or dirty app tables without `refinery_schema_history`) are not auto-baselined. Delete `~/.kqode/kqode.db` plus `~/.kqode/kqode.db-wal` and `~/.kqode/kqode.db-shm`, then restart; the index rebuilds from JSONL. A `refinery` DB still reports `PRAGMA user_version = 0`, so running a pre-`refinery` binary against it looks like a fresh DB to that older binary.
- **OS keychain** holds API keys under the service constant `com.nincere.kqode.providers`, keyed by provider id (`kimi`/`custom`). Keys are validated before storage and never logged, serialized, or written to the DB/JSONL. When the keychain is unavailable, `/login` refuses to store and asks the user to retry after the OS keychain is available.
- **Preset vs Custom:** the preset Kimi base URL is a compiled constant and Kimi is configured via `/login` (keychain) **only**. The **Custom** provider is also `/login`-only: its API key lives in the OS keychain and its validated HTTPS base URL is persisted in the SQLite provider settings row.
- **Commands:** `/login` connects or clears a provider (masked key entry; the key never enters a Jotai atom, only component-local state → the set-key request); `/model` picks the active model across connected providers.
- `rusqlite` (bundled), `keyring`, `secrecy`, and `tempfile` (dev) are in the dependency graph for store/keychain work; `bundled` `rusqlite` compiles SQLite via `cc` (a C toolchain requirement in the otherwise pure-Rust/rustls graph).

## Commit workflow

Use Conventional Commits with the narrowest useful scope. Implement plan work
one commit-sized unit at a time. After each commit, run code review on that unit,
then pause for user review and explicit consent before starting the next commit.
