---
title: "feat: Build the first tool registry and sandboxed command loop"
type: feat
date: 2026-09-05
origin:
  - docs/research/2026-09-05-initial-tool-registry.md
  - docs/research/2026-09-05-agent-completion-semantics.md
  - docs/research/2026-09-05-run-command-sandbox-vfs.md
---

# feat: Build the First Tool Registry and Sandboxed Command Loop

## Summary

Build KQode's first model-facing tool loop around three tools:

```text
run_command
fetch_web_url
ask_user
```

The first implementation follows Codex's small-tool-surface direction while keeping KQode's own safety boundary explicit:

- [ ] `run_command` executes only through a KQode-owned process supervisor, policy decision, and real sandbox backend.
- [ ] `fetch_web_url` remains a dedicated audited network-read tool instead of relying on shell commands such as `curl`.
- [ ] `ask_user` pauses and resumes the agent loop through the protocol/UI boundary rather than subprocess stdin.
- [ ] The main agent finishes naturally when the model returns a final assistant response with no pending tool calls; `complete_task` is not part of the first model-facing registry.
- [ ] VFS and `apply_patch` are a later implementation unit; shell-originated writes are never described as VFS-staged changes.

---

## Problem Frame

KQode needs a small first tool set that proves the complete agent loop without prematurely implementing every specialized file, search, web, process, and editing tool.

A general command tool can already perform local discovery:

```text
read file     -> shell command
list files    -> shell command
find paths    -> rg --files
search text   -> rg
inspect Git   -> git status / git diff
build/test    -> project commands
```

However, `run_command` is also the broadest and most dangerous tool. A plain `Command::spawn` wrapper would expose the invoking user's filesystem, network, environment, child processes, and credentials. The first tool loop therefore requires process isolation and policy before command execution becomes model-callable.

An application-level VFS does not solve this problem. Native child processes call operating-system filesystem APIs directly and can bypass KQode file abstractions through shell redirection, Git, compilers, formatters, scripts, child processes, symlinks, junctions, and absolute paths. VFS remains valuable for KQode-owned file operations such as the later `apply_patch` tool.

---

## Scope

### Included

- [ ] Add a provider-neutral tool registry with typed schemas, handlers, exposure, effect metadata, and a stable per-step snapshot.
- [ ] Normalize native provider tool calls and future text-fallback calls into one internal invocation shape.
- [ ] Add a shared tool-result envelope that separates execution success from agent-loop continuation.
- [ ] Implement a foreground, one-shot, noninteractive `run_command`.
- [ ] Implement workspace/cwd normalization and command policy.
- [ ] Implement at least one enforceable sandbox backend for the first supported platform.
- [ ] Implement timeout, cancellation, descendant-process cleanup, environment filtering, and bounded output.
- [ ] Keep filesystem and network permissions independent.
- [ ] Implement `fetch_web_url` with SSRF protections and bounded content conversion.
- [ ] Implement `ask_user` as a pause/resume state transition.
- [ ] Record model calls, tool calls, policy decisions, sandbox facts, outputs, and loop outcomes in trace events.
- [ ] Observe shell-originated workspace mutations without claiming they passed through VFS.

### Deferred

- [ ] Defer PTY, interactive stdin, `write_stdin`, background jobs, persistent shells, and server/watch-process management.
- [ ] Defer dedicated `read_file`, `list_directory`, `glob`, and `grep` until real failures show that shell-based discovery is insufficient.
- [ ] Defer provider-hosted `web_search`; keep it as a future provider capability rather than a host tool.
- [ ] Defer browser automation, arbitrary HTTP request methods, cookies, authenticated browser state, and JavaScript execution.
- [ ] Defer MCP, plugins, deferred tool discovery, subagents, todo tools, and workflow tools.
- [ ] Defer model-facing `complete_task` for the main agent; reconsider it for bounded subagents or strict structured-output workers.
- [ ] Defer full cross-platform sandbox parity; each unsupported backend must fail visibly rather than silently running unsandboxed.

---

## Key Decisions

### Tool surface

