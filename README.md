# KQode

[![GitHub Pages](https://github.com/kefeiqian/KQode/actions/workflows/github-pages.yml/badge.svg)](https://github.com/kefeiqian/KQode/actions/workflows/github-pages.yml)

KQode is a Rust-first coding-agent harness with TypeScript Ink as its committed TUI.
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
logs, replay, and evaluation. The terminal experience is built permanently with
Ink, while related protocol clients and future IDE or web companions live in
TypeScript.

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
cargo xtask tui-install    # install nested TUI dependencies
cargo xtask tui-typecheck  # type-check the TUI (tsc --noEmit)
cargo xtask tui-test       # run TUI tests (vitest)
cargo xtask tui-dev        # run the TUI from a throwaway fixture workspace
```

`cargo xtask tui-dev` runs the Ink TUI against a copied fixture workspace, so the
displayed working directory is a realistic project rather than the KQode repo.
Today the TUI talks to a local Rust JSON-RPC backend that acknowledges each
submitted prompt (`ACK: message received`); it does not yet call a model, run
tools, or execute an agent loop, and the slash-command, mention, and model
affordances are inert placeholders for now.

Prepare or reset that fixture workspace explicitly with:

```bash
cargo xtask fixture-prepare-react-simple   # committed simple React fixture
cargo xtask fixture-prepare-react-complex  # cached official Vite React template
```

`tui-dev` prepares a workspace on demand, so these are only needed to reset it or
switch to a specific fixture.

### Standalone executable

`kqode` ships as a single native executable that bundles the Ink frontend with a
prebuilt Rust backend, so packaged users need neither Cargo, Rust, Node, nor npm.

```bash
cargo xtask package    # build the standalone executable at tui/dist/kqode[.exe]
cargo xtask tui-prod   # build and run the standalone executable
```

Cargo is required only for this source-mode build. The packaged executable
materializes its embedded backend into a per-user cache under `~/.kqcode/` and
runs the same local ACK path as source mode.

### Distribution

Every install channel delivers the same standalone executable from GitHub Release
assets — no channel builds from source:

- Direct download of `kqode-<os>-<arch>.tar.gz` / `.zip` plus checksums.
- npm: `npm install -g @kqode/kqode-cli` downloads and verifies the matching
  release archive on install.
- Homebrew and winget manifests that point at the Release asset URLs.

Maintainer commands:

```bash
cargo xtask package-release    # archive + checksums for the host target
cargo xtask set-version X.Y.Z  # bump every manifest in lockstep before tagging
```

The [distribution registration guide](docs/release/kqode_distribution_registration.md)
walks through GitHub Release, npm, Homebrew, and winget publishing.

### Documentation site

The Docusaurus site lives under `blog/` and is deployed by the GitHub Pages
workflow.

```bash
cargo xtask blog-install
cargo xtask blog-build
cargo xtask blog-typecheck
cargo xtask blog-serve
cargo xtask blog-serve-en
cargo xtask blog-preview
```

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
