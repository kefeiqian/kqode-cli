# KQode

[![GitHub Pages](https://github.com/kefeiqian/KQode/actions/workflows/github-pages.yml/badge.svg)](https://github.com/kefeiqian/KQode/actions/workflows/github-pages.yml)

KQode is a Rust-first coding-agent harness with a replaceable TypeScript Ink TUI.
The project is currently in the foundation stage: the checked-in implementation is
small, while the product direction lives in the planning and architecture docs.

## Links

- Documentation site: <https://kefeiqian.github.io/KQode/>
- Architecture spec: [`docs/kqode_architecture_spec.md`](docs/kqode_architecture_spec.md)
- Build path: [`docs/kqode_build_path.md`](docs/kqode_build_path.md)
- Detailed requirements: [`docs/kqode_detailed_requirements_index.md`](docs/kqode_detailed_requirements_index.md)

## Direction

KQode is designed around a headless Rust core that owns agent execution,
provider normalization, tools, virtual file operations, sandbox policy, session
logs, replay, and evaluation. Rich surfaces such as the terminal UI, protocol
client, and future IDE or web companions live in TypeScript.

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

The first public proof is a local terminal agent that can modify this repository
safely, show a diff, run checks, record trace evidence, and resume or replay the
session.

## Repository map

- `src/` - starter Rust crate.
- `xtask/` - Cargo-facing developer automation commands.
- `tui/` - nested TypeScript Ink TUI package.
- `blog/` - Docusaurus documentation site published to GitHub Pages.
- `docs/` - requirements, architecture, implementation, evaluation, and build
  path documents.

## Development

Run commands from the repository root.

```bash
cargo build
cargo run
cargo test --workspace
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

List automation commands:

```bash
cargo xtask help
```

### TUI

Use the Cargo-facing xtask commands instead of calling the package manager
directly.

```bash
cargo xtask tui-install
cargo xtask tui-typecheck
cargo xtask tui-test
cargo xtask tui-dev
```

### Documentation site

The Docusaurus site lives under `blog/` and is deployed by the GitHub Pages
workflow.

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
```