- [ ] The first directly exposed tools are exactly `run_command`, `fetch_web_url`, and `ask_user`.
- [ ] `run_command` is named independently of Bash, PowerShell, cmd.exe, or a future remote executor.
- [ ] `fetch_web_url` accepts known HTTP(S) URLs only and is not an alias for web search or browser automation.
- [ ] `ask_user` is a loop-control interaction tool whose execution waits for an explicit user response.
- [ ] A final assistant response with no tool calls ends the current turn and produces an internal typed lifecycle outcome.

### Sandbox and approval

- [ ] Approval authorizes intent; it does not automatically disable sandboxing.
- [ ] Every command runs with an explicit filesystem mode and network mode.
- [ ] Filesystem modes are `read-only`, `workspace-write`, and `danger-full-access`.
- [ ] Network modes are independent and initially limited to `deny` and an explicitly approved wider mode.
- [ ] `danger-full-access` is never the implicit default.
- [ ] Missing approval UI or noninteractive execution fails closed when a fresh approval is required.
- [ ] Sandbox unavailability is returned as an explicit unsupported/unsandboxed state and never represented as successful sandbox enforcement.

### VFS boundary

- [ ] VFS is not required to execute `run_command`.
- [ ] VFS is the controlled file-operation layer for future `read_file` and `apply_patch` handlers.
- [ ] Shell writes directly affect the sandbox-visible filesystem and are not routed through VFS.
- [ ] Shell mutation reporting is based on bounded post-command observation, such as Git status/diff or filesystem snapshots.
- [ ] Mutation provenance distinguishes `shell_observed` from future `vfs_staged` and `vfs_applied` changes.

---

## High-Level Architecture

```text
Provider response
  -> normalized AgentAction
     -> ToolCall
        -> ToolExposureSnapshot lookup
        -> input schema validation
        -> policy evaluation
        -> approval if required
        -> tool handler
        -> ToolResult
        -> trace
        -> next model step

run_command
  -> CommandPolicy
  -> SandboxPolicy
  -> ProcessSupervisor
  -> SandboxBackend
  -> OS process tree
  -> bounded stdout/stderr

fetch_web_url
  -> NetworkPolicy
  -> SafeHttpClient
  -> DNS/address validation
  -> redirect validation
  -> bounded body conversion

ask_user
  -> InteractionService
  -> protocol event
  -> desktop/CLI/headless behavior
  -> persisted response
```

Future file mutation path:

```text
apply_patch
  -> FilePolicy
  -> VFS
  -> version/stale check
  -> staged diff
  -> approval
  -> atomic publish where possible
```

---

## Incremental Product Path

### V1. Read-only agent tools

- [ ] Expose exactly `exec_command`, `web_fetch`, and `ask_user_question`.
- [ ] Run `exec_command` as a foreground, one-shot, noninteractive process without a PTY, background job, persistent stdin, or session ID.
- [ ] Enforce the `read-only` filesystem profile and deny shell network access.
- [ ] Support repository inspection through shell commands that cover `read_file`, `list_directory`, `glob`, and `grep`.
- [ ] Allow read-only Git inspection such as `git status`, `git diff`, `git log`, and `git show`.
- [ ] Block redirection, file mutation, destructive Git commands, package installation, formatters, code generation, and build/test commands that write into the workspace.
- [ ] Keep `web_fetch` as the only controlled network-read path.
- [ ] Let `ask_user_question` pause the agent loop and wait for a durable user response.

### V2. Workspace-write command execution

- [ ] Add the `workspace-write` filesystem profile while preserving network denial as an independent default.
- [ ] Allow build, test, lint, formatter, package-manager, and code-generation commands inside approved workspace roots.
- [ ] Add `allow | ask | deny` classification for mutating, destructive, ambiguous, and workspace-external commands.
- [ ] Add bounded post-command mutation observation without claiming that shell writes passed through VFS.
- [ ] Preserve `danger-full-access` as an explicit escalation rather than an automatic retry.

### V3. VFS and safe patching

