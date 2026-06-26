# Copilot instructions for KQode

## Build, test, and lint

This repository is currently a single Rust package (`Cargo.toml` at the root) with a starter binary in `src/main.rs`.

Use these commands from the repository root:

```bash
cargo build
cargo run
cargo test
cargo test <test_name>
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
```

When the planned Rust workspace exists, prefer package-scoped tests such as:

```bash
cargo test -p <crate-name> <test_name>
```

## Architecture

KQode is planned as a Rust-first coding-agent harness with a replaceable TypeScript Ink TUI. The checked-in implementation is still at the project-foundation stage, so treat the `docs/` specs as the product direction while keeping changes aligned with the current code shape.

Rust owns the core runtime: agent loop, provider abstraction, tool registry, VFS/patch application, sandbox-lite process execution, policy engine, session store, replay engine, eval runner, MCP core, and headless CLI. TypeScript owns rich surfaces: Ink TUI, protocol client, plugin authoring helpers, IDE/ACP adapters, and future web or desktop companions. Python is only for benchmark/eval adapters where the ecosystem makes it cheaper.

The intended runtime boundary is:

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

The Rust core must run headless without the TUI. Daemon mode is planned later and should not be required for early milestones.

The planned Rust crate boundaries are `kqode-core`, `kqode-cli`, `kqode-protocol`, `kqode-provider`, `kqode-tools`, `kqode-vfs`, `kqode-sandbox`, `kqode-policy`, `kqode-session`, `kqode-mcp`, and `kqode-eval`. Keep these boundaries in mind before adding modules to the starter crate.

## Project-specific conventions

- Follow the milestone order in `docs/kqode_build_path.md`: build a working local terminal agent before expanding into MCP, subagents, IDE integration, browser automation, or cloud/runtime surfaces.
- Use reference implementations only for product behavior, architecture ideas, and evaluation design. Do not fork, vendor, or copy source from referenced coding-agent projects.
- Keep the TUI replaceable. Core state transitions, protocol events, approvals, diffs, and trace data belong in Rust-side services and protocols, not in UI-only code.
- Normalize provider differences behind the provider layer. Native tool calls and text-fallback tool calls should become one internal representation; vendor-specific formats should not leak into core logic.
- Route file operations through the VFS design: workspace-root path normalization, traversal checks, staged writes, diff generation, stale-edit detection, and atomic apply where possible.
- Route shell execution through sandbox-lite: selected workspace cwd, timeout, environment scrubbing, output capture/limits, network gating, and policy approval for risky commands.
- Keep policy decisions centralized in `kqode-policy`. Non-TTY/headless flows should fail closed when an operation needs fresh approval.
- Tool results should separate execution success from loop control with the documented shape: `success`, `should_continue`, `summary`, `content`, optional `error_kind`, and optional user-facing `display`.
- Store replayable truth in append-only local JSONL session logs; use SQLite as an index for sessions, turns, tool calls, costs, todos, checkpoints, eval runs, and badcases.
- Build model context from bounded fragments with source, token estimate, priority, expiry/persistence, and trace citation. Do not add unbounded repo dumps to prompt context.
- Every meaningful coding task should end with a reviewable diff, check results, and final summary, and should produce trace evidence for model calls, tool calls, approvals, diffs, costs, and outcome.
- Start evaluation with deterministic harness tests before provider or benchmark tests. The first golden tasks should dogfood KQode on this repository.
