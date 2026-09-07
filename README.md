# KQode

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/ci.yml)
[![Release](https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/release.yml)
[![GitHub Pages](https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml/badge.svg)](https://github.com/kefeiqian/kqode-cli/actions/workflows/github-pages.yml)
[![GitHub release](https://img.shields.io/github/v/release/kefeiqian/kqode-cli?logo=github)](https://github.com/kefeiqian/kqode-cli/releases/latest)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Made with Rust](https://img.shields.io/badge/Rust-2024_edition-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/kefeiqian/kqode-cli?logo=github)](https://github.com/kefeiqian/kqode-cli/stargazers)

KQode is a Rust-first coding agent application with a Tauri and React desktop
interface. The same Rust runtime is designed to support command-line and headless
execution, but KQode does not provide a terminal UI (TUI).

The project is currently in the foundation stage: the checked-in implementation
is small, while the product direction is evolving alongside the application.

## Development blog

KQode is built in the open, and its documentation site doubles as a **development
blog** — an explanation of the build route and a running diary of the project as
it grows from a starter crate into a full coding-agent harness.

- Read it online: <https://kefeiqian.github.io/kqode-cli/>
- Available in 简体中文 (default) and English.
- Source lives under [`blog/`](blog/) and is published automatically by the
  GitHub Pages workflow.

It opens with an introduction and the development approach, then follows the
implementation unit by unit, mirroring the `U#` commit tags. Each entry captures
the reasoning, decisions, and trade-offs behind that step rather than only the
final code.

## Direction

KQode is designed around a Rust core that owns agent execution, provider
normalization, tools, virtual file operations, sandbox policy, session logs,
replay, and evaluation. The committed product surface is a React application
hosted by Tauri.

```text
React desktop UI
  -> Tauri IPC
Rust core in the same process
  -> agent loop
  -> provider adapter
  -> tool registry
  -> VFS and sandbox
  -> session store and trace log
  -> eval runner
```

The first public proof is a local coding agent app that can modify this repository
safely, show a diff, run checks, record trace evidence, and resume or replay a
session. The desktop app is the primary interactive experience; CLI and headless
modes reuse the same Rust core for automation.

## Repository map

- `crates/kqode-core/` - provider-neutral runtime contracts and shared core logic.
- `crates/kqode-provider/` - concrete model provider adapters built on
  `kqode-core`.
- `crates/kqode-desktop/` - Tauri desktop application with its React/Vite frontend
  under `frontend/`.
- `crates/kqode-cli/` - headless `kqode` command-line package.
- `xtask/` - Cargo-facing developer automation commands.
- `blog/` - Docusaurus documentation site published to GitHub Pages.
- `docs/` - requirements, architecture, implementation, evaluation, and build
  path documents.

## Development

Install Rust 1.94.0, Bun 1.3.12, and Git, then run commands from the repository
root.

```bash
cargo build
cargo xtask desktop-dev
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo xtask workspace-boundaries
```

List automation commands:

```bash
cargo xtask help
```

### Desktop

Run the Tauri desktop application in development mode:

```bash
cargo xtask desktop-dev
```

The command installs the desktop frontend dependencies with Bun when they are
missing, then starts the Vite frontend and Tauri application.

### Distribution

Version tags publish native Tauri installers for macOS, Linux, and Windows to
GitHub Releases.

Maintainer commands:

```bash
cargo xtask set-version X.Y.Z  # bump every manifest in lockstep before tagging
```

The [distribution registration guide](docs/release/kqode_distribution_registration.md)
documents the desktop release workflow.

### Documentation site

The [development blog](#development-blog) is a Docusaurus site under `blog/`,
deployed by the GitHub Pages workflow. Work on it with the Cargo-facing xtask
commands:

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for build
instructions, conventions, and the pull request workflow.

## License

KQode is dual-licensed under either of:

- Apache License, Version 2.0 ([`LICENSE-APACHE`](LICENSE-APACHE) or
  <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([`LICENSE-MIT`](LICENSE-MIT) or
  <https://opensource.org/licenses/MIT>)

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in KQode by you, as defined in the Apache-2.0 license, shall be
dual-licensed as above, without any additional terms or conditions.
