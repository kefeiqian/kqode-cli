---
title: "feat: Expose KQode to Harbor and Paseo through ACP"
type: feat
date: 2026-09-06
origin:
  - docs/plans/2026-09-05-001-feat-first-tool-registry-sandbox-plan.md
  - docs/research/2026-09-06-agent-evaluation-benchmarks.md
  - evaluation/golden/README.md
---

# feat: Expose KQode to Harbor and Paseo through ACP

## Summary

Build one reusable Rust agent runtime and expose it through an Agent Client Protocol
(ACP) stdio server so both Harbor and Paseo can launch and control KQode.

```text
Harbor generic ACP adapter ─┐
                            ├─> kqode-cli acp
Paseo generic ACP provider ─┘       |
                                    v
                            shared AgentRuntime
                              -> provider
                              -> agent loop
                              -> tools and policy
                              -> trace/session events
```

- [ ] Keep Harbor- and Paseo-specific code as thin launch/configuration adapters.
- [ ] Put the agent loop, tool execution, policy, cancellation, and trace semantics in
      a platform-neutral Rust runtime.
- [ ] Add a non-Tauri headless CLI before adding the ACP transport.
- [ ] Implement the stable ACP v1 lifecycle over JSON-RPC stdio.
- [ ] Run the Harbor Golden Set through the real KQode ACP process rather than an
      Oracle or framework-owned loop.
- [ ] Keep the same runtime semantics across desktop, headless CLI, Harbor, and
      Paseo.

---

## Problem Frame

KQode cannot currently be integrated with Harbor by adding only a Python wrapper:

- [ ] The only product executable starts Tauri.
- [ ] Provider requests expose descriptive tool metadata but disable tool choice.
- [ ] Provider responses are reduced to assistant text and do not preserve native
      tool calls.
- [ ] The tool registry does not bind argument schemas to executable handlers.
- [ ] There is no provider-neutral multi-step agent loop.
- [ ] There is no headless interaction, approval, cancellation, or trace contract
      suitable for an evaluation harness.

Harbor supports a custom installed-agent API, but implementing the KQode loop in a
Harbor Python adapter would duplicate runtime behavior and would not help Paseo.
Both systems already support ACP agents over stdio, so ACP is the shared
interoperability boundary.

---

## Goals

- [ ] Run KQode without Tauri or desktop SQLite state.
- [ ] Execute the first three model-facing tools through real handlers and policy.
- [ ] Support native provider tool calls and tool-result feedback.
- [ ] Provide deterministic lifecycle outcomes, limits, cancellation, and trace
      evidence.
- [ ] Let Harbor install and launch a KQode ACP binary inside a task environment.
- [ ] Let Paseo launch the same binary as a generic ACP provider.
- [ ] Preserve a direct headless CLI for debugging, automation, and non-ACP callers.
- [ ] Make the 25 Harbor-native Golden tasks executable against KQode itself.

## Non-Goals

- [ ] Do not implement separate Harbor and Paseo agent loops.
- [ ] Do not move the core runtime into a Python adapter.
- [ ] Do not require Tauri, a desktop window, or desktop database access in Harbor.
- [ ] Do not implement ACP v2 draft features in the first release.
- [ ] Do not implement ACP session listing, resume, deletion, or forking in the first
      release.
- [ ] Do not delegate KQode filesystem or terminal operations to the ACP client in
      the first release.
- [ ] Do not inject Paseo MCP servers until KQode has an explicit MCP session
      contract.
- [ ] Do not publish an ACP registry entry before local Harbor and Paseo
      compatibility tests pass.

---

## Dependency on the First Tool Plan

This plan depends on
`docs/plans/2026-09-05-001-feat-first-tool-registry-sandbox-plan.md`.
That plan owns the detailed tool, sandbox, process-supervision, approval, and
agent-loop safety contracts.

This ACP plan owns:

- [ ] extracting those contracts into a runtime that is independent of Tauri;
- [ ] adding headless process configuration and lifecycle behavior;
- [ ] translating runtime events to and from ACP;
- [ ] packaging and launching KQode from Harbor and Paseo;
- [ ] validating the real KQode runtime with the Golden Set.

