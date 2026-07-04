# KQode agent instructions

## Plan document review checkboxes

When creating or updating Markdown plan documents under `docs/plans/`, keep the top `#` document title clean and do not add a review checkbox to it.

When review tracking is requested, put the checkbox directly on the affected content bullet:

```md
- [ ] New or updated decision that needs review
- [x] Existing decision whose checked state should be preserved
```

Use item-level checkboxes for bullet lists so only newly created or changed bullets are reset to unchecked. Preserve existing checked state when rewriting review controls. Avoid section-level review callouts, inline heading checkboxes, review checkboxes inside Markdown tables, and standalone `- [ ] Reviewed` items under sections, because Obsidian renders them as broad, ambiguous, or non-clickable review controls rather than meaningful content review controls.

If a `##` section is only a container for reviewed `###` subsections, do not add parent review controls. Track review state on the specific changed bullets inside the relevant subsection instead.

When changing content, reset only the changed content bullets to unchecked. If the changed content belongs to a subsection, update the item-level controls inside that subsection rather than adding a parent section control.

## File size guideline

Across the project, prefer focused source files that stay at or below roughly 200 lines. Split modules/components/helpers before a file grows beyond that size unless there is a clear, review-documented reason to keep it larger.

## Build, test, and lint

This repository is a Rust-first project. Use these commands from the repository root:

```bash
cargo build
cargo run
cargo test --workspace
cargo test -p <crate-name> <test_name>
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

For the nested TUI package, prefer Cargo-facing xtask commands instead of running package-manager commands directly:

```bash
cargo xtask tui-install
cargo xtask tui-typecheck
cargo xtask tui-test
cargo xtask tui-dev    # run the TUI from TypeScript source against a workspace fixture
cargo xtask tui-prod   # package the standalone kqode binary and run it from the workspace
```

`tui-dev` and `tui-prod` both run against a workspace fixture; seed one first with `cargo xtask fixture-prepare-react-simple` (or `fixture-prepare-react-complex`) to skip the interactive fixture prompt.

For the Docusaurus blog/docs site under `blog/`, prefer Cargo-facing xtask commands instead of running package-manager commands directly:

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

Running two or more `cargo xtask` commands at once fails on Windows: `cargo xtask` expands to `cargo run -p xtask`, which relinks the shared `target\debug\xtask.exe` on each call, and a long-running command keeps that executable locked so the next call cannot replace it (os error 32, or os error 5 on the remove step). To run long-lived or multiple commands in parallel, use the launcher, which builds once then runs a per-invocation copy under `target/debug/xtask-run/`:

```powershell
./scripts/xtask.ps1 blog-serve   # Windows (PowerShell)
```

```bash
./scripts/xtask.sh blog-serve    # macOS/Linux
```

Keep xtask command modules as thin wrappers around reusable implementation modules. When adding or renaming an xtask command, add a matching checked-in IDE run profile under `.run/` using the `xtask: <command>` naming pattern.

## Architecture

KQode is planned as a Rust-first coding-agent harness with TypeScript Ink as the committed TUI. The checked-in implementation is still at the project-foundation stage, so treat the `docs/` specs as the product direction while keeping changes aligned with the current code shape. The current working slice is a first end-to-end round trip: the Ink TUI in `tui/` spawns the Rust `kqode` binary in its stdio JSON-RPC backend mode (built on `lsp-server`), which emits a one-shot `kqode.backend.ready` notification and then answers `kqode.message.submit`. The agent loop, provider layer, tools, VFS, sandbox, policy engine, and session store described below are still `docs/` specs, not code yet.

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

The planned Rust crate boundaries are `kqode-core`, `kqode-cli`, `kqode-protocol`, `kqode-provider`, `kqode-tools`, `kqode-vfs`, `kqode-sandbox`, `kqode-policy`, `kqode-session`, `kqode-mcp`, and `kqode-eval`. Today the Rust side is still a single root crate (`kqode`, with modules such as `backend` and `protocol` under `src/`) plus the `xtask` helper crate, so these are targets to grow into rather than existing crates. Keep these boundaries in mind before adding modules to the starter crate.

## Constants and enums

Avoid hard-coded protocol names, event names, status strings, and non-obvious numeric literals. Define shared enums or named constants for these values so Rust and TypeScript protocol code stays searchable and consistent.

## Rust documentation

Use rustdoc comments (`///`) for non-trivial public functions, structs, modules, and helpers. Prefer concise Markdown prose with backticked parameter names over JSDoc-style `@param` tags.

For functions that can fail in non-obvious ways, include a `# Errors` section. Use `# Panics`, `# Safety`, and `# Examples` only when they add real value.

## Project-specific conventions

- Follow the milestone order in `docs/kqode_build_path.md`: build a working local terminal agent before expanding into MCP, subagents, IDE integration, browser automation, or cloud/runtime surfaces.
- Use reference implementations only for product behavior, architecture ideas, and evaluation design. Do not fork, vendor, or copy source from referenced coding-agent projects.
- Treat Ink as the permanent TUI. Core state transitions, protocol events, approvals, diffs, and trace data still belong in Rust-side services and protocols so the headless CLI and terminal UI stay consistent.
- Normalize provider differences behind the provider layer. Native tool calls and text-fallback tool calls should become one internal representation; vendor-specific formats should not leak into core logic.
- Route file operations through the VFS design: workspace-root path normalization, traversal checks, staged writes, diff generation, stale-edit detection, and atomic apply where possible.
- Route shell execution through sandbox-lite: selected workspace cwd, timeout, environment scrubbing, output capture/limits, network gating, and policy approval for risky commands.
- Keep policy decisions centralized in `kqode-policy`. Non-TTY/headless flows should fail closed when an operation needs fresh approval.
- Tool results should separate execution success from loop control with the documented shape: `success`, `should_continue`, `summary`, `content`, optional `error_kind`, and optional user-facing `display`.
- Store replayable truth in append-only local JSONL session logs; use SQLite as an index for sessions, turns, tool calls, costs, todos, checkpoints, eval runs, and badcases.
- Build model context from bounded fragments with source, token estimate, priority, expiry/persistence, and trace citation. Do not add unbounded repo dumps to prompt context.
- Every meaningful coding task should end with a reviewable diff, check results, and final summary, and should produce trace evidence for model calls, tool calls, approvals, diffs, costs, and outcome.
- Start evaluation with deterministic harness tests before provider or benchmark tests. The first golden tasks should dogfood KQode on this repository.
- `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`); relevant when implementing or debugging in documented areas.

## Commit workflow

Implement plan work one commit-sized unit at a time. After each commit, run code review on the completed unit, then pause for user review and wait for explicit consent before starting the next commit.
