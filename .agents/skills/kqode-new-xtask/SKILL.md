---
name: kqode-new-xtask
description: Add or scaffold a new KQode Rust xtask command from a user-provided description of what the command should do. Use when asked to create an xtask command, add project automation under xtask, wire a command into cargo xtask, or add matching .run IDE profiles for xtask commands.
---

# KQode New Xtask

Create a new Rust `xtask` command for KQode from the user's description of what the automation should do.

## Workflow

1. Treat the user's freeform request as the command purpose. If the purpose is missing or too ambiguous to choose a command name and behavior, ask for one concise description.
2. Read relevant existing `xtask/src/commands/**`, `xtask/src/support/**`, and `.run/xtask_*.run.xml` examples before editing.
3. Choose a kebab-case command name, for example `blog-build` or `fixture-prepare-react-simple`. Prefer group prefixes when the command belongs to an existing area.
4. Implement the command as a thin wrapper under `xtask/src/commands/<group>/` when possible.
5. Put reusable or non-trivial implementation logic in `xtask/src/support/` or another shared module instead of the command wrapper.
6. Register the command with a `CommandSpec`, include it in the group's `COMMANDS`, and ensure `cargo xtask help` will list it.
7. Add or update tests for command registry or helper behavior when the change has meaningful logic.
8. Add a checked-in IDE run profile under `.run/` using the display name `xtask: <command>` and a file name like `xtask_<command-with-underscores>.run.xml`. Set its Cargo command to `xtask <command>` (not `run -p xtask -- <command>`) so it routes through the isolating alias and inherits the private `target/xtask` build dir; keep `workingDirectory` at `$PROJECT_DIR$`. For a long-running/server command (one that blocks for the session, like `blog-serve` or `tui-dev`), also document it as run via the launcher (`scripts/xtask.ps1` / `scripts/xtask.sh`), which runs a throwaway copy so it never holds the canonical binary.
9. Validate with `cargo check -p xtask` and `cargo test -p xtask`. Run a targeted command invocation if it is safe and deterministic.

## Rules

- Keep xtask command modules thin; do not bury reusable behavior in command wrappers.
- Use Rust helpers for cross-platform path and process handling instead of shell-only scripts.
- Use named constants for repeated command names, paths, or non-obvious literals.
- Keep public/non-trivial Rust items documented with rustdoc and `# Errors` sections when failures are non-obvious.
- Do not add external dependencies unless the command cannot reasonably be implemented with the standard library or existing dependencies.
- Do not change unrelated xtask commands while adding the new one.
- Route new `.run/` profiles through the `xtask` alias (`xtask <command>`) rather than open-coding `run -p xtask`, so IDE runs inherit the private-dir isolation that keeps `cargo xtask` parallel-safe on Windows (see `.cargo/config.toml` and the xtask section of `AGENTS.md`).