ACP must not bypass or weaken the policy and sandbox decisions in the first tool
plan.

---

## Canonical Tool Names

Use the user-facing names already adopted by the Golden Set and the first tool
plan:

```text
run_command
fetch_web_url
ask_user
```

- [ ] Rename or normalize the current internal names `exec_command`, `web_fetch`,
      and `ask_user_question` at the runtime boundary.
- [ ] Use the canonical names in provider schemas, ACP tool updates, KQode traces,
      Harbor verifier events, and user-facing output.
- [ ] Keep Rust module and implementation type names internal; they must not create
      a second externally observable naming scheme.
- [ ] Update Golden verifier normalization only where needed to consume the
      canonical KQode event shape.

---

## Target Architecture

Use focused workspace crates with the repository root as a virtual Cargo
workspace:

```text
crates/
  kqode-core/
    provider-neutral runtime
    normalized model steps
    tool contracts and handlers
    policy and interaction ports
    cancellation and budgets
    trace events

  kqode-provider/
    provider identity and configuration
    provider request/response adapters
    HTTP, streaming, and Copilot integrations

  kqode-desktop/
    Tauri application and SQLite adapters
    desktop protocol bridge
    React/Vite frontend under frontend/

  kqode-cli/
    kqode-cli run
    kqode-cli acp
    CLI/environment configuration
    ACP transport adapter
```

- [ ] `kqode-core` must not depend on Tauri.
- [ ] `kqode-cli` must not require desktop system libraries.
- [ ] The `kqode-desktop` crate must consume the same `AgentRuntime`.
- [ ] Provider-specific request and response formats must remain behind provider
      adapters.
- [ ] ACP-specific types must remain at the `kqode-cli` transport boundary.
- [ ] Runtime state must be isolated per session.

---

## Runtime Contracts

### Model step

Replace the text-only completion contract with a normalized model step:

```text
ModelStep
  assistant_content
  tool_calls[]
  finish_reason
  usage
  provider_metadata
```

- [ ] Preserve provider tool-call IDs and validated JSON arguments.
- [ ] Support assistant text and tool calls in the same model step.
- [ ] Translate tool results back into each provider's native message format.
- [ ] Keep malformed tool arguments as typed model/protocol errors.
- [ ] Enable automatic tool choice only when the runtime exposes tools for the
      current step.

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
  success
  should_continue
  summary
  content
  error_kind?
  display?
  metadata
```

- [ ] Bind each tool definition to a JSON schema and executable handler.
- [ ] Validate arguments before policy evaluation or execution.
- [ ] Separate execution success from agent-loop continuation.
- [ ] Record policy, approval, execution, output, and mutation evidence.
- [ ] Return unknown, hidden, or malformed tool calls as typed recoverable errors
      where the provider can self-correct.

### Turn outcome

```text
TurnOutcome
  completed
  blocked
  cancelled
  budget_exceeded
  failed
