# KQode Architecture Spec

## Primary implementation languages

### Rust

Use Rust for the core because KQode is an agent harness and runtime project, not just an app wrapper.

Rust owns:
- Agent loop.
- Provider abstraction.
- Tool registry.
- VFS and patch application.
- Sandbox and process execution.
- Policy engine.
- Session store.
- Replay engine.
- Eval runner.
- MCP client/server core.

### TypeScript

Use TypeScript for surfaces where iteration speed and ecosystem matter. React inside Tauri is the committed primary UI framework for KQode.

TypeScript owns:
- React desktop UI.
- Protocol client.
- Plugin authoring helpers.
- IDE/ACP adapters.
- Optional web companion.
- Rich visual trace viewer if built later.

### Python

Use Python only where the ecosystem is already Python-heavy.

Python may own:
- SWE-bench adapter scripts.
- AutoCodeRover-style benchmark adapters.
- Research-only fault-localization experiments.

Python should not own the main KQode harness.

## Repository shape

```text
Cargo.toml            # Tauri application and Rust core package
tauri.conf.json       # Desktop build and bundle configuration
capabilities/         # Tauri permissions
icons/                # Desktop application icons
src/
  main.rs             # Primary Tauri application entrypoint
  *.rs                # Rust core modules
desktop/
  package.json
  src/                # React frontend only
xtask/                # Repository automation
```

The root Rust package owns the Tauri application and core runtime. `desktop/`
owns only the React frontend. Business logic belongs in reusable Rust modules,
not in Tauri command handlers or React.

## Process model

KQode currently has one product process.

### Primary desktop application

The released `kqode` binary is the Tauri desktop application:

```text
kqode
  -> Tauri runtime
  -> React webview
  -> Tauri IPC commands
  -> Rust core
```

The desktop app does not start a separate backend process. The Rust core is
linked into the same executable.

## Protocol

Use a small event protocol before adding complex RPC.

### Client to core

- `session.start`
- `session.resume`
- `user.message`
- `approval.respond`
- `tool.user_input.respond`
- `session.cancel`
- `session.status`

### Core to client

- `assistant.delta`
- `assistant.message`
- `tool.call.requested`
- `tool.call.started`
- `tool.call.output_delta`
- `tool.call.completed`
- `approval.requested`
- `diff.proposed`
- `session.checkpointed`
- `session.completed`
- `session.error`
- `usage.updated`

Every event should include `session_id`, `turn_id`, `event_id`, `timestamp`, and optional `parent_event_id`.

## Agent loop

The loop should be deterministic around side effects:

1. Build prompt context from system prompt, project instructions, memory, active working set, and session state.
2. Call provider.
3. Parse assistant output and tool calls.
4. Validate tool call against schema.
5. Ask policy engine whether the call is allowed, denied, or needs approval.
6. Execute allowed tool through VFS or sandbox.
7. Record tool result.
8. Continue until `complete_task`, `ask_user`, budget exhaustion, cancellation, or unrecoverable error.

The model decides what to do, but KQode decides what is safe to execute.

## Tool result contract

Every tool result should separate execution success from loop continuation:

```text
success: true | false
should_continue: true | false
summary: short text
content: structured payload
error_kind: optional typed error
display: optional user-facing text
```

This prevents confusing "tool failed" with "task should stop".

## VFS design

The VFS is KQode's file-side safety layer.

It should:
- Normalize all paths relative to workspace roots.
- Reject path traversal and disallowed roots.
- Track file hashes when read.
- Stage writes before applying.
- Generate diffs.
- Reject stale edits when the file changed after read.
- Apply approved edits atomically where possible.
- Emit trace events for every read, stage, apply, reject, and conflict.

The first VFS is not a full virtual filesystem. It is a controlled workspace access layer.

## Sandbox design

The sandbox is KQode's process-side safety layer.

MVP sandbox-lite:
- Run commands in the selected workspace cwd.
- Scrub dangerous environment variables.
- Add timeout.
- Capture stdout/stderr.
- Limit output size.
- Gate network commands by policy.
- Gate commands with approval.

The primary sandbox path is KQode-owned host sandbox-lite plus VFS-controlled file mutation.

Optional later hardening:
- macOS Seatbelt where available.
- Linux namespaces or bubblewrap.
- Remote VM or cloud workspace.
- Copy-on-write workspace for small untrusted tasks.

## Storage

Use both files and SQLite.

### Files

Use files for inspectable artifacts:
- Session JSONL event logs.
- Exported Markdown.
- Debug ZIPs.
- Memory files.
- Plugin manifests.
- Skills.
- Project instructions.

### SQLite

Use SQLite for indexes:
- Sessions.
- Turns.
- Tool calls.
- Costs.
- Todos.
- Checkpoints.
- Eval runs.
- Badcases.

SQLite is an index, not the only source of truth for replay.

## Provider abstraction

Provider layer should hide vendor differences behind a normalized model interface.

Support:
- Streaming text.
- Structured tool calls where available.
- Text tool-call fallback.
- Model metadata.
- Reasoning effort.
- Context window.
- Cost estimates.
- Rate/quota errors.
- Retryable vs non-retryable errors.

First provider can be GitHub Copilot-backed or another available provider. The rest of KQode must not depend on a provider-specific tool format.

## Context system

Context should be built from bounded fragments:
- User prompt.
- System prompt.
- Project instructions.
- Active files.
- Search snippets.
- Memory.
- Recent session summary.
- Tool results.
- Attachments.

Each fragment should have:
- Source.
- Token estimate.
- Priority.
- Expiry or persistence.
- Trace citation.

No unbounded fragment should enter model context.

## Observability

Every task should produce:
- Trace ID.
- Session ID.
- Prompt/model metadata.
- Tool-call timeline.
- Approval decisions.
- Diff events.
- Check results.
- Token/cost estimate.
- Final outcome.

The first implementation can write local JSONL and human-readable summaries. OpenTelemetry export can come later.

## Security posture

KQode should default to conservative local execution:
- Workspace-bound reads and writes.
- Network gated.
- Shell gated.
- Third-party plugins untrusted until confirmed.
- MCP tools approved by server/tool name.
- Secrets redacted in traces where possible.
- Exports warn about sensitive content.

Hooks and plugins are useful but never the sole security boundary.
