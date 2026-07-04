# Contributing to KQode

**English** | [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest in KQode! KQode is a Rust-first coding-agent harness
with a TypeScript Ink TUI. It is still in the foundation stage, so contributions,
issues, and design feedback are all welcome.

This guide covers how to build the project, the conventions we follow, and how to
get a change reviewed. [`AGENTS.md`](AGENTS.md) is the canonical source of
repository conventions — please read it before making non-trivial changes.

## Ways to contribute

- Report bugs or propose features by opening an issue.
- Improve documentation, including the development blog under [`blog/`](blog/).
- Submit code changes via a pull request against the `main` branch.

## Project layout

See the [repository map](README.md#repository-map) in the README for a tour of
`src/`, `xtask/`, `tui/`, `blog/`, and `docs/`.

## Prerequisites

- A stable **Rust** toolchain via [rustup](https://rustup.rs/) (this drives the
  build, tests, and all `cargo xtask` automation).
- **Git**.

You do **not** need to install Node, npm, or Bun manually. Work on the TUI and
documentation site is driven through Cargo-facing `cargo xtask` commands, which
wrap the underlying package manager for you.

## Getting started

```bash
git clone https://github.com/kefeiqian/kqode-cli.git
cd kqode-cli
cargo build
cargo run
```

List the available automation commands with:

```bash
cargo xtask help
```

## Development commands

Run these from the repository root.

### Rust core

```bash
cargo build
cargo run
cargo test --workspace
cargo test -p <crate-name> <test_name>   # target a single test
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

### TUI

Prefer the Cargo-facing xtask commands over calling the package manager directly.

```bash
cargo xtask tui-install    # install nested TUI dependencies
cargo xtask tui-typecheck  # type-check the TUI (tsc --noEmit)
cargo xtask tui-test       # run TUI tests (vitest)
cargo xtask tui-dev        # run the TUI from a throwaway fixture workspace
```

### Documentation site

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

### Windows note

Running two or more `cargo xtask` commands at once fails on Windows, because each
call relinks the shared `target\debug\xtask.exe` and a long-running command keeps
it locked. To run long-lived or multiple commands in parallel, use the launcher,
which builds once and then runs a per-invocation copy:

```powershell
./scripts/xtask.ps1 blog-serve   # Windows (PowerShell)
```

```bash
./scripts/xtask.sh blog-serve    # macOS/Linux
```

## Before you open a pull request

Make sure the relevant checks pass locally:

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

If you touched the TUI, also run `cargo xtask tui-typecheck` and
`cargo xtask tui-test`. If you touched the blog, run `cargo xtask blog-build`.

## Coding conventions

- **Read [`AGENTS.md`](AGENTS.md)** — it is the single source of truth for
  repository conventions and architecture boundaries.
- Keep source files focused, ideally at or below ~200 lines; split modules,
  components, or helpers before they grow larger unless there is a documented
  reason not to.
- Document non-trivial public Rust items with rustdoc (`///`) comments, and add a
  `# Errors` section for functions that fail in non-obvious ways.
- Avoid hard-coded protocol names, event names, status strings, and magic
  numbers; define shared enums or named constants so Rust and TypeScript stay
  consistent.
- Keep `xtask` command modules as thin wrappers around reusable implementation
  modules. When you add or rename an xtask command, add a matching checked-in IDE
  run profile under `.run/` using the `xtask: <command>` naming pattern.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`.

Use the most specific type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
`perf`, `ci`, `style`, or `build`. Write an imperative subject focused on the
value of the change, and add a body when the change needs rationale, trade-offs,
or review context.

Examples from this repository:

```text
feat(tui): add --version and --help to the kqode CLI via citty
docs(readme): add development blog section and fix repo URLs
fix(blog): correct GitHub Pages baseUrl and repo name to kqode-cli
```

## Pull requests

- Branch off `main` and keep each pull request focused on one concern.
- Ensure the checks above pass and include a clear description with a reviewable
  diff.
- Link any related issues.

## License

KQode is dual-licensed under [MIT](LICENSE-MIT) or
[Apache-2.0](LICENSE-APACHE), at your option. Unless you explicitly state
otherwise, any contribution intentionally submitted for inclusion in KQode by
you, as defined in the Apache-2.0 license, shall be dual-licensed as above,
without any additional terms or conditions.