```

- [ ] A final assistant response with no pending tool call completes the turn.
- [ ] A missing approval or user response in unattended mode blocks the turn.
- [ ] Cancellation stops the model operation and any active process tree.
- [ ] Budget exhaustion is distinct from provider or tool failure.
- [ ] Every outcome has a machine-readable summary and durable trace event.

### Budgets

- [ ] Limit model steps per turn.
- [ ] Limit tool calls per turn.
- [ ] Limit elapsed runtime.
- [ ] Preserve provider token and cost usage when available.
- [ ] Allow stricter Harbor job limits without changing runtime code.

---

## First-Scope Tool Behavior

### `run_command`

- [ ] Implement foreground, one-shot, noninteractive execution.
- [ ] Normalize the workspace root and command cwd.
- [ ] Use the read-only policy profile for the first Golden Set integration.
- [ ] Support current-directory inspection, directory listing, glob/file
      discovery, grep, file reads, file metadata, read-only Git, and read-only
      environment checks.
- [ ] Reject redirection, workspace mutation, destructive Git, package
      installation, formatters, code generation, and commands classified as
      writing.
- [ ] Deny shell network access; network reads use `fetch_web_url`.
- [ ] Enforce timeout, bounded output, cancellation, and descendant-process
      cleanup.

### `fetch_web_url`

- [ ] Accept HTTP(S) URLs only.
- [ ] Enforce the network policy, redirect validation, SSRF controls, response-size
      limits, and bounded content conversion from the first tool plan.
- [ ] Work with Harbor Compose sidecars without requiring public Internet access.
- [ ] Record the requested URL, effective URL, status, content metadata, and policy
      result without logging credentials.

### `ask_user`

- [ ] Represent a question as a durable runtime pause rather than subprocess stdin.
- [ ] Support free-text questions and closed-choice confirmations.
- [ ] Route desktop questions through the existing UI/protocol boundary.
- [ ] Route ACP free-text questions through elicitation when the client advertises
      support.
- [ ] Route risk approval through ACP permission requests, not generic
      elicitation.
- [ ] Fail closed when no responder exists.
- [ ] Allow an explicit deterministic evaluation responder for Golden tasks.

---

## Headless CLI

Add a dedicated binary with two commands:

```text
kqode-cli run
kqode-cli acp
```

### `kqode-cli run`

- [ ] Accept the instruction, workspace, provider, model, limits, interaction mode,
      and trace path through explicit flags and environment variables.
- [ ] Read provider credentials from standard environment variables or an explicit
      headless config file.
- [ ] Do not read Tauri-managed desktop SQLite state in Harbor.
- [ ] Emit a machine-readable final result.
- [ ] Emit append-only JSONL trace events.
- [ ] Reserve nonzero exit codes for blocked, cancelled, budget, configuration, and
      execution failures.
- [ ] Never turn an approval or missing-input condition into implicit consent.

### `kqode-cli acp`

- [ ] Run a long-lived ACP server over stdin/stdout.
- [ ] Reserve stdout exclusively for protocol frames.
- [ ] Route diagnostics to stderr and configured trace files.
- [ ] Keep credentials and environment values out of protocol logs.
- [ ] Support `--version` without starting the ACP transport.

---

## ACP v1 Mapping

Use the official Rust `agent-client-protocol` crate rather than maintaining local
copies of protocol types.

### `initialize`

- [ ] Negotiate a supported ACP v1 protocol version.
- [ ] Return KQode implementation name and version.
- [ ] Advertise only implemented client/agent capabilities.
- [ ] Return the available model and session-mode metadata required by Paseo.
- [ ] Do not advertise resume, MCP, client filesystem delegation, or client
      terminal delegation in V1.

### `session/new`

- [ ] Validate and normalize the requested workspace cwd.
- [ ] Resolve provider and model configuration.
- [ ] Create isolated runtime, cancellation, interaction, budget, and trace state.
- [ ] Reject unsupported MCP server injection with an explicit protocol error.
- [ ] Return the selected mode/model and available alternatives.

### `session/prompt`

- [ ] Translate ACP prompt content into a core user turn.
- [ ] Stream assistant text through ACP session updates.
- [ ] Stream tool-call start, progress, result, and failure updates.
- [ ] Preserve one runtime turn until completion, blocking, cancellation, budget
      exhaustion, or failure.
- [ ] Translate the final runtime outcome to the corresponding ACP stop reason.

### `session/cancel`

- [ ] Connect ACP cancellation to the core cancellation token.
- [ ] Cancel active provider requests where supported.
- [ ] Terminate the active command process tree.
- [ ] Emit a final cancellation trace event once.
- [ ] Make repeated cancellation idempotent.

### Interaction

- [ ] Use `session/request_permission` for policy approvals.
- [ ] Use ACP elicitation for missing free-text user input when negotiated.
- [ ] Use permission choices only for closed-choice confirmation that is genuinely
      an approval decision.
- [ ] Treat client disconnect, unsupported interaction, or no response as a
      fail-closed blocked outcome.

---

## Harbor Integration

Use Harbor's generic ACP agent rather than implementing the KQode loop in
`BaseInstalledAgent`.

### Local development

- [ ] Add a local ACP registry entry or launcher that installs a locally built
      `kqode-cli` binary into the task environment.
- [ ] Keep the launch command `kqode-cli acp`.
- [ ] Pass provider credentials and KQode configuration through explicit Harbor
      agent environment settings.
- [ ] Keep installation logic outside individual Golden tasks.

### Released agent

- [ ] Add an ACP registry entry with KQode ID, version, repository, license, release
      archives, platform commands, and SHA-256 checksums.
- [ ] Publish at least a Linux x86_64 archive for Harbor execution.
- [ ] Make installation noninteractive.
- [ ] Pin the tested release in evaluation documentation.
- [ ] Prepare a GitHub-hosted ACP-compatible source for Hosted Harbor after local
      compatibility is proven.

### Evaluation artifacts

- [ ] Preserve Harbor's ACP event stream and ATIF trajectory.
- [ ] Preserve KQode's native JSONL trace.
- [ ] Produce normalized `/logs/agent/tool-events.jsonl` records consumed by the
      Golden verifiers.
- [ ] Include canonical tool name, call ID, arguments summary, success, timing, and
      error kind.
- [ ] Do not fabricate tool events from final answer text.

---

## Paseo Integration

Provide a generic ACP provider example:

```json
{
  "extends": "acp",
  "label": "KQode",
  "command": ["kqode-cli", "acp"],
  "params": {
    "supportsMcpServers": false,
    "clientCapabilities": {
      "fs": {
        "readTextFile": false,
        "writeTextFile": false
      },
      "terminal": false
    }
  }
}
```

- [ ] Let KQode execute its own filesystem and terminal tools in V1.
- [ ] Keep MCP injection disabled until KQode implements MCP session wiring.
- [ ] Return models and modes dynamically from the running ACP process.
- [ ] Pass Paseo diagnostics for binary resolution, version, `initialize`,
      `session/new`, model discovery, and mode discovery.
- [ ] Verify streamed assistant text, tool states, cancellation, permission
      requests, and elicitation.
- [ ] Keep Auto Accept behavior limited to explicit ACP permission requests.

---

## Trace and Session Semantics

- [ ] Define one provider-neutral event enum shared by desktop, CLI, and ACP.
- [ ] Record session, turn, step, model call, tool call, policy, interaction,
      cancellation, usage, and outcome identifiers.
- [ ] Write append-only JSONL as replayable truth.
- [ ] Treat SQLite as an index rather than the only source of session truth.
- [ ] Translate runtime events to ACP updates without losing the native trace.
- [ ] Redact secrets and bounded sensitive output before persistence.
- [ ] Keep Harbor trajectory generation independent from task verifier logic.

---

## Implementation Units

Each unit is one reviewable commit. After completing and reviewing a unit, pause
for explicit approval before beginning the next unit.

### Unit 1: Runtime crate boundary

- [ ] Add `kqode-core` and `kqode-cli` workspace crates.
- [ ] Move reusable LLM/provider types behind a non-Tauri interface.
- [ ] Add runtime configuration ports for desktop and headless callers.
- [ ] Preserve current desktop behavior.

### Unit 2: Tool contracts and handlers

- [ ] Add typed schemas, handler binding, invocation, result, policy, and
      interaction contracts.
- [ ] Implement the first three tools using the safety plan.
- [ ] Normalize canonical tool names.

### Unit 3: Provider-neutral agent loop

- [ ] Parse provider-native tool calls.
- [ ] Execute tool calls and feed results back to providers.
- [ ] Add outcomes, budgets, cancellation, and trace events.
- [ ] Prove the loop with a deterministic fake provider.

### Unit 4: Headless one-shot CLI

- [ ] Implement `kqode-cli run`.
- [ ] Add environment/flag configuration and machine-readable results.
- [ ] Validate one real provider without the desktop.

### Unit 5: ACP server

- [ ] Implement `initialize`, `session/new`, `session/prompt`, and
      `session/cancel`.
- [ ] Add streaming updates, permissions, elicitation, modes, and models.
- [ ] Add protocol-level tests using an in-process ACP client.

### Unit 6: Harbor adapter assets

- [ ] Add local and release registry entries.
- [ ] Add tool-event and trace artifact integration.
- [ ] Document local and hosted execution paths.

### Unit 7: Paseo provider assets

- [ ] Add example generic ACP configuration.
- [ ] Validate diagnostics and interactive flows.
- [ ] Document local binary selection and environment configuration.

### Unit 8: Golden Set execution

- [ ] Run all 25 tasks through the real KQode ACP process.
- [ ] Diagnose failures by runtime, provider, tool, or verifier category.
- [ ] Keep Oracle at 25/25 and NOP at 0/25.
- [ ] Record the KQode baseline without weakening verifiers to improve the score.

### Unit 9: Release packaging

- [ ] Publish versioned archives and checksums.
- [ ] Validate clean installation in a Harbor task image.
- [ ] Validate the same binary with Paseo.
- [ ] Submit or publish the ACP registry entry after compatibility passes.

---

## Validation

### Unit tests

- [ ] Provider tool-call parsing and result serialization.
- [ ] Tool argument schema validation.
- [ ] Agent-loop continuation and natural completion.
- [ ] Read-only command classification.
- [ ] Timeout, cancellation, and child-process cleanup.
- [ ] User-input and approval fail-closed behavior.
- [ ] Trace ordering and redaction.

### ACP protocol tests

- [ ] Version negotiation and capability advertisement.
- [ ] Session creation and isolation.
- [ ] Prompt streaming and stop reasons.
- [ ] Tool-call lifecycle updates.
- [ ] Permission selection and rejection.
- [ ] Elicitation response and unsupported-client behavior.
- [ ] Cancellation during provider and command execution.
- [ ] Unknown session, malformed request, and client disconnect behavior.

### Harbor acceptance

- [ ] Harbor can install and launch the KQode ACP binary.
- [ ] Harbor records a valid ACP/ATIF trajectory.
- [ ] Golden verifiers observe real canonical KQode tool events.
- [ ] All 25 tasks execute without framework adapter changes per task.
- [ ] Results render in `harbor view`.

### Paseo acceptance

- [ ] Generic ACP diagnostics pass.
- [ ] Paseo creates a KQode session and discovers models/modes.
- [ ] One `run_command` flow completes.
- [ ] One `fetch_web_url` flow completes.
- [ ] One `ask_user` flow pauses and resumes.
- [ ] Cancellation and permission denial terminate cleanly.

### Repository checks

```text
cargo test --workspace
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