- [ ] Add `apply_patch` as the first dedicated file-mutation tool.
- [ ] Route `apply_patch` through workspace path normalization, stale/version checks, staged diffs, approval, same-file serialization, and atomic publication where possible.
- [ ] Distinguish `vfs_staged` and `vfs_applied` mutations from `shell_observed` mutations.
- [ ] Keep native shell writes under OS sandbox enforcement rather than claiming that an application-level VFS can intercept them.

### V4. Interactive and long-running processes

- [ ] Add PTY-backed command execution only after foreground process supervision is stable.
- [ ] Add session IDs, persistent stdin, and a dedicated continuation/input tool.
- [ ] Add background jobs with bounded job registries, output collection, cancellation, and process-tree cleanup.
- [ ] Preserve the same policy, sandbox, environment, network, output, trace, and headless fail-closed rules for interactive and background processes.

---

## Core Contracts

### Tool definition

```text
ToolDefinition
  name
  display_name
  description
  input_schema
  effects
  exposure
  supports_parallel
  limits
  source
```

- [ ] Tool names are stable, unique, model-facing snake_case identifiers.
- [ ] The first exposure states are `direct` and `hidden`; reserve `deferred` without implementing discovery.
- [ ] Effects distinguish at least process execution, network read, user interaction, and internal loop control.
- [ ] Provider request serialization and tool-call routing use the same immutable per-step exposure snapshot.
- [ ] Duplicate registration fails instead of silently replacing a handler.

### Tool invocation

```text
ToolInvocation
  call_id
  name
  arguments
  session_id
  turn_id
  step_id
```

- [ ] Arguments are validated before policy evaluation or handler execution.
- [ ] Unknown and hidden tools return typed recoverable errors.
- [ ] Each invocation has a stable call ID used by provider results, protocol events, approvals, and trace records.

### Tool result

```text
ToolResult
  success
  should_continue
  summary
  content
  error_kind?
  display?
  metadata?
```

- [ ] Tool failure normally keeps `should_continue: true` so the model can recover.
- [ ] `ask_user` pauses the active turn rather than representing a failed tool.
- [ ] Normal task completion is an internal turn outcome, not a tool result.
- [ ] Metadata supports duration, truncation, returned bytes, policy decision ID, sandbox facts, and mutation observation.

---

## `run_command` Contract

### Input

```text
command: string
cwd?: string = "."
timeout_ms?: integer
```

### Output

```text
exit_code?: integer
signal?: string
timed_out: boolean
cancelled: boolean
stdout: string
stderr: string
truncated: boolean
omitted_bytes: integer
duration_ms: integer
sandbox_mode: string
network_mode: string
mutation_observation?: object
```

### First-version behavior

- [ ] Execute one foreground noninteractive process and wait for completion.
- [ ] Use plain pipes; do not allocate a PTY.
- [ ] Resolve `cwd` relative to the selected workspace and reject path escape.
- [ ] Apply a finite default timeout and a hard maximum.
- [ ] Support cooperative cancellation and forced process-tree termination.
- [ ] Capture stdout and stderr separately.
- [ ] Enforce an internal byte cap and a smaller model-facing token/character cap.
- [ ] Optionally spill bounded full output to a controlled KQode artifact path.
- [ ] Return nonzero exit status as an execution result rather than an infrastructure exception.
- [ ] Treat spawn failure, timeout, cancellation, sandbox failure, and policy denial as distinct typed outcomes.

---

## Command Policy

### Policy result

```text
allow
ask
deny
```

- [ ] Evaluate policy before process launch.
- [ ] Bind approvals to command, canonical cwd, filesystem mode, network mode, environment profile, and requested extra roots.
- [ ] Keep approval decisions separate from sandbox selection.
- [ ] Allow reusable approvals only for visible, narrowly scoped command prefixes.
- [ ] Record the matched rule and reason in trace output.

### Initial command analysis

- [ ] Parse common command chaining operators: `&&`, `||`, `;`, and pipelines.
- [ ] Evaluate every parsed segment; one denied segment denies the complete command.
- [ ] Treat parser failure conservatively as `ask` or `deny`.
- [ ] Treat shell redirection as at least `ask`.
- [ ] Ask or deny workspace-external paths.
- [ ] Detect a small first set of destructive operations such as recursive deletion, destructive Git reset/clean, permission changes, service/process control, and disk/device commands.
- [ ] Do not attempt to prove arbitrary shell commands safe through an exhaustive parser in the first version.

