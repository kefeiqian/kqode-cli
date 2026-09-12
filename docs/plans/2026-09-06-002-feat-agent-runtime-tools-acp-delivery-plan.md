---
title: "feat: Deliver the provider-neutral agent runtime, safe tools, and ACP integration"
type: feat
date: 2026-09-06
status: proposed
supersedes:
  - docs/plans/2026-09-05-001-feat-first-tool-registry-sandbox-plan.md
  - docs/plans/2026-09-06-001-feat-harbor-paseo-acp-integration-plan.md
origin:
  - docs/research/2026-09-04-first-tool-payload.md
  - docs/research/2026-09-05-initial-tool-registry.md
  - docs/research/2026-09-05-agent-completion-semantics.md
  - docs/research/2026-09-05-run-command-sandbox-vfs.md
  - docs/research/2026-09-06-agent-evaluation-benchmarks.md
  - docs/research/2026-09-06-tool-loop-v1-2-reference-design.md
  - docs/paseo-onboarding.md
---

# Provider-Neutral Agent Runtime, Safe Tools, and ACP Delivery Plan

## Summary

Build one reusable Rust runtime that owns KQode's model loop, tool execution,
policy, cancellation, interaction, budgets, trace, and turn outcomes. The desktop
application, direct headless CLI, Harbor, and Paseo must all use this runtime
instead of implementing separate agent loops.

```text
Desktop adapter ───────────────┐
                              |
kqode run ────────────────────┼─> kqode-core AgentRuntime
                              |     -> provider adapter
Harbor generic ACP runner ────┤     -> provider-neutral tool loop
                              |     -> tool registry and handlers
Paseo generic ACP provider ───┘     -> policy, sandbox, interaction
                                    -> trace and turn outcome
```

The next implementation milestone is **V1.2: provider-neutral agent runtime and
fake tool loop**. ACP transport begins only after the same runtime can complete a
headless task without Tauri.

The two superseded plans remain as design history and detailed research input.
This document is the source of truth for implementation order, dependencies,
canonical names, and acceptance boundaries.

---

## Current Baseline

The current code already provides:

- Provider request serialization for OpenAI-compatible and Anthropic tool schemas.
- Non-streaming normalization of OpenAI-compatible `tool_calls` and Anthropic
  `tool_use`.
- Provider-neutral `AssistantAction`, `ToolCall`, `ToolResult`, and typed tool
  errors.
- JSON schema validation for the current builtin interfaces.
- Provider-specific tool-result serialization.
- Fake round-trip tests proving parse, validate, result serialization, and final
  assistant text.
- Production API and Copilot SDK paths that keep tool execution disabled.

The missing runtime behavior is:

- No executable provider-neutral multi-step loop.
- No immutable per-step tool exposure snapshot.
- No registry binding between definitions and executable handlers.
- No strict tool-call ledger or run budgets.
- No shared runtime event stream or durable turn outcome.
- No safe process, network, interaction, or approval implementations.
- No Tauri-independent runtime crate, headless CLI, or ACP server.

---

## Resolved Cross-Document Decisions

| Topic | Decision |
|---|---|
| CLI package | Keep the Cargo package/crate name `kqode-cli`. |
| CLI binary | Install the user-facing command as `kqode`, with `kqode run` and `kqode acp`. |
| Desktop binary | Rename the internal Tauri binary and `mainBinaryName` to `kqode-desktop`; keep the displayed product name `KQode`. |
| Canonical tool names | Use `run_command`, `fetch_web_url`, and `ask_user` on every external surface. |
| Existing tool names | Rename or normalize `exec_command`, `web_fetch`, and `ask_user_question` before enabling production tool choice. |
| ACP implementation | Use the compatible official Rust ACP SDK after a short compatibility spike. |
| ACP version | First release targets the stable lifecycle supported by the selected SDK, Harbor, and Paseo; do not implement draft-only features speculatively. |
| MCP | Advertise `supportsMcpServers: false` until KQode has explicit MCP session wiring. |
| Tool execution ownership | KQode owns filesystem, command, web, sandbox, and policy execution in the first ACP release. |
| Production exposure | Do not expose `run_command` until an enforceable sandbox and policy backend exists. |
| VFS | VFS controls KQode-owned file operations; it is not a substitute for an OS process sandbox. |
| ACP adapters | Harbor and Paseo integrations remain thin launch/configuration layers over the same runtime. |

---

## Scope

### Included

- [ ] Create a Tauri-independent `kqode-core` runtime boundary.
- [ ] Implement a provider-neutral multi-step model and tool loop.
- [ ] Bind tool definitions, schemas, effects, exposure, and handlers.
- [ ] Add strict call lifecycle, budgets, cancellation, typed outcomes, and trace
      events.
- [ ] Implement workspace normalization, process supervision, sandboxing, command
      policy, approval, and bounded output.
- [ ] Implement `run_command`, `fetch_web_url`, and `ask_user`.
- [ ] Add shell mutation observation without claiming VFS attribution.
- [ ] Add `kqode run` before ACP.
- [ ] Perform an ACP SDK, Harbor, and Paseo compatibility spike.
- [ ] Implement `kqode acp` over stdio.
- [ ] Validate the same runtime through desktop, direct CLI, Harbor, and Paseo.
- [ ] Preserve KQode-native append-only JSONL trace alongside ACP/Harbor artifacts.

### Deferred

- [ ] Defer PTY, persistent stdin, background jobs, process resume, and interactive
      shell sessions.
- [ ] Defer ACP session listing, resume, deletion, and forking.
- [ ] Defer client-delegated filesystem and terminal execution.
- [ ] Defer MCP server injection and MCP capability advertisement.
- [ ] Defer browser automation, arbitrary HTTP methods, cookies, and authenticated
      browser state.
- [ ] Defer subagents, plugin execution, deferred tool discovery, and workflow
      tools.
- [ ] Defer dedicated `read_file`, `list_directory`, `glob`, and `grep` until
      evaluation shows that safe command-based inspection is insufficient.
- [ ] Defer `apply_patch` and complete VFS mutation support to a later unit after
      the foreground command path is stable.

---

## Canonical Architecture

```text
ProviderResponse
  -> ProviderAdapter
  -> ModelStep
       assistant_content
       tool_calls[]
       finish_reason
       usage
       provider_metadata
  -> AgentRuntime
       ToolExposureSnapshot
       ToolCallLedger
       TurnBudget
       CancellationToken
       RuntimeEventSink
  -> ToolInvocation
       Registry lookup
       Schema validation
       Policy and approval
       Handler execution
  -> ToolResult
  -> ProviderAdapter tool-result messages
  -> next ModelStep or TurnOutcome
```

ACP remains outside the runtime:

```text
ACP request
  -> kqode-cli ACP adapter
  -> AgentRuntime command
  -> RuntimeEvent
  -> ACP session/update
```

- [ ] `kqode-core` must not depend on Tauri, ACP, desktop SQLite state, or Harbor.
- [ ] `kqode-cli` must not require desktop system libraries.
- [ ] Provider-native message formats must remain behind provider adapters.
- [ ] ACP-native types must remain at the `kqode-cli` transport boundary.
- [ ] Desktop, direct CLI, and ACP must consume the same runtime events and outcomes.
- [ ] Runtime state, budgets, cancellation, tools, and trace must be isolated per
      session.

---

## Core Runtime Contracts

### Model step

```text
ModelStep
  assistant_content?
  tool_calls[]
  finish_reason
  usage?
  provider_metadata?
```

- [ ] Preserve assistant content when a Provider returns text and tool calls in the
      same step.
- [ ] Preserve Provider tool-call IDs and raw diagnostic metadata.
- [ ] Convert malformed arguments into correlated typed errors when a stable call
      ID and name exist.