- [ ] Use focused crate/test selectors while iterating.
- [ ] Run all repository checks before the final integration unit is accepted.

---

## Risks and Mitigations

### Runtime extraction breaks desktop behavior

- [ ] Keep desktop storage and UI adapters in the root application.
- [ ] Move one cohesive dependency layer per commit.
- [ ] Add runtime contract tests before rewiring desktop commands.

### Provider tool-call formats diverge

- [ ] Normalize every provider into one internal `ModelStep`.
- [ ] Keep provider-specific IDs and metadata for round trips.
- [ ] Validate each provider adapter independently.

### ACP clients expose different capabilities

- [ ] Negotiate capabilities during `initialize`.
- [ ] Advertise only implemented features.
- [ ] Keep KQode-owned tool execution as the V1 baseline.
- [ ] Fail closed instead of silently changing execution location.

### Interactive Golden tasks hang

- [ ] Give every turn and interaction a deadline.
- [ ] Use an explicit deterministic evaluation responder.
- [ ] Return a typed blocked outcome when no response is available.

### Harbor and KQode traces drift

- [ ] Generate both from the same runtime event stream.
- [ ] Keep canonical tool names and call IDs stable.
- [ ] Test event normalization separately from task correctness.

### Dirty worktree causes accidental overwrites

- [ ] Inspect touched files before every implementation unit.
- [ ] Never revert unrelated user changes.
- [ ] Keep each commit scoped to files owned by that unit.

---

## Research Baselines

The integration research used these pinned revisions:

- [ ] Harbor:
      `harbor-framework/harbor@c29f416af4b02ef593d6874f88b59d38bf164646`.
- [ ] Paseo:
      `getpaseo/paseo@78b285059f6ebd0b257c98bd191df4626721270a`.
- [ ] ACP:
      `agentclientprotocol/agent-client-protocol@b4eddcd86937c972e65240e5199403f6d8a8cc2c`.

Resolve and pin current compatible dependency and registry versions when
implementation begins. The pinned revisions above preserve the evidence used to
make this plan; they are not a promise to use stale package versions.