---

## Sandbox Profiles

### `read-only`

- [ ] Allow workspace reads and approved executable/library reads.
- [ ] Block workspace source writes and writes outside explicitly writable temp/output roots.
- [ ] Deny network by default.
- [ ] Use this profile for explain, ask, and plan behavior.

### `workspace-write`

- [ ] Allow writes only under canonical configured workspace/write roots.
- [ ] Keep protected metadata and instruction/configuration paths read-only where the backend supports carve-outs.
- [ ] Deny network independently by default.
- [ ] Use this profile for supervised coding, build, test, formatter, package-manager, and code-generation commands.
- [ ] Require policy approval for destructive or ambiguous mutations even when the sandbox technically permits them.

### `danger-full-access`

- [ ] Require an explicit fresh approval or explicit user-selected mode.
- [ ] Never infer it from a filesystem denial alone.
- [ ] Preserve independent network policy.
- [ ] Reject the request in headless mode when approval is unavailable.

---

## Process Supervisor

- [ ] Represent process ownership independently from the shell implementation.
- [ ] On Unix, launch in an owned process group/session and terminate the group.
- [ ] On Windows, use a Job Object or equivalent tree-owned mechanism rather than killing only the root PID.
- [ ] Close stdin immediately in the first version.
- [ ] Drain stdout and stderr without deadlock.
- [ ] Enforce timeout even when the process produces continuous output.
- [ ] Bound concurrent command count per session.
- [ ] Clean up all owned processes when the session is cancelled or disposed.
- [ ] Persist enough lifecycle facts for trace and diagnostics without implementing process resume.

---

## Environment Policy

- [ ] Construct the child environment explicitly rather than blindly inheriting the host environment.
- [ ] Start with a conservative base required for shell and common development tools.
- [ ] Remove secret-like variables and known credential variables unless explicitly allowed.
- [ ] Set noninteractive Git and package-manager controls where appropriate.
- [ ] Prevent the model from passing arbitrary environment values in the first tool schema.
- [ ] Record the environment policy/profile ID, not secret values, in traces.

---

## `fetch_web_url` Contract

### Input

```text
url: string
format?: "text" | "markdown" = "markdown"
max_bytes?: integer
```

### Output

```text
final_url
status
content_type
text
truncated
redirects
duration_ms
```

- [ ] Allow HTTP(S) only.
- [ ] Resolve DNS and reject loopback, private, link-local, metadata-service, and otherwise restricted destinations.
- [ ] Revalidate every redirect.
- [ ] Bound redirect count, connection/read timeout, streamed bytes, converted characters, and model-facing output.
- [ ] Avoid ambient cookies, credentials, authorization headers, and secret-bearing proxy configuration.
- [ ] Reject unsupported content types with a typed error.
- [ ] Convert supported HTML to bounded Markdown or text.
- [ ] Keep `fetch_web_url` approval independent from arbitrary shell networking.

---

## `ask_user` Contract

### Input

```text
questions:
  - id
    question
    header?
    options?
    multi_select?
```

### Output

```text
answers:
  - id
    selected[]
    custom?
```

- [ ] Emit a protocol event that the desktop app can render.
- [ ] Persist the pending question before waiting.
- [ ] Resume the exact tool call when the user answers.
- [ ] Support cancellation while waiting.
- [ ] In headless mode, return a typed unavailable/denied result instead of waiting indefinitely.
- [ ] Keep question IDs stable for trace and replay.

---

## Shell Mutation Observation

- [ ] Capture a bounded baseline before commands classified as potentially mutating.
- [ ] Prefer Git status/diff for Git worktrees.
- [ ] Include tracked modifications, deletions, and untracked files.
- [ ] Use metadata-only records for binary or oversized files.
- [ ] Mark changes as `shell_observed`, not `vfs_applied`.
- [ ] Return `mutation_state_unknown` when observation fails or exceeds its budget.
- [ ] Do not claim attribution when pre-existing user changes cannot be distinguished from command changes.

