# Contributing to KQode

**English** | [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest in KQode! KQode is a Rust-first coding agent
application with a React and Tauri desktop UI. Its Rust runtime also supports
command-line and headless execution; there is no TUI. It is still in the
foundation stage, so contributions, issues, and design feedback are all welcome.

This guide covers how to build the project, the conventions we follow, and how to
get a change reviewed. [`AGENTS.md`](AGENTS.md) is the canonical source of
repository conventions — please read it before making non-trivial changes.

## Ways to contribute

- Report bugs or propose features by opening an issue.
- Improve documentation, including the development blog under [`blog/`](blog/).
- Submit code changes via a pull request against the `main` branch.

## Project layout

See the [repository map](README.md#repository-map) in the README for a tour of
`crates/`, `xtask/`, `blog/`, and `docs/`.

## Prerequisites

- **Rust 1.94.0 or later** via [rustup](https://rustup.rs/). The checked-in
  `rust-toolchain.toml` selects the supported baseline for builds, tests, and
  all `cargo xtask` automation.
- **Bun 1.3.12** for the desktop frontend and documentation site.
- **Git**.

The Cargo-facing `cargo xtask` commands manage normal desktop and documentation
workflows. Focused frontend checks use the existing Bun scripts under
`crates/kqode-desktop/frontend/`.

## Getting started

```bash
git clone https://github.com/kefeiqian/kqode-cli.git
cd kqode-cli
cargo build
cargo xtask desktop-dev
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
cargo xtask desktop-dev
cargo test --workspace
cargo test -p <crate-name> <test_name>   # target a single test
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo xtask workspace-boundaries
```

### Desktop application

Start the Tauri application through the Cargo-facing command:

```bash
cargo xtask desktop-dev
```

Run focused frontend checks from `crates/kqode-desktop/frontend/`:

```bash
bun run typecheck
bun run build
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

`cargo xtask` is parallel-safe on Windows: the alias builds and runs xtask in a
private `target\xtask` directory, separate from the workspace `target\`, so a
fast command never relinks a binary another process is holding. Run fast
commands normally, including in parallel. The long-running servers
(`blog-serve`, `blog-serve-en`, and `blog-preview`) hold the binary for their
whole session, so run those through the launcher, which builds once and then
runs a per-invocation copy that leaves the canonical binary free:

```powershell
./scripts/xtask.ps1 blog-serve   # Windows (PowerShell)
```

```bash
./scripts/xtask.sh blog-serve    # macOS/Linux
```

## Before you open a pull request

Make sure the relevant checks pass locally:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo xtask workspace-boundaries
```

If you touched the desktop frontend, also run `bun run typecheck` and
`bun run build` from `crates/kqode-desktop/frontend/`. If you touched the blog, run
`cargo xtask blog-build`.

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
feat(desktop): add conversation history navigation
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
