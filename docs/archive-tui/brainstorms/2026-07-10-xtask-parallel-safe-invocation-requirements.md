---
date: 2026-07-10
topic: xtask-parallel-safe-invocation
---

# Parallel-Safe `cargo xtask` Invocation on Windows

## Summary

Make every xtask entry point safe to run concurrently on Windows by giving xtask its own private build directory — so ordinary `cargo xtask <cmd>` calls never relink a binary another process is running — and by routing the long-running dev servers through the existing copy-and-run launcher so they never hold the canonical binary. The fast one-shot commands keep their exact `cargo xtask <cmd>` invocation.

---

## Problem Frame

`cargo xtask` is the cargo alias `run -p xtask --` (`.cargo/config.toml`), so every call is `cargo run -p xtask` = *build* (which may relink `target\debug\xtask.exe`) + *run* (which holds it). On Windows a running executable cannot be replaced, so when one process holds `xtask.exe` and another invocation needs to relink it, the second fails (os error 32, or os error 5 on the remove step).

Two things feed the relinks. xtask is a `[workspace]` member, so the standard `cargo build --workspace` / `cargo test --workspace` validation rebuilds that same `target\debug\xtask.exe`. And a single shared target dir across heterogeneous invocations (build vs run vs test) keeps invalidating its fingerprint.

The concrete moment of pain: a background coding agent validating one plan via `cargo xtask` blocks a foreground agent from validating a *different* plan at the same time — the situation that prompted this. Long-running servers such as `blog-serve` and `tui-dev` hold the binary for minutes, widening the collision window.

The cost is that on Windows, concurrent plan validation is serialized. A safe launcher (`scripts/xtask.*`) already exists, but it is opt-in and pointed at from nowhere by default — all 17 `.run/` IDE profiles and both contributor guides still direct people at the unsafe path. The result is a split-brain: a safe path and an unsafe-default path, with everything defaulting to unsafe.

---

## Actors

- A1. Foreground developer/agent: types `cargo xtask <cmd>` or runs an IDE profile to validate work; must not be blocked by another in-flight xtask.
- A2. Background coding agent: runs plan validation via `cargo xtask` (often whole-workspace builds/tests) that currently relinks and holds the shared binary.
- A3. IDE `.run/` profiles: the 17 checked-in configs that invoke xtask; today open-code the unsafe path.
- A4. Future xtask command author: adds commands via the `kqode-new-xtask` skill and must inherit safe invocation without rediscovering the gotcha.

---

## Key Flows

- F1. Concurrent fast-command validation
  - **Trigger:** a background agent runs `cargo xtask tui-test` (or `cargo test --workspace`) while a foreground agent runs `cargo xtask tui-typecheck`.
  - **Actors:** A1, A2
  - **Steps:** both invoke fast one-shot xtask commands; xtask's private build dir keeps its binary fresh and untouched by workspace builds; neither invocation needs to relink a held binary.
  - **Outcome:** both complete; no relink-lock failure.
  - **Covered by:** R1, R2, R3

- F2. Long-running server alongside a concurrent command
  - **Trigger:** `blog-serve` (or `tui-dev`/`tui-prod`) runs for minutes while the developer issues another xtask command.
  - **Actors:** A1, A3
  - **Steps:** the long-running command runs as a throwaway copy via the launcher, never holding the canonical binary; the concurrent command proceeds even if it must relink xtask.
  - **Outcome:** the server keeps running; the concurrent command is not blocked.
  - **Covered by:** R4, R5

---

## Requirements

**Isolation (fast commands)**
- R1. `cargo xtask <cmd>` must build and run xtask in a build directory dedicated to xtask, separate from the shared workspace `target/`, so ordinary xtask invocations never relink a binary another process is running.
- R2. The xtask isolation must not relocate or affect the main workspace / `kqode` build outputs; packaging and release flows that read `target/release` must keep working unchanged.
- R3. IDE `.run/` profiles must inherit the same isolation as `cargo xtask` rather than open-code the unsafe `run -p xtask` path, and the `kqode-new-xtask` scaffolding must produce new commands and profiles that inherit it by default.