---

## Future VFS and `apply_patch`

VFS is a controlled workspace file service, not a process sandbox.

- [ ] Normalize and authorize paths against configured workspace roots.
- [ ] Record read hashes or versions.
- [ ] Reject stale patches when a file changed after observation.
- [ ] Parse and validate affected paths before approval.
- [ ] Stage the proposed changes and generate a diff.
- [ ] Serialize mutations to the same canonical file.
- [ ] Publish a single-file update atomically where supported.
- [ ] Report possible partial effects for multi-file failure.
- [ ] Preserve mutation provenance as `vfs_staged`, `vfs_applied`, `vfs_rejected`, or `vfs_conflict`.
- [ ] Optionally intercept a precisely recognized KQode `apply_patch` shell invocation and route it through the same dedicated handler.
- [ ] Never attempt to intercept all arbitrary shell writes as though they used VFS.

---

## Implementation Units

Each unit is one commit-sized change. After each commit, run code review on that unit and pause for explicit user approval before starting the next unit.

### U1. Tool registry and normalized loop contract

- [ ] **Goal:** Add provider-neutral tool definitions, registration, schema validation, invocation routing, result normalization, and per-step exposure snapshots.
- [ ] **Dependencies:** Existing provider streaming/chat loop.
- [ ] **Primary areas:** Rust core tool modules, provider request serialization, protocol event types, fake-provider tests.
- [ ] **Acceptance:** A fake provider can receive a fixed tool schema, call a fake tool, receive a typed result, and then finish with a normal assistant response.
- [ ] **Acceptance:** Unknown, hidden, duplicate, and invalid-argument tool calls produce deterministic typed errors.
- [ ] **Acceptance:** Same-step retries reuse the same exposure snapshot.

### U2. Workspace policy and process supervisor

- [ ] **Goal:** Add canonical workspace/cwd resolution, process ownership, timeout, cancellation, output capture, environment policy, and tree cleanup without yet exposing `run_command` to the model.
- [ ] **Dependencies:** U1.
- [ ] **Primary areas:** Focused Rust modules for workspace paths, environment construction, process lifecycle, output retention, and platform process-tree termination.
- [ ] **Acceptance:** A deterministic test proves cwd escape is rejected.
- [ ] **Acceptance:** A timeout and cancellation terminate descendants.
- [ ] **Acceptance:** stdout/stderr truncation returns omitted-byte metadata.
- [ ] **Acceptance:** secret-like environment variables are absent from the child.

### U3. Sandbox backend and command policy

- [ ] **Goal:** Add one enforceable first-platform sandbox backend plus `allow | ask | deny` command policy.
- [ ] **Dependencies:** U2.
- [ ] **Primary areas:** Sandbox profile types, platform backend, command analysis, policy rules, approval protocol, trace events.
- [ ] **Acceptance:** Read-only mode permits search/read commands and blocks workspace mutation.
- [ ] **Acceptance:** Workspace-write permits workspace outputs but blocks outside writes.
- [ ] **Acceptance:** Network remains denied independently of filesystem mode.
- [ ] **Acceptance:** Headless approval-required execution fails closed.
- [ ] **Acceptance:** Missing sandbox support is surfaced explicitly and never silently treated as enforced.

### U4. First model-facing tools

- [ ] **Goal:** Register and expose `run_command`, `fetch_web_url`, and `ask_user`.
- [ ] **Dependencies:** U1-U3.
- [ ] **Primary areas:** Tool handlers, provider schema exposure, safe HTTP client, interaction service, desktop/protocol integration.
- [ ] **Acceptance:** The fake provider can inspect a repository through `run_command`, fetch a public documentation URL, ask one question, resume, and produce a final response.
- [ ] **Acceptance:** URL redirects to private addresses are rejected.
- [ ] **Acceptance:** `ask_user` in headless mode returns a typed unavailable result.
- [ ] **Acceptance:** Final assistant text with no tool calls ends the turn without `complete_task`.

### U5. Mutation observation