- [ ] Enable automatic tool choice only when the current exposure snapshot is
      nonempty and production execution is enabled.
- [ ] Translate `ToolResult` back into each Provider's native message format.

### Tool definition and exposure

```text
ToolDefinition
  canonical_name
  display_name
  description
  input_schema
  effects
  exposure
  execution_mode
  limits
  source

ToolExposureSnapshot
  generation
  definitions
  handlers
```

- [ ] Bind every exposed definition to exactly one handler.
- [ ] Reject duplicate canonical names during registration.
- [ ] Support `direct` and `hidden`; reserve `deferred` without implementing tool
      discovery.
- [ ] Use the same immutable snapshot for Provider serialization, call lookup,
      validation, and dispatch within one model step.
- [ ] Treat a call to a hidden or unexposed tool as a recoverable typed error.
- [ ] Define `Sequential` now and reserve `ParallelSafe`; execute serially in V1.2.

### Tool invocation and result

```text
ToolInvocation
  call_id
  canonical_name
  arguments
  session_id
  turn_id
  step_id

ToolResult
  call_id
  canonical_name
  success
  should_continue
  summary
  content
  error_kind?
  display?
  metadata?
```

- [ ] Validate arguments before policy evaluation or handler execution.
- [ ] Preserve one stable call ID across Provider messages, approvals, runtime
      events, trace records, ACP updates, and Harbor trajectories.
- [ ] Return unknown, hidden, invalid-argument, denied, unavailable, and ordinary
      execution failures as correlated recoverable results.
- [ ] Keep infrastructure, Provider, scheduler, persistence, and invariant failures
      separate from ordinary tool failures.
- [ ] Keep `should_continue` independent from execution success.
- [ ] Model normal task completion as a turn outcome, not a `complete_task` tool.

### Tool call ledger

```text
received
  -> validated
  -> running
  -> succeeded | failed | cancelled | skipped
```

- [ ] Require call IDs to be nonempty and unique for the complete run.
- [ ] Reject duplicate call IDs before executing any call in the affected batch.
- [ ] Reject name changes, result-before-call, and duplicate settlement.
- [ ] Require every accepted call to reach exactly one terminal ledger state.
- [ ] Preserve synthetic local cancellation/skipped records for replay without
      restarting the model after user cancellation.

### Turn outcome

```text
TurnOutcome
  completed
  blocked
  cancelled
  budget_exceeded
  failed
```

- [ ] Complete when the model returns final visible assistant content with no
      pending tool calls.
- [ ] Block when approval or user input is required but no responder exists.
- [ ] Cancel model and active tool work through one run-owned cancellation token.
- [ ] Represent budget exhaustion separately from Provider and execution failures.
- [ ] Attach a machine-readable stop reason and final trace event to every outcome.

---

## V1.2 Loop Rules

### Continuation

- [ ] Execute calls in model order and serialize results in the same order.
- [ ] After every tool batch, append all correlated results and request the next
      model step.
- [ ] Unknown, hidden, invalid, denied, unavailable, and ordinary tool failures
      continue unless their result explicitly stops the turn.
- [ ] Provider protocol failures, duplicate call IDs, ledger invariants, and
      persistence failures terminate the turn.
- [ ] If a post-tool model step contains no tool calls and no visible text, allow
      one text-only nudge before failing as an empty response.

### Budgets

| Budget | V1.2 default | Behavior |
|---|---:|---|
| Tool rounds | 8 | After the eighth result batch, allow only text-only finalization. |
| Tool calls per round | 8 | Reject the entire batch before dispatch when exceeded. |
| Total tool calls | 32 | Enter text-only finalization when the next batch would exceed it. |
| Model requests | 10 | Initial request, up to eight tool continuations, and one finalization. |
| Consecutive identical call signature | warn at 3; finalize at 5 | Signature is canonical name plus canonical JSON arguments. |
| Elapsed time | Configurable | A stricter caller budget may reduce but not expand the runtime maximum. |

- [ ] A tool round is one model step containing at least one tool call.
- [ ] Invalid and unknown calls consume round and call budgets.
- [ ] Text-only finalization must omit tool definitions and set the Provider's
      equivalent of `tool_choice: none`.
- [ ] A tool call returned during text-only finalization is a Provider protocol
      error and is never executed.
- [ ] Budget checks occur before dispatch so a rejected batch has no partial side
      effects.

### Cancellation

- [ ] Check cancellation before Provider calls, after Provider completion, before
      every tool dispatch, while handlers run, and before the next model step.
- [ ] Stop dispatching unstarted calls immediately.
- [ ] Propagate the same cancellation token through runtime hooks, approvals,
      Provider requests, and handlers.
- [ ] Wait for started work to become quiescent or reach a bounded grace deadline.
- [ ] Record skipped and cancelled calls in local trace.
- [ ] Do not send partial or synthetic cancellation results back to the model after
      the user has cancelled the turn.
- [ ] Make repeated cancellation idempotent.

---

## Safe Tool Contracts

### `run_command`

```text
Input
  command
  cwd?
  timeout_ms?

Output
  exit_code?
  signal?
  timed_out
  cancelled
  stdout
  stderr
  truncated
  omitted_bytes
  duration_ms
  sandbox_mode
  network_mode
  mutation_observation?
```

- [ ] Execute one foreground, one-shot, noninteractive process with closed stdin.
- [ ] Resolve cwd against the canonical workspace and reject traversal, symlink, or
      junction escape.
- [ ] Route every command through policy, approval, process supervision, and an
      enforceable sandbox backend.
- [ ] Keep filesystem and network permissions independent.
- [ ] Deny shell network by default; use `fetch_web_url` for controlled reads.
- [ ] Capture stdout and stderr separately with bounded retention and model-facing
      output limits.
- [ ] Terminate the complete descendant process tree on timeout, cancellation, or
      session disposal.
- [ ] Return nonzero exit status as an execution result rather than an
      infrastructure exception.
- [ ] Never expose this tool to a real model before the sandbox/policy milestone is
      accepted.

### `fetch_web_url`

- [ ] Accept HTTP(S) URLs only.
- [ ] Reject loopback, private, link-local, metadata-service, and restricted
      destinations after DNS resolution.
- [ ] Revalidate every redirect and limit redirect count.
- [ ] Apply connection, read, response-byte, converted-text, and model-output
      limits.
- [ ] Avoid ambient cookies, credentials, authorization headers, and secret-bearing
      proxy configuration.
- [ ] Return requested URL, effective URL, status, content metadata, truncation, and
      policy facts without logging credentials.
- [ ] Support Harbor Compose sidecars without requiring public Internet access.

### `ask_user`

- [ ] Represent interaction as a durable paused runtime state, not blocking stdin.
- [ ] Support free-text questions and closed-choice confirmations.
- [ ] Preserve stable question and call IDs across pause, response, trace, and
      resume.
- [ ] Support cancellation while waiting.
- [ ] Return a typed blocked/unavailable outcome when no responder exists.
- [ ] Allow a deterministic evaluation responder for Harbor Golden tasks.
- [ ] Use ACP permission requests for risk approval and ACP elicitation for missing
      non-approval information when negotiated.

---

## Workspace, Sandbox, and Policy

### Workspace and process supervisor

- [ ] Normalize one workspace root and all requested cwd values.
- [ ] Own each process tree independently from the shell implementation.
- [ ] Use Unix process groups/sessions and Windows Job Objects or equivalent.
- [ ] Drain stdout and stderr without deadlock.
- [ ] Enforce timeout even for continuously producing processes.
- [ ] Construct a conservative child environment rather than inheriting all host
      variables.