**Long-running commands (residual closure)**
- R4. Commands that run a persistent or interactive process for the session's lifetime — currently `blog-serve`, `blog-serve-en`, `blog-preview`, `tui-dev`, `tui-prod` — must not hold the canonical xtask binary while running; they run as a throwaway copy via the copy-and-run launcher.
- R5. When a long-running command is active, a concurrently issued xtask command that needs to relink xtask must still succeed, unblocked by the running server.

**Consistency and discoverability**
- R6. The isolated build directory used by the alias and by the launcher must be the same, so there is a single fresh xtask binary rather than two divergent copies (one still contended by workspace builds).
- R7. Contributor docs (`AGENTS.md`, `CONTRIBUTING.md`) and agent instructions must present a single safe model — `cargo xtask` for fast commands, the launcher for the long-running set — replacing today's "opt-in workaround" framing.

---

## Acceptance Examples

- AE1. **Covers R1, R3.** Given a checkout on Windows, when a background agent runs `cargo xtask tui-test` and a foreground agent runs `cargo xtask tui-typecheck` at the same time, then both complete without an os-error-32/5 relink failure.
- AE2. **Covers R4, R5.** Given `blog-serve` running via the launcher, when the developer edits xtask source and then runs another `cargo xtask <cmd>`, then the new command relinks and runs while `blog-serve` keeps serving.
- AE3. **Covers R2.** Given the isolation is in place, when `cargo xtask package` runs, then the packaged `kqode` binary is produced in `target/release` and the Bun packaging step finds it unchanged.

---

## Success Criteria

- On Windows, two or more xtask commands — including a background plan validation plus a foreground one — run concurrently with no relink-lock failure, so parallel plan work is no longer serialized by the tooling.
- A future xtask command added via the standard scaffolding is parallel-safe by default, with no contributor needing to know the launcher exists for fast commands.
- The split-brain is gone: one documented model (fast → `cargo xtask`, long-running → launcher), and no default surface points at an unsafe path.

---

## Scope Boundaries

- Non-Windows platforms (Linux/macOS): no behavior change — the relink lock is Windows-specific.
- CI: unaffected — it runs on Linux in separate runners and is not modified.
- The launcher's core copy-and-run mechanism: reused as-is, not redesigned.
- A PATH-installed `cargo-xtask` shim: rejected for per-developer setup friction; not pursued.
- Making the long-running commands collision-proof *while still holding the binary*: not attempted — those commands move to the launcher instead.

---

## Key Decisions

- Isolate xtask into a private build dir rather than self-re-exec inside the binary: on Windows a live process always locks its own image, so a self-copy-then-wait binary would still hold the canonical exe; isolation plus the launcher is the mechanically sound path.
- Scope isolation to xtask alone (not a global `[build] target-dir`): a global move would relocate the `kqode`/workspace build and break packaging's `target/release` expectation.
- Define the long-running set by a criterion (persistent or interactive for the session lifetime), not a frozen list, so the boundary stays correct as commands are added.
- Treat the alias as the single source of truth for isolation, with `.run/` profiles routing through it where the IDE allows: one definition, inherited everywhere, lowest carrying cost.

---

## Dependencies / Assumptions

- Assumes the IDE's Cargo run configuration can invoke the `xtask` alias as its subcommand (`xtask <cmd>`); if not, each `.run/` profile carries the isolation flag explicitly on `run -p xtask -- <cmd>` instead.
- Assumes the launcher can build into the same private dir as the alias (it already honors `CARGO_TARGET_DIR`).
- Relies on the fact that `cargo run` on an up-to-date binary does not relink, so concurrent runs of a fresh, isolated binary coexist; the fix removes spurious relinks rather than serializing runs.
- Child cargo processes spawned by xtask (e.g., packaging's `cargo build --release --bin kqode`) use the default target dir, so a flag-scoped — not env-scoped — isolation does not leak into them and change where the packaged binary lands.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Does the RustRover/CLion Cargo run config accept an alias (`xtask <cmd>`) as its command, or must each `.run/` profile pass the isolation flag on `run -p xtask -- <cmd>`?
- [Affects R1, R6][Technical] Exact name and location of the private build directory, and how the alias and launcher reference it consistently.
- [Affects R4][Technical] Whether the long-running commands route to the launcher via their `.run/` profiles plus docs, or whether xtask self-dispatches those subcommands into a copy — and confirming the exact command set against the criterion (including `tui-prod`).