- [ ] **Goal:** Report shell-originated workspace changes without claiming VFS attribution.
- [ ] **Dependencies:** U4.
- [ ] **Primary areas:** Git status/diff adapter, bounded non-Git snapshot fallback, tool-result metadata, final summary.
- [ ] **Acceptance:** A command that changes a tracked file reports an observed diff.
- [ ] **Acceptance:** Untracked and deleted files appear in the observation.
- [ ] **Acceptance:** Pre-existing dirty changes are not incorrectly attributed to the command.
- [ ] **Acceptance:** Observation failure returns `mutation_state_unknown` while preserving the command result.

### U6. VFS and `apply_patch`

- [ ] **Goal:** Add the first precise file-mutation path with stale checks, staged diff, approval, and atomic single-file publication.
- [ ] **Dependencies:** U1, U3, U5.
- [ ] **Primary areas:** Focused VFS modules, patch parser, diff generation, file policy, mutation locks, trace events.
- [ ] **Acceptance:** A valid patch is staged, reviewed, and applied.
- [ ] **Acceptance:** A stale file rejects the patch without overwriting external changes.
- [ ] **Acceptance:** Workspace escape and protected-path mutation are denied.
- [ ] **Acceptance:** Same-file concurrent patches are serialized.
- [ ] **Acceptance:** Failure never returns a success-shaped result and reports possible partial effects.

---

## Validation Matrix

| Area | Deterministic validation |
|---|---|
| Registry | Schema serialization, duplicate names, hidden tools, snapshot consistency |
| Loop | Tool call → result → continuation; final text → turn completion |
| Paths | Relative cwd, absolute workspace cwd, traversal, symlink/junction escape |
| Policy | Allow, ask, deny, parser failure, pipelines, redirection, destructive commands |
| Sandbox | Read-only, workspace-write, outside writes, protected paths, network denial |
| Process | Success, nonzero exit, spawn error, timeout, cancellation, descendant cleanup |
| Output | Empty, stdout/stderr, UTF-8 boundary, oversized output, spill metadata |
| Environment | Required variables present; secret-like variables absent |
| Web | HTTPS success, invalid scheme, private IP, DNS-to-private, redirect-to-private, oversized body |
| Ask user | Answer, free text, cancellation, headless unavailable |
| Mutation observation | Tracked, untracked, deleted, dirty baseline, observation failure |
| VFS | Stale patch, conflicting patch, atomic single-file publish, partial multi-file failure |

---

## Delivery Order

```text
U1 Tool registry
  -> U2 Process supervisor
  -> U3 Sandbox and command policy
  -> U4 First three tools
  -> U5 Mutation observation
  -> U6 VFS and apply_patch
```

- [ ] Do not expose `run_command` before U3 provides an enforceable backend for the target environment.
- [ ] Do not advertise safe editing before U6.
- [ ] Do not begin PTY/background work until the foreground supervisor is proven stable.
- [ ] Do not begin additional tools until the first three tools have traceable eval results.

---

## Completion Criteria

- [ ] KQode can run a fake-provider and real-provider tool loop with the same registry contract.
- [ ] `run_command` executes only through policy, approval, sandbox, process supervision, and bounded output.
- [ ] Read-only and workspace-write modes have deterministic enforcement tests.
- [ ] Filesystem permission and network permission are independent.
- [ ] Headless mode never hangs waiting for approval or user input.
- [ ] `fetch_web_url` blocks SSRF and returns bounded text/Markdown.
- [ ] `ask_user` pauses and resumes through durable protocol state.
- [ ] The main turn ends naturally on a no-tool final assistant response.
- [ ] Shell changes are reported as observed mutations, not VFS changes.
- [ ] `apply_patch` eventually provides staged, stale-safe, reviewable file mutation.
- [ ] Every meaningful tool, policy, sandbox, approval, mutation, and completion transition is present in the trace.

---

## Research Basis

- `docs/research/2026-09-05-initial-tool-registry.md`
- `docs/research/2026-09-05-agent-completion-semantics.md`
- `docs/research/2026-09-05-run-command-sandbox-vfs.md`
- `docs/research/2026-09-04-first-tool-payload.md`