- [ ] Remove secret-like and credential variables unless explicitly allowed.
- [ ] Bound concurrent process count per session.

### Policy decisions

```text
allow
ask
deny
```

- [ ] Evaluate policy before process launch.
- [ ] Bind approval to command, canonical cwd, filesystem mode, network mode,
      environment profile, and extra roots.
- [ ] Keep approval independent from sandbox selection.
- [ ] Parse common chaining, pipelines, and redirection conservatively.
- [ ] Deny one complete command if any segment is denied.
- [ ] Treat parser failure as `ask` or `deny`, never implicit allow.
- [ ] Fail closed in headless mode when fresh approval is required.

### Sandbox profiles

- [ ] `read-only` permits workspace inspection and denies workspace mutation.
- [ ] `workspace-write` permits approved workspace writes while denying outside
      writes and preserving protected paths.
- [ ] `danger-full-access` requires explicit fresh approval or explicit caller
      configuration.
- [ ] Network remains independently denied unless explicitly enabled.
- [ ] Missing backend support is an explicit unsupported state, never a silent
      unsandboxed fallback.

### Mutation observation and future VFS

- [ ] Observe command-originated tracked, untracked, and deleted workspace changes
      using bounded Git or filesystem snapshots.
- [ ] Mark command mutations as `shell_observed`, never `vfs_applied`.
- [ ] Avoid attributing pre-existing dirty changes to the command.
- [ ] Return `mutation_state_unknown` if observation fails or exceeds budget.
- [ ] Later add `apply_patch` through workspace path checks, stale detection,
      staged diff, approval, same-file serialization, and atomic publication where
      possible.

---

## Runtime Events and Trace

- [ ] Define one provider-neutral event enum shared by desktop, CLI, and ACP.
- [ ] Include session, turn, step, model request, tool call, policy decision,
      interaction, cancellation, usage, and outcome identifiers.
- [ ] Emit assistant text and reasoning deltas when available.
- [ ] Emit tool received, started, progress, result, failure, skipped, and cancelled
      transitions.
- [ ] Write append-only JSONL as replayable runtime truth.
- [ ] Treat SQLite as an index and desktop adapter concern rather than the only
      session record.
- [ ] Redact credentials and bounded sensitive output before persistence.
- [ ] Derive ACP updates, Harbor events, and desktop projections from the same
      runtime event stream.

---

## Headless Runtime

### `kqode run`

- [ ] Accept instruction, workspace, provider, model, budgets, interaction mode,
      and trace path through explicit flags and environment variables.
- [ ] Read credentials from standard environment variables or an explicit headless
      config file, not desktop SQLite.
- [ ] Emit a machine-readable final result and append-only JSONL trace.
- [ ] Use distinct nonzero exit codes for blocked, cancelled, budget,
      configuration, Provider, and execution failures.
- [ ] Never convert missing approval or user input into implicit consent.
- [ ] Prove one real Provider task without Tauri before ACP implementation begins.

### Runtime ownership

- [ ] Keep desktop settings and persistence adapters in the root application.
- [ ] Move only application-independent behavior into `kqode-core`.
- [ ] Rewire the desktop application to the same `AgentRuntime`.
- [ ] Preserve existing desktop chat behavior during extraction.

---

## ACP Compatibility Spike

Before implementing the ACP server:

- [ ] Pin the current compatible official Rust ACP SDK version.
- [ ] Record the ACP protocol version negotiated by that SDK.
- [ ] Verify Harbor's generic ACP runner against a minimal echo agent.
- [ ] Verify Paseo provider diagnostics against the same echo agent.
- [ ] Confirm lifecycle method names, capability fields, model/mode discovery, and
      permission/elicitation behavior.
- [ ] Decide whether the first release supports one stable version or a narrowly
      scoped compatibility layer.
- [ ] Update this plan with pinned SDK, Harbor, Paseo, and protocol revisions before
      coding the production transport.

The spike may implement disposable protocol scaffolding outside production
runtime modules. It must not become a second agent loop.

---

## ACP MVP

### Process contract

- [ ] Implement `kqode acp` as a long-lived stdio process.
- [ ] Reserve stdout exclusively for JSON-RPC protocol frames.
- [ ] Write diagnostics to stderr and configured trace files.
- [ ] Handle malformed requests with protocol errors instead of process exit.
- [ ] Shut down active sessions cleanly on EOF.
- [ ] Support `--version` without starting the ACP server.

### Lifecycle

- [ ] `initialize` returns KQode identity, negotiated protocol, implemented
      capabilities, models, and modes.
- [ ] `session/new` validates workspace and creates isolated runtime, budget,
      cancellation, interaction, and trace state.
- [ ] `session/prompt` starts one runtime turn and maps runtime events to ACP
      updates.
- [ ] `session/cancel` reaches the active Provider request and process tree and is
      idempotent.
- [ ] Invalid or unknown sessions return typed protocol errors.

### Initial capability declaration

- [ ] Do not advertise resume, session listing, session deletion, or forking.
- [ ] Do not advertise MCP server support.
- [ ] Do not advertise client filesystem or terminal delegation.
- [ ] Advertise permission requests only after approval routing works.
- [ ] Advertise elicitation only after `ask_user` pause/resume works.
- [ ] Advertise only models and modes that the running process can actually use.

---

## Harbor and Paseo Integration

### Harbor

- [ ] Use Harbor's generic ACP runner rather than a Python-owned KQode loop.
- [ ] Add a local distribution that installs or mounts a locally built
      `kqode-cli`.
- [ ] Launch `kqode acp` through one shared registry entry.
- [ ] Pass credentials and runtime limits through explicit environment settings.
- [ ] Preserve Harbor ACP events and ATIF trajectory alongside KQode JSONL trace.
- [ ] Produce normalized tool events containing canonical name, call ID, argument
      summary, success, duration, and error kind.
- [ ] Run all Golden tasks through the real KQode process without task-specific
      adapter logic.

### Paseo

- [ ] Configure a generic provider with `extends: "acp"` and command
      `["kqode", "acp"]`.
- [ ] Set `supportsMcpServers: false`.
- [ ] Keep client filesystem and terminal delegation disabled in the first release.
- [ ] Discover models, modes, and capabilities from ACP initialization.
- [ ] Pass provider diagnostics for binary resolution, version, initialization,
      session creation, model discovery, and mode discovery.
- [ ] Verify text streaming, tool states, cancellation, permission requests, and
      elicitation.

---

## Unified Delivery Sequence

Each unit is one reviewable commit. After implementation and code review of one
unit, pause for explicit approval before starting the next.

### U0. Close the current Provider refactor and V1.1

- [ ] Reconcile the dirty working tree and preserve unrelated changes.
- [ ] Commit the Provider module migration and V1.1 protocol work in logical units.
- [ ] Confirm production tool execution remains disabled.
- [ ] Record the accepted baseline before creating new crates.

### U1. Create the minimal runtime crate boundary

- [x] Add `crates/kqode-core` and `crates/kqode-cli` workspace members.
- [x] Configure the `kqode-cli` package to emit the `kqode` binary.
- [x] Rename the root Tauri binary target and `mainBinaryName` to
      `kqode-desktop` while preserving the `KQode` product display name.
- [x] Ensure the CLI and desktop packages never emit the same Cargo artifact name.
- [x] Move or expose only provider-neutral types and ports needed by V1.2.
- [x] Keep Tauri, desktop SQLite, and ACP dependencies outside `kqode-core`.
- [x] Preserve desktop behavior through adapters.

**Acceptance:** `kqode-core` builds independently of desktop system libraries and
the existing desktop path still passes its focused tests.

### U2. Implement V1.2 runtime contracts

