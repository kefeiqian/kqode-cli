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
- [ ] Implement `allow | ask | deny`, read-only and workspace-write profiles, and
      independent network policy.
- [ ] Fail closed when approval or sandbox support is unavailable.

**Acceptance:** Read-only inspection works; workspace mutation and network access
are denied unless explicitly permitted. The PowerShell adapter alone does not
satisfy this acceptance criterion: U5 remains incomplete and the real
`run_command` handler remains unavailable until policy and OS enforcement exist.
Policy evaluates the original script and final launch context, not merely its
base64 transport. AppContainer versus restricted-token/ACL enforcement remains a
backend decision, independent of the native PowerShell shell choice.

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
