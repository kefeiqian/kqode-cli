# KQode Build Path

## Build objective

Build KQode as a Rust-first coding-agent harness with a TypeScript TUI. The first public proof is a local terminal agent that modifies its own codebase safely, shows a diff, runs checks, records a trace, and can resume or replay the session.

## Architecture path

```text
TypeScript Ink TUI
  -> JSON-RPC or JSONL protocol
Rust kqode daemon / CLI
  -> agent loop
  -> provider adapter
  -> tool registry
  -> VFS and sandbox
  -> session store and trace log
  -> eval runner
```

Ink is the committed TUI framework. The Rust core must still run headless without the TUI for automation, tests, replay, and non-interactive CLI workflows.

## Milestones

### M0. Project foundation

**Goal:** Create a repo that can grow without early rewrites.

**Build:**
- Rust workspace with crates for core, cli, protocol, provider, tools, vfs, sandbox, session, policy, and eval.
- TypeScript workspace for the Ink TUI and protocol client.
- Shared protocol schema generated from Rust or maintained as JSON Schema.
- Basic CI for Rust format/test and TypeScript typecheck/test.

**Covers:** R1-R3, R8, R73-R84.

**Done when:** `kqode --version`, `kqode run "hello"`, and the TUI shell start successfully.

### M1. Headless agent loop

**Goal:** Make KQode useful without UI polish.

**Build:**
- Provider adapter for the first LLM access path.
- Message model with system, user, assistant, tool call, tool result, and completion events.
- Tool registry with typed input, typed output, error shape, and continuation signal.
- Core tools: read, list, search, shell, ask-user, complete-task.
- Turn, step, and cost budgets.

**Covers:** R4-R19, R25-R27.

**Done when:** `kqode run "explain this repo"` can inspect files, search, ask a question if needed, and finish with a completion summary.

### M2. VFS, patch, and git loop

**Goal:** Make safe code edits the center of the product.

**Build:**
- Workspace-root path normalization.
- VFS staging area for proposed file writes and patches.
- Diff generation before apply.
- Conflict detection using file hash or modification time.
- Patch application with full failure reporting.
- Git diff/status integration.

**Covers:** R20-R24, R42-R46, R52.

**Done when:** KQode can change one file, show a diff, apply after approval, run `git diff`, and summarize the result.

### M3. Permissions and sandbox-lite

**Goal:** Prevent the agent from becoming an unsafe shell wrapper.

**Build:**
- Permission modes: read-only, plan-only, supervised, auto, full-access-style.
- Per-tool allow, deny, ask rules.
- Policy engine for path, command, network, and cost decisions.
- Sandbox-lite for shell: cwd restriction, timeout, env scrub, network gate, output capture.
- Non-TTY fail-closed behavior for actions needing approval.

**Covers:** R42-R52, R109-R110.

**Done when:** risky edits and shell commands require approval, out-of-workspace paths are blocked, and a denied tool call returns recoverable context to the agent.

### M4. Session store, trace, resume, and replay

**Goal:** Make every useful session inspectable and resumable.

**Build:**
- Append-only JSONL event log per session.
- SQLite index for sessions, tasks, todos, costs, and trace metadata.
- Checkpoint snapshots for long sessions.
- Resume from prior session.
- Replay trace into a read-only inspector.
- Debug ZIP and Markdown export.

**Covers:** R53-R63, R137-R140.

**Done when:** killing and restarting KQode can resume a session without double-applying completed file edits.

### M5. First TUI

**Goal:** Make the product feel like a real coding agent.

**Build:**
- TypeScript Ink TUI connected to Rust over JSON-RPC/JSONL.
- Streaming assistant output.
- Tool-call panels.
- Approval panels.
- Diff viewer.
- Command palette or slash commands.
- Status, cost, model, provider, permissions, and session commands.

**Covers:** R64-R72.

**Done when:** the flagship task can be run entirely from the TUI.

### M6. Project context and memory

**Goal:** Make KQode better on the second run than the first.

**Build:**
- Layered instruction file discovery: AGENTS.md, GEMINI.md, `.clinerules`.
- File mention and attachment handling.
- Targeted search/read context discovery.
- Active working set tracking.
- Compaction and summary.
- Inspectable user/project memory files.
- Optional repo map prototype.

**Covers:** R28-R41.

**Done when:** KQode can explain which project guidance, files, and memory informed a change.

### M7. MCP, skills, and plugins

**Goal:** Make KQode extensible without hardcoding every workflow.

**Build:**
- MCP client for stdio first, HTTP/SSE later.
- One KQode-owned MCP server.
- Skills directory with SKILL.md format.
- Plugin manifest with skills and MCP declarations.
- Trust prompts for third-party plugins.
- Conversational MCP config.

**Covers:** R85-R97.

**Done when:** KQode can load a local skill and call an external MCP tool under permission control.

### M8. Subagents and swarm

**Goal:** Add parallelism without losing control.

**Build:**
- Built-in roles: explorer, coder, tester, reviewer, debugger, context scout.
- Child session model.
- Parent/child trace linkage.
- Per-agent budgets and permission policies.
- Result consolidation.

**Covers:** R98-R108.

**Done when:** KQode can delegate repo exploration to a read-only subagent and use the result in the parent task.

### M9. Evaluation and portfolio proof

**Goal:** Turn KQode from a demo into evidence.

**Build:**
- Local task-suite runner on KQode's own repo.
- Golden tasks with expected checks and trace assertions.
- Badcase capture.
- Replay fidelity tests.
- Prompt-injection tests for web/MCP content.
- Cost, latency, pass rate, and runtime reporting.
- Evaluation report generation following `kqode_evaluation_spec.md`.

**Covers:** R137-R154, R155-R160.

**Done when:** the README can publish pass rate, cost per task, runtime per task, and trace screenshots for the flagship demo.

### M10. Deferred platform surfaces

**Goal:** Expand only after the local agent is proven.

**Build later:**
- IDE protocol integration.
- GitHub Actions automation.
- Chat connectors.
- Desktop app.
- Browser/computer control.
- Advanced RAG.
- SWE-bench adapter.
- Remote/cloud workspaces.

**Covers:** R119-R136 and deferred parts of R109-R118, R146-R154, R157.

## First public demo

KQode should dogfood on itself:

1. Ask KQode to add a small CLI flag or fix a failing unit test.
2. KQode reads project instructions and relevant files.
3. KQode proposes a plan.
4. KQode stages an edit through VFS.
5. User approves the diff.
6. KQode runs checks in sandbox-lite.
7. KQode fixes any failure.
8. KQode summarizes the final diff.
9. User opens the trace/replay.
10. README reports local task-suite numbers.