- [x] Add `ModelStep`, `ToolExposureSnapshot`, handler binding,
      `ToolInvocation`, `ToolCallLedger`, budgets, runtime events, and
      `TurnOutcome`.
- [x] Adopt canonical names `run_command`, `fetch_web_url`, and `ask_user`.
- [x] Add fake handlers only; do not enable real command or network execution.

**Acceptance:** Snapshot consistency, duplicate registration, hidden tools,
ledger invariants, and typed error behavior have deterministic tests.

### U3. Implement the V1.2 provider-neutral loop

- [x] Implement serial model -> tool -> result -> model continuation.
- [x] Add unknown, hidden, malformed, invalid, duplicate, cancellation, repetition,
      budget, empty-post-tool, and text-only finalization behavior.
- [x] Use a deterministic fake Provider to prove the complete two-step flow.
- [x] Keep real production Provider tool choice disabled until safe handlers exist.

**Acceptance:** A fake Provider calls a fake tool, receives one correlated result,
and returns final assistant text; every accepted call reaches one ledger terminal
state.

### U4. Add workspace policy and process supervision

- [x] Implement cwd normalization, environment construction, process ownership,
      timeout, cancellation, output limits, and descendant cleanup.
- [x] Do not expose `run_command` to the model.

**Acceptance:** Escape, timeout, cancellation, child cleanup, output truncation,
and secret-environment tests pass.

### U5. Add sandbox backend and command policy

- [x] Add a native Windows PowerShell adapter over the U4 process supervisor:
      prefer PowerShell 7, then Windows PowerShell 5.1; support an explicit
      absolute executable path without silently falling back when it is invalid.
      Use noninteractive, no-profile execution, UTF-16LE encoded script transport,
      and UTF-8 text output. Preserve ordinary scripts' final command success
      status, including native command failures and explicit `exit N`, and reject
      oversized scripts before spawning. Top-level named script blocks
      (`begin`/`process`/`end`/`dynamicparam`/`clean`) are explicitly unsupported;
      regular commands, leading `using`/`param`, and nested functions remain valid.
- [ ] Implement an enforceable Windows-native sandbox backend first. Linux and
      macOS backends are deferred; do not implicitly forward Windows requests
      through Git Bash, Cygwin, or WSL.
- [ ] Implement the Codex-style native architecture selected by the user on
      September 12: dedicated ordinary offline/online accounts, restricted tokens,
      scoped ACLs, independently enforced network rules and Job supervision.
      Windows Sandbox VM is not the selected implementation. Account/ACL/network
      setup requires a separate administrator-consent boundary; choosing this
      architecture does not authorize host setup or promote any capability.
- [ ] Add first-time disabled-account preparation (implemented; awaiting review).
      Generate fixed-role names from an installation ID, reject existing names
      without adoption or password reset, create only ordinary disabled accounts
      and a new local group, and retain SID-bound ownership evidence. Require a
      private durable journal to store DPAPI-protected random passwords and
      write-ahead intents before mutations. Failures stop with disabled partial
      state for explicit recovery, not implicit account deletion or execution.
      Native SAM creation is compiled but not exercised on this host.
- [ ] Add private durable account-journal storage (implemented; awaiting review).
      Bind to a trusted local directory handle, create a new installation
      subdirectory and exclusive JSONL file with protected process-user/SYSTEM
      DACLs, and flush every bounded record before acknowledging it. Reject
      reparse/collision targets, thread impersonation, invalid checkpoint order
      and mismatched identity receipts; poison the writer after any failure.
      Do not reopen, truncate, repair, resume or delete existing setup state.
      The trusted-parent selector, live reconciliation and authorized privileged
      helper remain required before production account setup.
- [ ] Add strict read-only account-journal inspection (implemented; awaiting review).
      Reopen through trusted parent and child handles with no ordinary write/delete
      sharing. Verify private DACLs, trusted ownership, object types and absence of
      reparse points, hardlink aliases and named streams. Reject missing/torn,
      oversized, unknown/duplicate-field or out-of-order records without repair.
      Check the expected installation and password decodability without exporting
      plaintext. Report only recorded receipts and unresolved mutation intents;
      a completed journal is not live SAM verification or authority to resume.
- [ ] Implement `allow | ask | deny`, read-only and workspace-write profiles, and
      independent network policy.
- [x] Add the command authorization gate and immutable context contracts:
      native PowerShell derives actual argv from the original approval script;
      freeze canonical executable/workspace/cwd, effective sanitized environment,
      filesystem/network permissions, extra roots, timeout, and output limits.
      Use a fresh single-use approval challenge for each execution; missing,
      rejected, stale, timed-out, or cancelled approval never dispatches a backend.
      Even an `allow` decision requires fresh approval for `danger-full-access`.
      Check full backend capabilities before approval and again before dispatch;
      partial support is insufficient, and network denial remains independent.
- [ ] Add production PowerShell syntax analysis for chains, pipelines, and
      redirection. The current production default is always `ask`; the
      deny-dominant segment-decision combiner is not a PowerShell parser.
- [x] Add an opt-in native AppContainer/LPAC feasibility probe:
      `cargo run -p kqode-core --example windows_sandbox_probe`. Use fixed scripts,
      fresh temporary fixtures/profile, explicit handle inheritance and atomic
      Job assignment; verify AppContainer token state before resuming the child.
      Include unconfined positive controls, filesystem counterexamples and actual
      IPv4 loopback TCP/UDP receiver observations. Remove the profile and fixture
      explicitly; return failure if the preferred-shell evidence is incomplete.
      This example is not a production backend and never grants tool authority.
- [ ] Resolve filesystem alias/protected-path enforcement before using LPAC for
      workspace-write. Do not translate successful token creation or ordinary
      ACL-denial tests into a full filesystem capability.
- [x] Add native Windows `WorkspaceSnapshot::capture` as an explicit preparation
      primitive, not a transparent replacement for the real workspace. Create
      fresh file objects beneath a new private user/SYSTEM directory; enumerate
      and open children relative to directory handles, reject reparse points and
      named streams, and never copy source ACLs or hard-link topology. Use
      volume-GUID paths for destination containment checks. Bound entry count,
      copied bytes and depth; check cancellation/deadlines between OS operations.
      Report errors and remove partial copies. Exclude `.git` directories and
      worktree pointer files explicitly, recording their relative paths.
- [x] Bind source workspace/cwd, execution copy/cwd, execution mode and capture
      summary into immutable `CommandWorkspace` metadata. `SnapshotCommand`
      owns the prepared copy; `run_snapshot` keeps it alive through approval and
      dispatch. A cloned context cannot be used through the ordinary `run`
      entry point. Snapshot execution always requires fresh approval, even for
      an ordinary `allow` decision, and requires explicit full `SnapshotWorkspace`
      support in addition to filesystem/network capabilities. Policy, approval
      and backend receive the same mapping; disposal follows backend-future
      cleanup, while completed dispatch returns owned, unpublished artifacts.
- [ ] Add the native LPAC execution primitive (implemented; awaiting review):
      `WindowsSandboxBackend::run_diagnostic` consumes an owned snapshot and
      accepts only native PowerShell 7, confined profiles and denied network.
      Share token/transport primitives with the opt-in probe, pin and validate
      copy objects before ACL grants, atomically assign suspended processes to
      a Job, verify token state before resume, and supervise bounded output,
      concurrency, timeout, cancellation and descendant cleanup. This explicit
      host diagnostic bypasses approval and must never become a model/tool
      entry point. Automatic dispatch continues to reject partial process-tree,
      filesystem and network capabilities; no unconfined fallback exists.
- [ ] Fence Job admission before shutdown enumeration (implemented; awaiting
      review). Preserve the current extended limits, including kill-on-close,
      and set the active-process limit to one before pinning members. An
      existing creator already occupies that slot; no new host work is assigned
      to this private Job. Even if fencing or enumeration fails, still request
      termination and report failure rather than returning successful cleanup.
      Keep process-tree enforcement `Partial` until broader lifecycle acceptance.
- [ ] Establish an enforced write boundary rather than additive path grants.
      September 11 probes reproduce writes to an outside source file carrying an
      `ALL RESTRICTED APPLICATION PACKAGES` write ACE, including under a requested
      read-only LPAC profile. The tested native SBOX and PSEC contracts also permit that
      ambient write until the source is explicitly denied. Neither result
      satisfies global read-only/workspace-write enforcement. This blocks U5
      acceptance and production dispatch; do not promote capabilities to bypass it.
- [ ] Verify PSEC ancestor-denial precedence and read-only exceptions
      (implemented; awaiting review). Fixed cmdlets run successfully with the
      tested volume denied and explicit copy/system grants, separating access
      checks from production bootstrap compatibility. However, a read-only path
      exception reopens ambient ARAP writes under that path, including outside
      the copy. Preserve the positive controls and actual-content counterexamples;
      this composition still cannot justify full read-only/workspace-write support.
- [ ] Add bounded `WorkspaceSnapshot::inspect_changes` (implemented; awaiting
      review). Capture an owned, immutable relative-path inventory and SHA-256
      hashes of bytes actually copied. Report sorted additions, modifications
      and deletions, including empty directories and type replacements, without
      reading or writing the source. Reject reparse points, hard-linked files,
      named streams, new `.git` controls and special names. Pin inspected objects,
      recheck observable changes, and fail without a partial report on exhausted
      entry/byte/depth/time limits or cancellation. This is not a publication
      approval, source-freshness check, transactional snapshot or sandbox claim.
- [ ] Add `WorkspaceSnapshot::check_source_conflicts` (implemented; awaiting
      review). Bind the captured source root's volume-qualified 128-bit file ID
      and volume-GUID path. Check affected source contents, ancestors and direct
      children of removed/replaced directories against the copy-time baseline.
      Report missing/existing targets, content/type/path changes and new
      descendants; reject unsafe entries and encompassed Git controls. Share
      copy/source read budgets and deadline. Do not read unrelated source data,
      write either tree or treat an empty conflict list as publication authority.
- [ ] Add approved artifact publication with atomic source baseline/stale checks and
      protected-path rejection; never auto-write back. The copy is not a Git
      worktree. Absolute paths in scripts/environment are not rewritten; missing
      or excluded cwd, extra host roots and snapshot `danger-full-access` are
      refused rather than silently mapped to a different authority.
- [ ] Fail closed when approval or sandbox support is unavailable.

**Acceptance:** Read-only inspection works; workspace mutation and network access
are denied unless explicitly permitted. The PowerShell adapter alone does not
satisfy this acceptance criterion: U5 remains incomplete and the real
`run_command` handler remains unavailable until policy and OS enforcement exist.
Policy evaluates the original script and final launch context, not merely its
base64 transport. AppContainer versus restricted-token/ACL enforcement remains a
backend decision, independent of the native PowerShell shell choice.
The authorization gate is covered with deterministic fake backend/responder tests,
but has no production enforcing backend and is not wired to the real tool handler.
Its immutable snapshot binds values, not filesystem object identity across time;
the native backend must enforce path boundaries against concurrent replacement,
consume the frozen environment without re-inheritance, and own process cleanup.

**Native feasibility observations (September 10, 2026, this Windows host):**

- Both installed PowerShell versions completed the native unconfined controls
  and ordinary AppContainer probes. Ordinary AppContainer denied writes to the
  read-only and outside-private fixtures, but permitted the outside fixture
  explicitly writable by `ALL APPLICATION PACKAGES`.
- PowerShell 7 completed LPAC with the explicit non-network capabilities
  `registryRead` and `lpacInstrumentation`. This configuration also denied the
  shared-package fixture and returned socket access-denied errors for both IPv4
  loopback probes; the host receivers observed neither connection nor datagram.
  These observations do not establish external-network, IPv6 or descendant
  network isolation.
- Granting write permission on a hard-link alias changed the file reachable
  through the outside path in both AppContainer and supported LPAC. This is a
  fixture-only demonstration of object-based ACL semantics, not a safe
  workspace-write implementation. LPAC is a candidate for further work, not an
  accepted full-enforcement backend.
- Zero-capability LPAC did not complete the scripts. Windows PowerShell 5.1 also
  did not complete with the two support capabilities. Startup errors/timeouts
  remain inconclusive rather than being counted as successful access denials.
- This host rejected `GetTokenInformation(TokenIsLessPrivilegedAppContainer)`
  with error 87. The report preserves that query gap; LPAC was requested through
  the documented process attribute and its shared-package behavior was measured.
  Native PowerShell 5.1 also required conventional local-drive path spelling in
  this probe's `CreateProcessW` transport; verbatim path spelling failed its
  unconfined initialization. The probe rejects unusual/long paths instead of
  changing their semantics. Native diagnostic execution now shares this
  transport without widening its supported path spellings.

The native mechanism follows Microsoft's
[AppContainer launch documentation](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)
and [process-attribute contract](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
No Windows user account, firewall rule, loopback exemption or workspace ACL was
changed. The opt-in example creates a randomly named AppContainer profile and
grants ACLs only inside its newly created temporary fixture.

**Isolated-copy experiment (September 10, 2026):** the focused
`cargo run -p kqode-core --example windows_sandbox_probe -- --snapshot-only`
path captures a temporary source fixture, then grants a fresh LPAC identity
access only to the copy. On this host, PowerShell 7 modified the copied alias
without changing either its copied peer or the original outside file; a direct
write to the original was rejected with access denied. Both the copy and the
temporary profile were removed. The copy preparation itself makes no source ACL
changes and is independently tested against junction replacement, existing-file
overwrite, named streams, limits, cancellation and private initial permissions.
This resolves the demonstrated pre-existing hard-link alias problem for the
copy path, not all filesystem isolation questions. It is not a transactional
filesystem snapshot, cannot interrupt an already blocked synchronous OS call,
and does not establish complete host/network confinement or safe publication.
U5 and the production `run_command` handler remain incomplete.

The snapshot command gate is verified with deterministic backend/responder tests;
no enforcing production backend is enabled by the new capability contract. Normal
failure cleanup is awaited on a blocking worker and retains the primary error if
cleanup also fails. Dropping a future uses the existing synchronous cleanup
fallback; adapters should await graceful cancellation for large copies.

**Native execution milestone (September 10, 2026):** the diagnostic backend now
uses private named pipes and the existing independent per-stream head/tail
capture limits, reporting exact omitted byte counts. Fresh profiles are removed
after Job termination and explicit joins for the root and pinned descendants;
dropping the future also terminates the Job before disposing the copy. Job
activity reaching zero was observed before descendant handles became signaled;
cleanup pins current members before termination and waits on those handles.
The admission-fence follow-up below limits further creation before enumeration;
`ProcessTree` remains `Partial` pending broader lifecycle acceptance for members
already exiting and process creation in flight when the fence is installed.
Completed execution, including
nonzero exits and supervised cancellation/timeouts, returns owned artifacts for
explicit inspection/disposal; infrastructure failures dispose the copy and
preserve cleanup errors. Setup and bounded kill/join still use synchronous Win32
calls and must run on a runtime worker, not a UI thread.

The initial six opt-in native tests passed on this host: Unicode/frozen environment/nonzero
exit; bounded dual-stream output; read-only and copy-write/source-denial behavior;
continuous-output timeout; actual descendant termination on exit, cancellation
and future drop; and cancellation while waiting for the concurrency permit.
Ordinary tests additionally reject hardlinks/junctions injected into a captured
copy before granting access, preserve their source targets, and enforce preflight
entry limits/cancellation. Both focused probe modes still complete.

This milestone establishes the native lifecycle primitive, not U5 acceptance.
Process-tree, read-only filesystem, workspace-write filesystem, protected paths and denied
network remain `Partial`; the LPAC token-query gap is still reported. Global
filesystem/network confinement, new aliases created during execution, safe
artifact publication and production PowerShell syntax policy remain unresolved.
The automatic sandbox gate still refuses this backend and real `run_command`
remains unavailable.

**Admission-fence follow-up (September 10, 2026):** a deterministic native
fixture first launches two children successfully, then installs the fence while
all three known processes remain alive. A subsequent launch fails with
`ERROR_NOT_ENOUGH_QUOTA`; the known processes are still alive until explicit
termination and handle joins. Assertions correlate their actual PIDs rather than
assuming that Windows creates no additional helper processes.

A second fixture runs two concurrent spawners, each replacing short-lived leaves
sequentially with a bounded total of 24 launches. After both have replaced a leaf,
normal exit, cancellation, timeout and future drop each stop the pinned spawners
and dispose the owned copy without changing source data. All eight opt-in native
tests pass on this host. This exercises concurrent creation but does not prove
that every already-exiting or in-flight process handle has been joined.
No capability is promoted and no production tool is enabled.

The fence uses Microsoft's documented
[active-process limit](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)
and preserves existing settings using the query/modify/set pattern described by
[SetInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-setinformationjobobject).

**Isolation-boundary findings (September 11, 2026):**

- The LPAC fixture denies source writes with ordinary private permissions, then
  permits them after an explicit `S-1-15-2-2` write grant on that same fresh
  fixture file. Both requested `ReadOnly` and `WorkspaceWrite` profiles reproduce
  the outside mutation. The regression asserts the file's actual contents, not
  just a command exit code. Passing this counterexample test is evidence of a
  limitation, not successful U5 isolation.
- Native network probes now cover TCP and UDP over IPv4 and IPv6 loopback in
  the parent and a PID-distinct PowerShell child. Each case has fresh receivers
  and an unconfined positive control. LPAC reports socket access denial and the
  receivers observe no traffic; UDP's local send result alone is not counted as
  delivery. These checks do not establish external-network or arbitrary
  protocol/broker isolation, so `DenyNetwork` remains `Partial`.
- A write-restricted token alternative was investigated without changing host
  desktop/window-station permissions. Using the package SID as the restricting
  SID failed with Win32 87. A fresh ordinary restricting SID was accepted, but
  PowerShell exited with `0xc0000142` before executing the script, even after
  handle-based grants for that SID on the owned copy. This experiment is not
  shipped as a backend; startup failure is not classified as access denial.
- This host reports build `26200.9445`. Its system `processmodel.dll` exports
  both PSEC and experimental SBOX entry points; `Experimental_QuerySandboxSupport`
  succeeds with mask `0x7`. Export presence and capability bits are not sufficient
  acceptance evidence.
- The retained opt-in SBOX probe uses schema version `0.1.0`, preserves the
  explicit environment, starts suspended, assigns the process to the owned Job
  before resume, and checks token state and actual file effects. The tested
  extended-startup form returned Win32 50; the plain startup form works. It can
  write inside the copy, but outside ARAP-writable files remain writable without
  an explicit source deny. Adding that deny protects the source while keeping
  copy writes functional. Additional exploratory volume-wide read-only grants
  did not remove the outside write; a drive-root deny prevented the existing
  PowerShell transport/script from completing, with constrained-language errors.
  These observations do not prove that all possible SBOX/PSEC configurations
  are insufficient; they do mean the tested configurations cannot be promoted.
- The two-phase PSEC 1.0 contract was also exercised using
  `CreateProcessSecurityEnvironment`, then the security-environment startup
  attribute on `CreateProcessW`, with atomic Job assignment, an explicit handle
  list and the frozen environment. It reproduces the same additive-grant
  counterexample: the outside ARAP-writable file changes with grants alone;
  explicit source denial protects it while copy writes remain functional.
  The environment is closed after process/Job cleanup. This is a test-only
  probe, not a production backend or a capability promotion.

The SBOX/PSEC probes are test-only and use FlatBuffers as a Windows dev dependency.
Its wire slots and ABI are based on Microsoft's
[BaseContainer schema](https://github.com/microsoft/mxc/blob/main/external/windows-sdk/BaseContainerSpecification.fbs)
and [native runner](https://github.com/microsoft/mxc/blob/main/src/backends/appcontainer/common/src/base_container_runner.rs),
plus the [PSEC schema](https://github.com/microsoft/mxc/blob/main/external/windows-sdk/ProcessSecurityEnvironment.fbs)
and [two-phase ABI](https://github.com/microsoft/mxc/blob/main/src/backends/learning_mode/windows/src/secenv.rs).
No production sandbox fallback or model-facing execution path was added.
The initial failed restricted-token prototype is retained in session artifacts.
The follow-up below adds a separately labelled compatibility counterexample,
not a production restricted-token backend.

Reproduce the focused evidence with:

```text
cargo test -p kqode-core native_lpac_shared_restricted -- --ignored --test-threads=1
cargo test -p kqode-core native_lpac_dual_stack -- --ignored --test-threads=1
cargo test -p kqode-core native_sbox_additive -- --ignored --test-threads=1
cargo test -p kqode-core native_psec_additive -- --ignored --test-threads=1
```

U5 remains blocked on an effective filesystem enforcement design. The production
execution entry point, artifact inspection/publication and syntax policy remain
unfinished; the diagnostic APIs must not substitute for them.

**Restricted-token/private-desktop follow-up (September 11, 2026):**

- A new low-integrity private desktop did not by itself fix `0xc0000142`.
  Creating a uniquely named private window station returned access denied under
  ordinary privileges; an unnamed create-only request returned already-exists
  and was not allowed to adopt the existing station. The user authorized exactly
  one elevated fixed-test run. That run created the separate station/desktop,
  but the original startup probe still exited with `0xc0000142`. Its log is in
  session artifacts. No persistent elevation, service installation, default
  desktop ACL changes or further elevated runs were authorized or performed.
- The prototype's token default DACL was then completed for newly created
  objects, both before lowbox derivation and on the suspended child token.
  Under ordinary privileges this progressed startup to a concrete
  `BCrypt.dll` initialization failure in PowerShell/.NET, rather than successful
  script execution. The child token was checked to retain the fresh restricting
  SID; the restriction was not simply lost during lowbox creation.
- Adding `Everyone` to the restricting SID list was tested only as an explicitly
  unsafe compatibility control. PowerShell could execute fixed permitted
  cmdlets, but constrained-language mode rejected the production bootstrap.
  The retained test uses a separate raw encoded command with explicit paths;
  it does not bypass execution policy or claim compatibility with the approval
  context/production transport. A TEMP-targeted exploratory command reported
  the profile's `AC\Temp` path instead of the intended copy scratch location;
  the cause of that mapping was not established.
- The counterexample keeps an outside fixture writable to ARAP, then compares
  absence/presence of an additional `Everyone` write ACE. Copy writes succeed
  in both cases; the outside write is denied without the extra ACE and succeeds
  with it. Actual file contents and process status are asserted. This shows why
  adding a broad compatibility SID is not a fix for strict workspace-write.
  Only fresh fixture files, private token defaults and newly created desktop
  objects are modified. All helper modules remain test-only.

```text
cargo test -p kqode-core native_restricted_compatibility -- --ignored --test-threads=1
```

The desktop/station helpers restore the **test process/thread** associations
before returning to async work; they are not suitable as in-process Tauri UI
helpers. Named station creation follows the privilege constraints documented by
[CreateWindowStationW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowstationw).
The measured tradeoff also matches the explicitly partial design described in
[DeepSeek Harness's restricted-token note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.md).
No capability is promoted, and U5 remains incomplete.

**Owned artifact inspection (September 11, 2026):**

The copy-time content inventory is private to `WorkspaceSnapshot`; changing the
source, inspecting repeatedly or restoring a copied file does not reset it.
Inspection returns typed `SnapshotChange`/`SnapshotEntry` data, not file contents.
Same-length edits with restored modification times are detected by content hash.
Renames, including case-only renames, appear as addition/deletion; no rename
inference or ACL/timestamp diff is attempted. Excluded source `.git` entries are
not mistaken for deleted artifacts, and new copy-side Git controls are rejected.

The inspector validates the owned root location and reopens it with file identity
and volume-GUID-path checks before enumeration. Separate opens give independent
multi-page directory cursors. Children are opened handle-relative without ordinary
write/delete sharing and retained until final metadata/stream/link checks.
`ReOpenFile` returned access denied in this environment; the implementation uses
the existing identity-checked path-reopen pattern rather than dropping identity
verification. Entry limits cover the baseline/current path union, so removals
cannot produce an unbounded report; byte limits apply to current default-stream
data read. All copy writers and descendants must already be stopped. These are
cooperative limits and observable-change checks, not a transactional seal of
directory entries or an authorization to publish after handles are released.
Publication must separately check current source freshness, protected targets,
approval and conflicts. Production dispatch and all partial capabilities remain
unchanged.

**Source conflict preflight (September 12, 2026):**

`check_source_conflicts` produces an informational `SnapshotSourceCheck` containing
the copy changes and sorted source conflicts. An unchanged copy does not open the
source. Otherwise, the root must still have its captured object identity and
location, even if a replacement directory contains identical bytes. Existing file
contents are compared against the original SHA-256 baseline; source file
ACLs/timestamps and same-content file replacement are not baseline differences.

Source traversal opens one normal component at a time relative to a verified
directory handle, using native case-insensitive lookup and checking the resulting
canonical spelling. It does not silently accept a case alias as an absent target.
Only missing-name/path NTSTATUS values become absence; sharing, access and other
I/O errors abort without a partial report. Opened targets and ancestors remain
pinned through final metadata/stream/link checks. New children of destructively
changed directories are conflicts without reading their contents. Captured
excluded Git descendants and newly observed Git controls prevent parent
publication. Children under a planned new directory or file-to-directory
replacement are covered by that parent's source check, not incorrectly treated as
independent conflicts against the old file.

Copy hashing and source checks share one byte budget and deadline. The entry
budget counts copy entries, source component opens and source directory visits;
the baseline/copy union remains bounded separately by the same entry limit.
These are observations, not a transactional seal or name reservation. Copy writers
must be stopped beforehand. Publication still needs proposal-level alias handling,
protected-target policy, fresh approval, serialization and atomic revalidation
against current source state. Neither tree is written; production dispatch,
capability levels and U5's unresolved strict-isolation acceptance are unchanged.

**PSEC deny-all/exception follow-up (September 12, 2026):**

The fixed-cmdlet probe tests no denial, source-directory denial, fixture-ancestor
denial and volume-root denial. Copy reads/writes complete in all four cases;
the outside ARAP-writable source changes only with no denial. This is stronger
evidence than the previous production-bootstrap attempt: startup/CLM errors
had not proved that the OS rejected every deny-root/grant-child composition.
The raw encoded command is explicitly test-only and is not the approved
production transport or an execution-policy bypass.

Further controls still reject this composition as a strict write boundary:

- With the volume denied and the copy granted **read-only**, a private copy
  rejects edits and creates. Adding an inheritable ARAP modify ACE to the fresh
  copy permits both operations under the same PSEC configuration.
- With the volume denied and only the copy granted read/write, the outside
  fixture remains unchanged. Adding the outside source to **read-only** grants
  permits writing its ARAP-modifiable file. Exit status, exact operation markers
  and actual file contents are checked. Thus the issue is not confined to
  metadata KQode can strip from its own disposable copy.
- An exploratory `New-Item -ItemType HardLink` script failed at link creation
  even without a volume denial. That run is inconclusive for alias enforcement
  and is not counted as an isolation success.

The retained PSEC tests share a bounded, suspended/Job-assigned runner that checks
token state before resume, terminates the Job and explicitly joins the root before
closing the security environment. Truncated output is rejected. Only newly created
fixture/copy ACEs are changed; native PSEC policy is used directly, without a
host-DACL fallback. No capability is promoted and production dispatch stays closed.

Read-only prerequisite inspection on this host reports Hyper-V and
VirtualMachinePlatform enabled, and a hypervisor present. Windows Sandbox's
optional feature is disabled; neither `wsb.exe` nor `WindowsSandbox.exe` is
available. No system feature was enabled, no restart was requested, and the earlier
one-off elevated experiment does not authorize a new setup operation. A stronger
Windows virtualization route requires an explicit architecture/setup decision.

**Native-account preparation (September 12, 2026):**

The user selected the Codex-style native approach after the six-repository
comparison, rather than enabling the Windows Sandbox optional feature. KQode
implements its own account preparation primitive; reference agent code is not
copied, executed or installed.

`WindowsSandboxAccountPlan::provision_disabled` is a synchronous trusted-helper
API, not a tool or a self-elevating command. It rejects non-elevated callers and
domain-controller hosts, uses local-only NetAPI calls, and creates one new
installation-specific group plus two new `USER_PRIV_USER` accounts with
`UF_ACCOUNTDISABLE`. Offline/online are intended roles, not installed network
guarantees. No logon rights, filesystem grants, firewall rules, enabled accounts
or model execution are introduced by this unit.

Passwords are independently generated with BCrypt, memory-redacted/zeroized, and
machine-DPAPI encrypted with installation/role binding before the journal begins.
Machine protection does not replace a private journal DACL: ciphertext must never
be exposed to sandbox users, logs or frontend IPC. The host-provided journal
contract requires create-new private storage and durable intent/result writes.
Cancellation after a successful mutation still permits its ownership receipt to
be recorded before stopping. Missing records, name collisions, changed SIDs or
non-disabled/nonordinary account observations require explicit recovery; there is
no automatic adoption, password reset, account enablement or deletion.

`PrivateSandboxAccountJournal` now supplies the concrete first-write-only file
adapter. Its trusted caller supplies a securely opened, stable local parent
outside sandbox-writable trees; the writer validates a non-reparse directory,
volume-GUID resolution and persistent ACL support. Single-component
handle-relative creates prevent child-path redirection and reject existing
installation names. New directory/file DACLs are protected and grant only the
current process user and SYSTEM. Creation refuses thread impersonation so the
descriptor principal cannot silently differ from the effective creator.

The versioned JSONL header contains the immutable plan and protected passwords;
subsequent records carry strictly increasing sequence numbers and the exact
intent/receipt order through `PreparedDisabled`. Each complete record, including
its newline, is at most 64 KiB and requires successful write, flush and file
`sync_all` before acknowledgment. A partial write, flush failure, invalid order,
or identity mismatch permanently poisons that writer. Handles stay owned until
drop; drop closes them without deleting partial recovery evidence. This provides
OS-reported file durability, not an independently tested power-loss guarantee or
permission to assume a missing/torn journal means no SAM mutation happened.

`PrivateSandboxAccountJournal::inspect` now loads existing state read-only through
the same trusted-parent boundary. It requires protected process-user/SYSTEM DACLs
on both directory and file; the owner must be that user, SYSTEM, or Administrators
(the possible default owner for an elevated creator). It rejects impersonation,
ordinary concurrent writers, reparse targets, named streams and multiply linked
files. It checks these object properties again after reading and returns no
lasting lock or mutation lease.

Inspection permits at most twelve newline-terminated records and 768 KiB total.
Private deserialization DTOs reject unknown/duplicate fields and preserve the
public plan's generated-name-only construction invariant. Header version,
expected installation, exact sequence/order, canonical local-account SID syntax
and receipt-set consistency are required. Password envelopes must decode with
the expected installation/role entropy and match the generated-password format;
decrypted output is zeroized without being returned. Neither this check nor the
private DACL is a cryptographic attestation of journal history or live SAM state.

The non-secret result distinguishes `Incomplete` from
`PreparedDisabledRecorded`, with recorded SID receipts and any creation or
membership intent lacking its receipt. Such an intent has an unknown native
outcome. An incomplete prefix without a pending intent does not prove no later
mutation occurred. Empty, torn or invalid state is an error, never a silently
accepted prefix. The reader does not restore passwords, enable/delete/adopt
accounts, append/repair records or automatically resume setup.

The trusted-parent selection boundary, live SAM reconciliation and explicit
recovery protocol, authenticated privileged helper, logon-right restrictions, ACL/network setup,
and readiness activation are still pending. Account workflow tests use fake SAM
operations with real private temporary journal files and non-elevated RNG/DPAPI.
No system account or group has been created; ACLs are set only on newly owned
temporary journal fixtures, not existing host objects. No firewall or Windows
feature configuration has been changed. `PreparedDisabled` is not U5 completion;
production dispatch and existing partial capability reports remain unchanged.

### U6. Implement the first real tools

- [ ] Bind safe handlers for `run_command`, `fetch_web_url`, and `ask_user`.
- [ ] Enable production automatic tool choice only for accepted exposure snapshots.
- [ ] Add SSRF, redirect, response-size, interaction, and pause/resume tests.
- [ ] Add shell mutation observation.

**Acceptance:** A real Provider can complete a bounded task with each tool, and
headless missing-input/approval paths never hang.

### U7. Implement the headless one-shot CLI

- [ ] Add `kqode run`.
- [ ] Emit machine-readable outcome and JSONL trace.
- [ ] Run one real Provider task outside Tauri.

**Acceptance:** The same runtime behavior and event order are observed through
desktop and CLI adapters.

### U8. Run the ACP compatibility spike

- [ ] Pin compatible ACP SDK, Harbor, Paseo, and protocol versions.
- [ ] Run echo-agent diagnostics in Harbor and Paseo.
- [ ] Update the ACP contract and capabilities in this plan from observed results.

**Acceptance:** Both clients can initialize, create a session, send a prompt,
receive updates, and cancel the disposable echo agent.

### U9. Implement the ACP server

- [ ] Add `kqode acp`.
- [ ] Map ACP lifecycle calls to `AgentRuntime`.
- [ ] Map runtime events to ACP updates without changing runtime semantics.
- [ ] Add subprocess protocol tests.

**Acceptance:** Initialization, isolated sessions, sequential prompts,
cancellation, malformed requests, protocol-only stdout, and EOF shutdown pass.

### U10. Add Harbor and Paseo adapters

- [ ] Add local Harbor distribution and Paseo generic provider configuration.
- [ ] Validate native and external traces.
- [ ] Run the Golden Set and interactive Paseo flows.

**Acceptance:** Harbor records real KQode tool events and Paseo completes command,
web, interaction, denial, and cancellation flows.

### U11. Add VFS and `apply_patch`

- [ ] Add path authorization, stale detection, staged diff, approval, mutation
      serialization, and atomic single-file publication.
- [ ] Distinguish `vfs_staged`, `vfs_applied`, and `shell_observed`.

**Acceptance:** Valid patches are reviewable and stale or escaping patches fail
without overwriting user changes.

---

## Validation Matrix

| Area | Deterministic validation |
|---|---|
| Provider protocol | Native tool parsing, malformed arguments, result serialization, text plus tools |
| Registry | Duplicate names, hidden tools, immutable snapshot, handler binding |
| Ledger | Duplicate IDs, name mismatch, result-before-call, duplicate settlement |
| Loop | Continuation, mixed failures, final text, empty response nudge, finalization |
| Budgets | Per-round, total calls, model requests, elapsed time, repeated signatures |
| Cancellation | Provider, validation, handler, interaction, process, result commit |
| Paths | Relative cwd, absolute workspace cwd, traversal, symlink/junction escape |
| Policy | Allow, ask, deny, parser failure, pipelines, redirection, destructive commands |
| Sandbox | Read-only, workspace-write, protected paths, outside writes, network denial |
| Process | Success, nonzero exit, spawn error, timeout, output cap, descendant cleanup |
| Web | Invalid scheme, private address, redirect-to-private, oversized body |
| Interaction | Answer, closed choice, cancellation, unsupported responder, deadline |
| Trace | Stable IDs, event order, redaction, one final outcome |
| Headless CLI | Configuration, exit codes, JSON result, JSONL trace, no desktop dependency |
| ACP | Negotiation, isolation, updates, cancellation, malformed input, stdout purity, EOF |
| Harbor/Paseo | Launch, diagnostics, canonical events, trajectory, permissions, elicitation |

Repository validation:

```text
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

- [ ] Use focused tests while iterating.
- [ ] Run the complete repository validation before each milestone is accepted.
- [ ] Run real Provider, Harbor, or Paseo tests only when credentials and external
      services are explicitly available.

---

## Completion Criteria

- [ ] One provider-neutral runtime serves desktop, direct CLI, and ACP.
- [ ] A deterministic fake Provider proves the complete tool-call loop.
- [ ] Runtime budgets and cancellation prevent unbounded or abandoned work.
- [ ] Every accepted tool call has one correlated terminal result.
- [ ] Production tools are never exposed without accepted safety dependencies.
- [ ] `run_command` executes only through policy, approval, sandbox, supervision,
      and bounded output.
- [ ] `fetch_web_url` rejects restricted destinations and returns bounded content.
- [ ] `ask_user` pauses and resumes durably and fails closed without a responder.
- [ ] Headless execution does not require Tauri or desktop SQLite state.
- [ ] ACP remains a thin protocol adapter and advertises only implemented features.
- [ ] Harbor and Paseo observe the same canonical names, call IDs, outcomes, and
      runtime events.
- [ ] Native JSONL trace remains replayable truth; external trajectories are derived
      views.
- [ ] Future VFS changes remain distinct from shell-observed mutations.

---

## Research Baselines

- Tool-loop comparison:
  `docs/research/2026-09-06-tool-loop-v1-2-reference-design.md`.
- Tool and sandbox research:
  `docs/research/2026-09-05-run-command-sandbox-vfs.md`.
- Evaluation research:
  `docs/research/2026-09-06-agent-evaluation-benchmarks.md`.
- Harbor evidence baseline:
  `harbor-framework/harbor@c29f416af4b02ef593d6874f88b59d38bf164646`.
- Paseo evidence baseline:
  `getpaseo/paseo@78b285059f6ebd0b257c98bd191df4626721270a`.
- ACP evidence baseline:
  `agentclientprotocol/agent-client-protocol@b4eddcd86937c972e65240e5199403f6d8a8cc2c`.

The evidence SHAs preserve the basis for this plan. U8 must resolve and pin the
versions actually used for implementation and compatibility testing.
