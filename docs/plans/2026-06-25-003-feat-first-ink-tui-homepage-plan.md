---
title: "feat: Add First Ink TUI Homepage"
type: feat
status: active
date: 2026-06-25
origin: docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md
deepened: 2026-06-25
---

# feat: Add First Ink TUI Homepage

## Summary
Add a small TypeScript Ink package under `tui/`, a minimal Rust JSON-RPC stdio backend process, and a true cross-platform standalone native executable named `kqode`. The packaged artifact should run without Cargo, Rustup, Node, or npm as runtime prerequisites, while npm global install, direct download, Homebrew, and winget all distribute the same standalone executable shape.

---

## Problem Frame
KQode currently has a starter Rust binary and a checked-in starter TypeScript TUI scaffold. The architecture calls for a replaceable Ink surface over a Rust core, so this plan turns that scaffold into the first visual shell and text-submission path without making the UI responsible for core agent behavior.

---

## Requirements

**Origin-derived requirements**

- [x] R1. Render a top identity area with a simple KQode logo, product name, and current application version at normal supported widths, with decorative details allowed to compact or hide under the responsive contract.
- [x] R2. Reserve a main body area that is static on initial render, then displays local backend ACK/status/error content for this slice.
- [x] R3. Display the workspace current working directory where the `kqode` command was invoked directly above the input composer.
- [x] R4. Render the input composer above the bottom status bar as the active prompt area.
- [x] R5. Render `/ commands`, `@ mention`, `? help`, and right-side `GPT-5.5` status affordances at normal supported widths, with lower-priority details allowed to compact or hide under the responsive contract.
- [x] R6. Accept typed text in the composer.
- [x] R7. Support visual multiline wrapping when input exceeds the available width.
- [x] R8. Submit the current non-empty, non-whitespace composer text when Enter is pressed; block empty/all-whitespace submits.
- [x] R9. Have the Rust backend receive submitted text and return an ACK-style response plus the exact received text.
- [x] R10. Display every submitted user prompt and every backend response in the visible scrollable body area.
- [x] R11. Avoid model provider calls, agent loop execution, and tool execution.
- [x] R12. Organize the Ink TUI as components rather than a monolithic render function.
- [x] R13. Place TUI source under `tui/`.
- [x] R14. Use centralized coding-agent CLI theme tokens for the first screen; the active direction is GitHub/Gemini-inspired foreground colors with background rendering kept internal and fallback-aware.

**Distribution, release, and fixture requirements**

- [x] R15. Packaged users can run `kqode` without having Cargo, Rustup, Node, or npm installed, except when npm itself is used as an installer.
- [x] R16. Distribution channels target the same standalone executable artifact: direct release download, `npm install -g`, Homebrew, and winget.
- [x] R17. After the echo/ACK implementation and release staging are complete, provide a registration guide for manually publishing the generated artifacts through GitHub Releases direct download, npm, Homebrew, and winget.
- [x] R18. Provide a small committed dummy React frontend project fixture so cwd display and backend launch behavior can be tested from a realistic non-KQode workspace without a separate regeneration script.
- [x] R28. Provide a GitHub Actions release pipeline that builds the supported standalone executables, packages archives/checksums, and uploads them as GitHub Release assets.

**Interaction, error, and loading requirements**

- [x] R19. Queue consecutive non-empty submits in order: the active request is sent to the backend, later submits appear immediately as user prompts marked `(pending)`, and the queue drains one request at a time as ACKs arrive.
- [x] R20. Render frontend validation failures and backend failure messages in the centralized theme error red.
- [x] R30. Prevent terminal text injection by sanitizing all user prompt, backend ACK, backend error, and restored transcript text before rendering. Persist exact raw text when needed, but never render control sequences as executable terminal control.
- [x] R29. Show a small terminal-safe loading animation for user-visible loading states such as backend/session startup, `/resume` session list loading, and session restore.

**Plan-added technical constraints**

- [x] T1. Transmit submitted prompts and backend ACK responses through a real JSON-RPC request/response connection between TypeScript and Rust, using third-party JSON-RPC transport libraries rather than a hand-rolled codec.
- [x] T2. Produce a true standalone native executable named `kqode`, packaging the bundled Ink frontend together with a prebuilt Rust backend binary.
- [x] T3. Treat source-mode Cargo launch as a developer path only; packaged mode must never require Cargo, Rustup, or target-dir probing.
- [x] T4. Build platform-specific executable artifacts for macOS, Linux, and Windows, at minimum covering x64 and arm64 where the toolchain supports them.

- [x] **Origin actors:** A1 user, A2 Ink TUI, A3 Rust backend.

- [x] **Origin flows:** F1 first screen render, F2 prompt submit and backend response.

- [x] **Origin acceptance examples:** AE1 first render, AE2 composer wrapping, AE3 submit-to-backend response.

**Plan-added session requirements**

- [x] R21. Create a durable local session when the TUI starts, scoped to `workspaceCwd`, with session id, title/last prompt metadata, created/updated timestamps, and current status stored in SQLite.
- [x] R22. Persist each user prompt only after it is sent to the Rust backend, plus the matching backend ACK/error needed to reconstruct the durable transcript. Frontend-only queued prompts and validation errors remain in-memory UI state for this slice.
- [x] R23. Persist first-slice context needed to resume the session: workspace cwd, detected git repo identity when available, app version, backend mode, current transcript, message ordering, and serialized context fragments reserved for future agent context.
- [x] R24. Implement `/resume` as the only active slash command in this slice. It opens a session list, scoped to the current `workspaceCwd` by default, and shows session title/id, updated time, workspace path, and last prompt.
- [x] R25. Selecting a session restores its persisted transcript/context into the TUI body and continues future submits in that same session.
- [x] R26. Allow resume only when the selected session's stored canonical absolute `workspaceCwd` matches the current canonical absolute `workspaceCwd`; sessions from other working directories must not be selectable/resumable and must never switch the user's cwd.
- [x] R27. When `workspaceCwd` is inside a git repository, persist and restore explicitly written repo-scoped memory rows for that repository. Store memory under the detected git root/repo key plus the session's relative workspace subpath; automatic LLM-based memory extraction/injection is deferred.

---

## Scope Boundaries
- [x] Real slash command execution remains deferred except for `/resume`; `@` file mentions, help overlays, and Tab navigation remain inert visual affordances.
- [x] Model selection, provider calls, streaming assistant output, prompt-history navigation/editing, and full editor behavior are deferred.
- [x] Full session accounting, trace replay, cost display, approvals, diff panels, rename/delete/export, and checkpoint/rewind/fork remain deferred. Persistent session transcript/history needed for `/resume` is in scope.
- [x] Daemon mode is explicitly out of scope for this milestone and is not a planned future direction: do not introduce `kqoded`, local sockets, listening ports, background services, or backend processes that survive the TUI. This product shape uses only a TUI-owned child Rust process over JSON-RPC stdio. Any in-flight work terminates if the TUI or child backend terminates; recovery comes from persisted session state on a later launch.
- [x] Full theme configuration is deferred; centralized GitHub/Gemini-inspired theme tokens remain internal to this slice.
- [x] The TUI lives under `tui/` for this slice, even though the architecture example mentions `apps/kqode-tui/`; the origin requirement takes precedence for now.
- [x] Registry publishing, signed/notarized releases, auto-update, and daemon service installation are deferred; GitHub Release asset creation and channel-ready package artifacts for direct download, npm global install, Homebrew, and winget are in scope around the standalone executable.

### Deferred to Follow-Up Work
- [x] Expand the first local session + ACK JSON-RPC boundary into the eventual full agent session protocol when KQode adds real model/tool/session events.
- [x] Promote the `tui/` package into any future workspace layout if the repository later adopts the full proposed `apps/` and `packages/` structure.

### No-Daemon Product Decision
- [x] User promise: KQode does not keep hidden background services running after the TUI exits. Work is owned by the visible `kqode` session and stops when the TUI or child backend terminates.
- [x] Tradeoff accepted: KQode gains simpler local security, lifecycle, and install behavior, but users do not get background continuation after closing the terminal, multi-client attachment to one live backend, or a process owner for unattended long-running jobs.
- [x] Recovery model: Persisted SQLite session state supports later inspection/resume of completed transcript/context, but interrupted in-flight work is not automatically continued.
- [x] Reconsideration threshold: Reopen the no-daemon decision only with an explicit product decision document if KQode later commits to background execution while no TUI is open, multi-client live attachment, IDE/TUI/headless sharing of one live runtime, or unattended job ownership.

---

## Context & Research
### Relevant Code and Patterns

- [x] `Cargo.toml` defines a single Rust package named `KQode`, version `0.1.0`, edition `2024`, with no dependencies yet.
- [x] `src/main.rs` is the only Rust runtime source today and currently prints a starter message; this plan moves the binary entrypoint to root `main.rs` and keeps implementation modules under `src/`.
- [x] `docs/kqode_architecture_spec.md` assigns the Rust core runtime to Rust and the Ink TUI/protocol client to TypeScript. Its older daemon-mode direction is superseded for this product slice by the explicit no-daemon decision in this plan.
- [x] `docs/kqode_build_path.md` requires the Rust core to run headless and the TUI to remain replaceable.
- [x] `.cargo/config.toml` exposes `cargo xtask ...` as the contributor-facing command shape for nested TUI and fixture workflows.
- [x] `.gitignore` covers Rust artifacts, TUI dependency/build artifacts, generated fixture workspaces, and local/editor files.
- [x] `tui/package.json` records the Bun-managed package baseline (`bun@1.3.12`, Bun `>=1.3.0`, Node `>=24.0.0`) and keeps package-local `dev`, `typecheck`, and `test` scripts available behind Cargo-facing xtask commands.
- [x] `tui/src/productMetadata.ts` reads the displayed KQode version from root `Cargo.toml`, while `tui/src/runtimePaths.ts` keeps `repoRoot` and `workspaceCwd` resolution separate.
- [x] `xtask/src/commands/` registers TUI commands and simple/complex React fixture preparation commands; `xtask/src/support/` owns shared Bun, Git, path, and workspace reset helpers.
- [x] `docs/research/2026-06-25-tui-backend-spawn-architecture.md` found that reference agents centralize process launch behind manager/service abstractions with explicit cwd roles, timeout/output caps, environment hardening, cleanup, and permission/sandbox gates.

### Institutional Learnings
- [x] No `docs/solutions/` learnings exist yet.
- [x] `docs/plans/2026-06-25-002-feat-context-intent-retrieval-planning-plan.md` is adjacent future context work but explicitly not a TUI implementation source; do not pull retrieval or agent behavior into this slice.

### External References
- [x] Ink documentation: use React-style `Box`, `Text`, and hooks for terminal rendering, with component tests through Ink testing utilities.
- [x] Node `child_process.spawn` documentation: use argument arrays and `shell: false` for the Rust backend process rather than shelling through `exec`.
- [x] Node SEA documentation and `postject` cover the single-executable packaging mechanism for the bundled Ink entrypoint and embedded assets.
- [x] npm, Homebrew, and winget are distribution channels for prebuilt artifacts in this slice, not source-build mechanisms.
- [x] JSON-RPC reference: use a library-backed request/response connection now for local session + ACK backend messages, while deferring the broader agent session protocol.
- [x] NO_COLOR guidance: keep a later path for color-disabled terminals even though full theme configuration is out of scope.

---

## Key Technical Decisions

- [x] Use a nested Bun-managed TypeScript package in `tui/`: This satisfies the origin path requirement without forcing a root JavaScript workspace before the broader M0 structure exists.
- [x] Use Bun 1.3.x plus Node 24+ as the TUI source baseline: Record both the Bun package manager and Node runtime expectation in package metadata so Ink/ESM/Vitest behavior is reproducible.
- [x] Expose source workflows through Cargo-facing xtask commands: contributors should reach TUI install/typecheck/test/dev and fixture preparation from the repository root, while Bun/package scripts remain the nested implementation detail.
- [x] Keep Ink components prop-driven and backend-agnostic: Layout components should not import process-spawning code, preserving the replaceable TUI boundary.
- [x] Use a small library-backed JSON-RPC message seam: The TUI calls a backend client now, and that seam can later expand into a real protocol client without rewriting the UI tree.
- [x] Use a TUI-owned Rust JSON-RPC stdio server for the first backend: This is not a daemon, exposes no socket/port, and exits with the TUI, but it is closer to KQode's intended Rust-core/TypeScript-surface boundary than one process per submit.
- [x] Make the backend launch path clean-checkout-safe: The documented demo path must build or run the Rust backend from source rather than assuming an ignored `target/` artifact already exists.
- [x] Use Cargo as the default first-slice backend build path: build from the trusted `repoRoot` manifest/config, then launch the compiled backend with process cwd set to `workspaceCwd`, so untrusted workspace Cargo config/PATH cannot influence the build step.
- [x] Ship a standalone `kqode` executable as the core release artifact: Bundle the TypeScript Ink entrypoint into a Node SEA executable and embed/carry the compiled Rust backend binary so one user-invoked executable starts both frontend and backend.
- [x] Use install channels as distribution wrappers, not alternate runtimes: npm global install, Homebrew, winget, and direct download should all select or install the same platform-specific `kqode` executable rather than rebuilding from source.
- [x] Name path roles explicitly: `repoRoot` is the KQode repository root for Cargo/product metadata, `workspaceCwd` is the user's launch directory from `process.cwd()` when `kqode` starts and is displayed above the composer/used for backend execution, and `tuiPackageRoot` is the nested package directory.
- [x] Keep a committed dummy React frontend project fixture under `tests/fixtures/dummy-react-app/` as read-only seed data and provide an optional cached complex Vite fixture through xtask: Automated tests and manual development runs must copy a selected fixture into ignored workspaces under `target/kqode-test-workspaces/` before running `kqode`, so edits do not dirty the repository.
- [x] Keep session persistence Rust-owned: The Ink TUI calls narrow JSON-RPC session methods, while the Rust backend creates, records, lists, and resumes SQLite-backed sessions.
- [x] Use SQLite for the first-slice session store: Store session metadata, backend-observed transcript/message rows, backend responses/errors, serialized context rows, and git-repo-scoped memory rows in a local database under KQode's home/cache area. Frontend queue state and validation-only errors remain in memory. Keep the schema compatible with later append-only JSONL replay work, but do not implement full trace/replay in this slice.
- [x] Detect git repository identity during session start: If `workspaceCwd` is inside a git repo, store the normalized git root, a stable repo key, and the session's relative subpath from the git root, then restore explicitly written repo-scoped memory rows for that repo on session start/resume. If no git repo is found, skip repo memory without failing the session.
- [x] Treat `/resume` as a local TUI command backed by the Rust session API: It lists sessions for the current workspace, restores persisted transcript/context after selection, and then continues appending prompts to the selected session.
- [x] Use a guarded backend process launcher: Source-mode Cargo launch and dist-mode bundled-backend launch must share timeout, output caps, stdin-close, environment hardening, cleanup, and typed-error behavior.
- [x] Fail closed on backend launch policy: The first slice may launch only the internal JSON-RPC ACK backend through the two planned modes; user-supplied executables, arbitrary shell strings, and backend path overrides are deferred.
- [x] Treat multiline as visual wrapping only: Enter submits, while true newline editing, history, slash commands, and full editor behavior remain deferred.
- [x] Preserve exact non-empty prompt text: All-whitespace submits are blocked in the composer, but non-empty prompts keep leading/trailing spaces and Unicode through `receivedText`.
- [x] Serialize backend submits through an in-memory FIFO queue: the TUI appends each user prompt immediately, sends only one request at a time over JSON-RPC, marks only queued prompts as `(pending)` in the scrollview, and clears a queued prompt's pending marker when that prompt becomes the active request.
- [x] Bound first-slice text separately from JSON-RPC framing: cap submitted composer prompt text at 64 KiB decoded UTF-8 and cap displayed backend/error output at 128 KiB decoded UTF-8. Future tool output should use preview-plus-saved-full-output behavior instead of giant terminal dumps.
- [x] Use root Rust metadata as the displayed product version: The TUI package may have its own package version for tooling, but the visible KQode version should come from root product metadata.
- [x] Preserve the user's workspace cwd explicitly: Running package scripts from `tui/` must not accidentally display or use `tui/` as the KQode workspace.
- [x] Keep the composer available while a backend request is pending: Enter snapshots and clears the current prompt, appends it to the transcript, and enqueues it behind any active request instead of dropping duplicate submits.
- [x] Define a first-slice responsive contract: Prioritize composer, `workspaceCwd`, and left status hints; hide or compact lower-priority identity/model details before letting the prompt area disappear.
- [x] Make backend failure visible and recoverable by new submit: A failed backend request must not look like a successful empty response or leave the user with no feedback.
- [x] Style all frontend validation errors and backend failure messages with the centralized theme error red so failures are visually distinct from prompts, pending text, and ACK output.
- [x] Separate raw persisted text from rendered display text: Persist exact user/backend text where fidelity matters, but render a sanitized form that escapes or neutralizes terminal control characters, ANSI CSI sequences, OSC sequences, carriage returns, backspaces, and other control bytes so backend/user text cannot manipulate the terminal UI.

### Local Data Handling

- [x] All first-slice session data is local-only. Do not upload, sync, or export session SQLite data unless a future explicit export feature is added.
- [x] Store KQode local data under the current user's profile directory at `~/.kqcode/`. The SQLite database and related local state should live under this directory, not inside the workspace repository.
- [x] Create `~/.kqcode/` with per-user permissions where the platform supports it (for example `0700` for directories and `0600` for SQLite files on Unix-like systems).
- [x] Do not persist environment variables, provider keys, tokens, or raw process environments. Backend diagnostics written to the session store should avoid known secret-bearing fields.
- [x] Provide a documented local path and future deletion command target for clearing sessions; this slice may document manual deletion of `~/.kqcode/` before implementing a first-class delete command.
- [x] Repo memory rows are explicit local records only. Automatic LLM memory extraction/injection and cross-session semantic memory ranking are deferred.

---

## Open Questions
### Resolved During Planning

- [x] Smallest reliable Ink-to-Rust boundary: Start a TUI-owned Rust JSON-RPC stdio backend process and exchange library-framed JSON-RPC request/response messages for this slice.
- [x] Daemon-mode decision: Do not build daemon mode now or later. The backend is a child process owned by the TUI, has no local socket or listening port, and must not continue running after the TUI exits. Long-running jobs are owned by the live child backend only and terminate with it.
- [x] TypeScript package tooling: Use a nested `tui/` package with TypeScript, Ink, React, Vitest, Ink testing utilities, and a dev runner.
- [x] JavaScript toolchain baseline: Use Bun 1.3.x as the nested package manager/script runner with Node 24+ as the source-mode runtime baseline, and record both in package metadata/documentation.
- [x] Backend bootstrap: The TUI/demo path must build or run the Rust JSON-RPC stdio backend from repo source instead of depending on a pre-existing compiled binary.
- [x] Backend launch rule: The default process client builds via Cargo from `repoRoot`, then launches the resulting backend binary with process cwd set to `workspaceCwd`; target-dir binary probing and backend path overrides are deferred until packaging work needs them.
- [x] Standalone launch rule: The packaged executable uses its embedded Rust backend asset instead of Cargo; source-mode development always uses Cargo, regardless of whether generated artifacts exist.
- [x] Distribution rule: Package managers are installers only. They must not require users to build the Rust backend, install Cargo, or keep the TUI as an npm-driven runtime.
- [x] Project file-size rule: Keep source files across Rust and TypeScript at or below roughly 200 lines by splitting modules/components/helpers before they grow too large. Root `main.rs` is the small CLI entrypoint only; all other Rust implementation code should live in focused modules under `src/`. The first integration test file is `tests/main.rs`.
- [x] Implementation-unit boundary: Each U-ID is intended to map to one atomic commit-sized change.
- [x] Cwd semantics: Keep `repoRoot`, `workspaceCwd`, and `tuiPackageRoot` separate; display and backend execution use the `workspaceCwd` captured from the directory where `kqode` was invoked, while product metadata and Cargo launch use `repoRoot`.
- [x] Test workspace fixture: Commit a minimal React app fixture under `tests/fixtures/dummy-react-app/` as a read-only template; do not add a regeneration script unless the fixture later becomes generated or large. Add ignore rules when the fixture is implemented so generated installs/build outputs and transient copied workspaces are not committed.
- [x] Interactive development workspace: Provide Cargo-facing fixture commands that reset `target/kqode-test-workspaces/workspace/` from either the committed simple React fixture or a cached pinned Vite React template. Developers should run `kqode` from the copied workspace, never mutate the committed fixture directly.
- [x] Multiline behavior: Implement visual wrapping only; do not add semantic newline entry in this slice.
- [x] Post-submit display: Append each user prompt to the scrollable body immediately, show `(pending)` only for prompts waiting behind the active request, clear that marker when the prompt starts sending, then append or attach the backend ACK response for that prompt when it completes. Do not add real model/assistant conversation history yet.
- [x] Session persistence behavior: `/resume` is the only active slash command in this slice; it restores persisted user/backend transcript entries, first-slice context, and git repo memory from SQLite, not from an in-memory-only TUI state.
- [x] Session scope behavior: Session lists use the current canonical absolute `workspaceCwd`; a different-workspace session must not be resumable from this TUI instance and must return a typed error if requested directly.
- [x] Empty submit behavior: Block empty or all-whitespace composer submits; still allow the backend message-submit method to ACK an empty string for contract completeness.
- [x] Version source: Display the root Rust package version as the KQode product version, not the nested TUI package version.
- [x] Prompt/output bounds: Enforce a 64 KiB decoded UTF-8 composer prompt cap before submit and a 128 KiB decoded UTF-8 display cap for backend/error output. These are application/UX limits, not JSON-RPC constraints. Transport framing remains library-owned; malformed frames are fatal transport errors, not normal method-level JSON-RPC errors.

### Deferred to Implementation

- [x] Final remaining dependency versions: The first Ink/React/TypeScript/Vitest baseline is locked by `tui/bun.lock`; resolve remaining compatible JSON-RPC, bundling, process-cleanup, and Rust persistence dependencies when their units land.
- [x] Final internal backend argument name: Use a hidden/internal JSON-RPC backend mode and keep it non-public; the exact argument spelling can follow the smallest Rust CLI implementation.
- [x] Exact string-width handling: Start with Ink wrapping and add a width helper only if tests expose a narrow-terminal or wide-character issue.

---

## Planned Libraries and Tooling

- [x] **TUI rendering** (`ink`, `react`): Render the terminal interface with React-style components.
- [x] **TypeScript package/runtime/dev** (`bun`, Node 24+, `typescript`, `tsx`): Install nested TUI dependencies, run package-local scripts, and execute the source-mode Ink entrypoint from the selected workspace cwd.
- [x] **Root automation** (Rust `xtask` helper crate): Provide Cargo-facing commands for fixture preparation, TUI build/test orchestration, release packaging, and CI parity.
- [x] **Frontend bundling** (`rollup` plus TypeScript/Node resolve plugins as needed): Produce an explicit Node-targeted JavaScript bundle used by executable packaging, orchestrated through the Cargo/Bun tooling seam.
- [x] **TUI tests** (`vitest`, `ink-testing-library`): Deterministic component/input tests.
- [x] **TypeScript JSON-RPC** (`vscode-jsonrpc`): Manage JSON-RPC request IDs, response routing, errors, and stream framing over the Rust child process stdio pipes.
- [x] **Rust JSON-RPC** (`lsp-server`, `serde`, `serde_json`): Use proven JSON-RPC stdio message handling on the Rust side while defining only KQode's ACK method and params/result types.
- [x] **Rust session persistence** (`rusqlite` with bundled SQLite, `serde_json`, UUID/time helpers): Store and restore first-slice session metadata, transcript entries, and context rows without adding daemon mode or relying on system SQLite at runtime.
- [x] **Process boundary** (Node built-ins `node:child_process`, `node:path`, `node:fs`; `tree-kill`): Spawn Cargo or the bundled Rust backend without shelling out through `exec`, with timeout and cross-platform process-tree cleanup guards.
- [x] **Standalone executable packaging** (Node SEA plus `postject`): Build a native `kqode` executable that runs the bundled Ink frontend and launches the packaged Rust backend asset.
- [x] **Distribution packaging** (release archives and checksums; registration guide for npm/Homebrew/winget): Produce GitHub Release-ready artifacts and document how package-manager manifests point at those release URLs.
- [x] **GitHub release automation** (GitHub Actions, `gh` CLI or `actions/upload-artifact`/release upload actions): Build cross-platform standalone archives, produce checksums, and upload them to GitHub Releases.
- [x] **JSON-RPC protocol scope** (KQode-owned method names and typed params/results): Use libraries for transport/protocol mechanics, but keep the first method surface intentionally small until the real session protocol exists.

---

## Output Structure

**Review items:**
- [x] Output tree reflects the landed Bun/xtask scaffold, including `.cargo/`, `.run/`, `tui/bun.lock`, runtime helpers, xtask command/support directories, and fixture cache paths.

```text
.cargo/
  config.toml
.run/
  xtask_*.run.xml
tui/
  package.json
  bun.lock
  tsconfig.json
  rollup.config.mjs
  vitest.config.ts
  src/
    main.tsx
    App.tsx
    productMetadata.ts
    runtimePaths.ts
    __tests__/
      runtimePaths.test.ts
    backend/
      backendProcess.ts
      BackendClient.ts
      messageProtocol.ts
      processBackendClient.ts
      sessionProtocol.ts
      __tests__/
        backendProcess.test.ts
        messageProtocol.test.ts
        processBackendClient.test.ts
        sessionProtocol.test.ts
    components/
      BodyPane.tsx
      CwdLine.tsx
      Header.tsx
      HomeScreen.tsx
      PromptComposer.tsx
      ResumeSessionList.tsx
      StatusBar.tsx
      __tests__/
        HomeScreen.test.tsx
        PromptComposer.test.tsx
        ResumeSessionList.test.tsx
    state/
      composerReducer.ts
      sessionTranscriptReducer.ts
      __tests__/
        composerReducer.test.ts
        sessionTranscriptReducer.test.ts
    theme/
      themeConfig.ts
    __tests__/
      App.submit.test.tsx
  main.rs
src/
  backend.rs
  protocol.rs
  session_store.rs
  session_protocol.rs
tests/
  main.rs
  session_store.rs
  fixtures/
    dummy-react-app/
      bun.lock
      package.json
      index.html
      src/
        App.jsx
        main.jsx
xtask/
  Cargo.toml
  src/
    main.rs
    commands/
      fixture/
      tui/
    support/
```

Generated by tests and manual fixture-copy commands after fixture implementation:

```text
target/
  kqode-test-workspaces/
    workspace/  # ignored active development/test workspace copy
    .fixture-sources/
      vite-react-template/  # ignored cached source for the complex fixture
```

Generated by the dist build:

```text
tui/
  dist/
    main.js
    kqode[.exe]
    assets/
      kqode-backend[.exe]  # staging/input artifact for executable packaging
    release/
      kqode-<target>.tar.gz | kqode-<target>.zip
      kqode-<target>.sha256
      checksums.txt
```

The final reviewable runtime artifact is the standalone `tui/dist/kqode[.exe]` executable for the current platform, plus GitHub Release-ready archives and checksums. Staging artifacts under `dist/assets/` are packaging inputs, not extra files the user must invoke. Running from source uses Cargo-facing xtask commands that delegate to Bun/package scripts and Cargo as needed, but packaged users never need Cargo and direct/brew/winget users never need Node or npm. npm, Homebrew, and winget do not read local `dist` subdirectories directly; their package/manifest files should point at published GitHub Release asset URLs.

---

## High-Level Technical Design
> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant User
    participant Composer as Ink PromptComposer
    participant App as Ink App state
    participant Client as BackendClient
    participant Rust as Rust backend
    participant DB as SQLite session store

    App->>Client: Start Rust JSON-RPC stdio backend
    Client-->>App: Backend ready or startup error
    App->>Client: Start or resume session
    Client->>Rust: kqode.session.start/resume
    Rust->>DB: Create/load session metadata, context, transcript, repo memory
    Rust-->>Client: Session id, restored state, and repo memory
    User->>Composer: Type prompt
    Composer->>App: Submit on Enter
    App->>Client: Submit prompt text
    Client->>Rust: kqode.message.submit(sessionId, text)
    Rust->>DB: Persist user/backend transcript entries
    Rust-->>Client: JSON-RPC ACK response over stdout
    Client-->>App: ACK result or error
    App-->>User: Append ACK to scrollable body
```

Source mode and packaged mode share the same JSON-RPC contract. Source mode launches Rust through Cargo for developer convenience; packaged mode materializes the embedded prebuilt Rust backend from the SEA executable and launches that binary directly.

---

## First-Slice JSON-RPC Contract
> *This contract defines the first local session + ACK protocol shape. It is intentionally not the mature agent session protocol, generated schema system, streaming assistant protocol, or cross-process daemon.*

- [x] Process lifecycle: The TUI starts one Rust child backend when the TUI starts, keeps it for the TUI session, and terminates it on TUI exit. If the child backend crashes or the JSON-RPC transport dies, the TUI immediately marks the backend `dead`, shows a red backend-crashed state, marks any in-flight prompt failed, and pauses queued prompts. It must not silently restart in the background. A fresh child backend may be spawned only when the user types and submits a new non-empty prompt. Respawn restores persisted session metadata/context/transcript from SQLite, but does not retry or auto-resubmit interrupted work.
- [x] Transport framing: JSON-RPC 2.0 messages use the selected libraries' stdio stream framing. TypeScript uses `vscode-jsonrpc` stream readers/writers over child stdout/stdin; Rust uses `lsp-server` over stdio. Rust stdout must contain only JSON-RPC protocol frames; diagnostics go to stderr.
- [x] Session start: method `kqode.session.start`, params containing absolute `workspaceCwd`, `appVersion`, and optional `resumeSessionId`; result contains `sessionId`, session metadata, restored context rows, restored transcript entries, and git repo memory rows when a repository is detected.
- [x] Message submit: method `kqode.message.submit`, params containing `sessionId` and a single `text` string, and an ID that Rust mirrors back in the response.
- [x] Session list: method `kqode.session.list`, params containing absolute `workspaceCwd`; the backend canonicalizes it before comparison and returns recent session summaries ordered by `updatedAt` descending for that canonical workspace only.
- [x] Session resume: method `kqode.session.resume`, params containing `sessionId` and absolute `workspaceCwd`; result contains the selected session metadata, context rows, transcript entries, and git repo memory rows when available. If the selected session's stored canonical workspace path differs from the current canonical `workspaceCwd`, return a typed JSON-RPC error and do not change cwd.
- [x] Success response: same ID and result `{ "message": "ACK: message received", "receivedText": string }` for message submits; the TUI displays both the ACK and `receivedText` in the body and persists them through the session store.
- [x] Error response: JSON-RPC 2.0 error response for valid requests with unsupported methods, invalid params, over-limit payloads, or internal backend failures. Malformed transport frames are fatal transport errors handled by the backend client lifecycle.
- [x] Size limits: decoded request text is capped at 64 KiB UTF-8 before submit, and displayed backend/error output is capped at 128 KiB UTF-8. Transport frame parsing/framing stays owned by `vscode-jsonrpc` and `lsp-server`.
- [x] Scope guard: no streaming deltas, tool events, assistant messages, generated protocol package, local socket, listening port, background service, checkpoint/rewind/fork, or cross-process daemon are introduced in this slice.

---

## UI State and Responsive Contract
| State | Body/composer behavior |
|-------|------------------------|
| Initial | Body scrollview shows product-facing preview copy such as "Preview mode: local Rust backend only. No model calls or tools will run." |
| Submitted active | Body scrollview appends the exact active user prompt with no pending marker and clears the composer for the next prompt. |
| Queued pending | Later prompts show `(pending)` until they become the active request; no `(sending...)` marker is shown for the active request. |
| Success | The matching prompt is followed by a product-facing proof entry, e.g. "Rust backend ACK - received: <submitted text>". |
| Backend error | The matching prompt is followed by a red "Rust backend failed" message; later queued prompts remain queued unless the backend lifecycle is fatal. |
| Backend crashed | Body scrollview shows a red crash message such as "Rust backend crashed. Current request failed. Type a new prompt to restart the backend."; queued prompts remain visible but paused. |
| Over limit | Composer/body feedback says the prompt exceeds the 64 KiB limit and must be shortened before submit, rendered in theme error red. |
| Resume list | The `/resume` list renders directly under the input composer, shows at most 5 visible session rows, highlights the selected row, and supports Up/Down arrow navigation through the session list. |
| Loading animation | While backend startup, session list fetch, or session restore is in progress, show a compact spinner/pulsing ellipsis in the affected area. The animation must be cosmetic only, stop on success/error/cancel, and degrade to static text when animation is unavailable. |

| Viewport | Responsive behavior |
|----------|---------------------|
| 80+ columns | Show full logo/title/version, full cwd, full left hints, and right-side model label. |
| 60-79 columns | Preserve composer, cwd, `/ commands`, `@ mention`, and `? help`; hide the model label before hiding input affordances. |
| 40-59 columns | Preserve composer and cwd; compact status hints to `/ · @ · ?`; hide model/version/logo detail as needed. |
| Below 40 columns or below 12 rows | Degrade gracefully without crashing; composer and cwd remain highest priority, while decorative/status details and status hints may disappear. |

| BodyPane overflow | Behavior |
|-------------------|----------|
| Height | BodyPane owns the rows left after header, cwd, composer, and status bar render. |
| Append behavior | Appends initial, user prompt, success, and error entries; auto-scrolls to the newest entry after every append. |
| Queue behavior | User prompts are ordered by submit sequence; one item is active with no marker, later items show `(pending)`, and the queue drains FIFO as ACK/error results arrive. |
| Pending behavior | A queued prompt's `(pending)` marker is removed when that prompt becomes the active request. |
| Overflow marker | If older entries are clipped, show a compact marker such as `... earlier output hidden ...` at the top of the visible body. |
| Manual scroll | Manual scroll controls are out of scope for this slice. |

| Picker-open vertical layout | Behavior |
|-----------------------------|----------|
| Order | Header, BodyPane, cwd line, input composer, `/resume` list/loading row, bottom status bar. |
| Body shrink | When the `/resume` list is open, BodyPane gives up rows first so cwd, composer, visible picker rows, and status bar remain visible where possible. |
| List height | Use `min(5, availableRowsForPicker)` visible rows. If fewer than 5 rows are available, show as many as fit without hiding cwd or composer. |
| Short terminal | Below the normal minimum height, preserve cwd, composer, and at least one picker row when possible; hide decorative/header/status details before hiding the composer. |
| Empty/loading states | Loading and empty-state messages occupy the picker area under the composer and do not enter the transcript. |

| Loading input state | Behavior |
|---------------------|----------|
| Backend/session startup | Composer may accept typed draft text, but Enter is disabled until a session/backend is ready; the draft is preserved on startup success or failure. |
| `/resume` list fetch | Composer input is temporarily in command mode; typing is not appended to the prompt while the list is loading. Escape cancels loading when possible and restores the prior draft. |
| Session restore | Composer is disabled while restored transcript/context is applied; any pre-existing draft is preserved and restored after success or failure. |
| Loading failure | Stop the animation, show a red error in the affected area, keep the current session/draft unchanged, and return focus to the composer unless the backend is dead. |

| Non-color state markers | Behavior |
|-------------------------|----------|
| Errors | Every red error also includes a non-color marker such as `ERROR:` or `!` so the state remains clear with colors disabled. |
| Selected resume row | The highlighted `/resume` row also uses a non-color pointer such as `>` so selection remains visible without color or inverse styling. |
| Loading | Animated loading has a static text fallback such as `Loading...`; this text remains visible when animation/color is unavailable. |
| Pending | Queued prompts keep the literal `(pending)` marker independent of color. |

---

## Implementation Units
Each implementation unit is intended to be landed as one atomic commit-sized change. If implementation reveals a unit is too large to review as one commit, split the unit without renumbering existing U-IDs.

After each commit-sized unit lands, run code review on the completed unit, then pause for user review and wait for explicit consent before starting the next unit.

### Implementation Gates

| Gate | Goal | Required units | Explicitly excluded from the gate |
|------|------|----------------|-----------------------------------|
| G1. Source-mode homepage ACK | Prove AE1-AE3 with a local source-mode Ink UI and Rust ACK backend. This is the origin validation gate and must be runnable before persistence, standalone packaging, or release automation lands. | U1, U2, U3, U4, U5, U8, U9, U6 | SQLite sessions, `/resume`, repo memory, standalone executable, release archives, GitHub Release workflow |
| G2. Durable session resume | Add SQLite persistence, `/resume`, restored transcript/context, and same-workspace session continuation after G1 works. | U11, U12 | Standalone executable and release automation |
| G3. Local standalone executable | Package the working TUI + Rust backend into a local standalone executable after G1/G2 behavior is stable. | U7 | GitHub Release upload and package-manager registration |
| G4. Release assets | Produce GitHub Release-ready archives/checksums and CI upload after the local standalone executable works. | U10, U13 | npm publish, Homebrew tap submission, winget submission, signing/notarization, auto-update |

### U1. Verify the Bun-powered nested Ink package scaffold

**Goal:** Verify and adjust the existing TypeScript package infrastructure under `tui/` so the Bun-managed Ink TUI can be developed, launched, and tested through Cargo-facing commands without becoming a root JavaScript workspace.

**Requirements:** R12, R13, R18.

**Origin trace:** Supports F1/F2 scaffolding; no direct acceptance example.

**Dependencies:** None.

**Implementation commit:** `99949b9fe7698a1f0b87acda232281cbaeb4d81d` (`feat(tui): scaffold Bun-powered Ink workspace`).

**Approach:**
- [x] Keep the nested Bun-managed package rather than introducing a root JS workspace.
- [x] Convert the root Cargo manifest into a package-plus-workspace manifest with members `[".", "xtask"]` and a resolver compatible with edition 2024, while keeping runtime code in the existing root package.
- [x] Preserve strict TypeScript ESM and React JSX configuration with `tsx` as the source-mode entrypoint runner.
- [x] Preserve package-local scripts for TUI internals, but expose contributor-facing workflows through `cargo xtask tui-install`, `cargo xtask tui-typecheck`, `cargo xtask tui-test`, and `cargo xtask tui-dev` from the repository root.
- [x] Add `.cargo/config.toml` so `cargo xtask ...` resolves to `cargo run -p xtask -- ...` without requiring contributors to remember the longer form.
- [x] Preserve dependency/build artifact ignores for package-local dependencies, TUI build output, fixture-local outputs, and generated workspaces.
- [x] Add a tiny committed dummy React app fixture for cwd/workspace tests; treat the committed fixture as read-only seed data and reset ignored working copies under `target/kqode-test-workspaces/`.
- [x] Add fixture preparation commands for both the committed simple React fixture and a cached pinned Vite React template, with the complex fixture cache kept under `target/kqode-test-workspaces/.fixture-sources/`.
- [x] Make `tui-dev` ensure an ignored workspace exists, prompt for a fixture when missing, then run the TUI entrypoint from `target/kqode-test-workspaces/workspace/` so `workspaceCwd` displays the fixture cwd rather than `tui/`.
- [x] Add lightweight runtime helpers for root product metadata and path roles: read the displayed version from root `Cargo.toml`, resolve `repoRoot` from `tuiPackageRoot`, and normalize `workspaceCwd` from `process.cwd()`.
- [x] Remove the duplicate `.github/copilot-instructions.md` path and keep repository instructions in `AGENTS.md`.
- [x] Keep README changes for the final submit/backend-response unit after the demo path exists.

**Patterns to follow:**
- [x] Keep the runtime Rust code in the current root package; adding minimal `xtask` automation wiring is allowed, but do not split the runtime into the future planned crate workspace in this slice.
- [x] `cargo xtask ...` must work from the repository root after U1; do not document xtask commands before the workspace membership and Cargo alias are wired.
- [x] Existing docs describe TypeScript as a surface layer, not the core runtime owner.
- [x] Do not run mutation tests or interactive `kqode` sessions directly in `tests/fixtures/dummy-react-app/`; always copy to `target/kqode-test-workspaces/` first.
- [x] Root-level docs should prefer Cargo-facing commands such as `cargo xtask tui-dev` and `cargo xtask fixture-prepare-react-simple` over asking contributors to remember package-manager commands directly.

**Test scenarios:**
- [x] Happy path: `tui/src/__tests__/runtimePaths.test.ts` verifies `repoRoot` is derived from `tuiPackageRoot` and `workspaceCwd` is normalized from the selected launch cwd.
- [x] Happy path: add an App smoke render test for the existing TUI implementation that verifies the product version, workspace cwd, and preview backend-only copy render from props.
- [x] Happy path: xtask command registration tests reject duplicate command names so newly added fixture/TUI commands remain addressable through one registry.
- [x] Happy path: fixture selection accepts the 1-based menu number, short label such as `react-simple`, and full command name such as `fixture-prepare-react-simple`.
- [x] Error path: workspace reset preserves an existing target workspace when the requested source fixture directory is missing.
- [x] Integration path: the Cargo-facing TUI typecheck and test commands run the nested package through Bun without requiring direct package-manager commands in normal contributor docs.

**Verification:**
- [x] The TUI package can be installed, typechecked, tested, and launched from an ignored fixture workspace without requiring a root JavaScript workspace.
- [x] `cargo xtask help` shows the registered fixture and TUI commands, and each command resolves from the repository root.
- [x] Rust build artifacts, Bun/Node package artifacts, fixture outputs, and generated workspaces remain ignored appropriately.

---

### U2. Add the Rust JSON-RPC stdio backend mode
**Goal:** Replace the starter-only Rust binary behavior with a minimal hidden backend mode that runs a JSON-RPC stdio loop, handles message submit requests, returns ACK responses, and stays separate from future agent behavior.

**Requirements:** R9, R11. **Technical constraints:** T1.

**Origin trace:** Supports the backend leg of F2 and is a prerequisite for AE3.

**Dependencies:** None.

**Implementation commit:** `f86f87f31e74ef3f27cd7ff22b70665e02b66b2e` (`feat(backend): add JSON-RPC ACK backend`).

**Approach:**
- [x] Add a small internal JSON-RPC stdio backend mode selected by a command-line argument, with no model/provider/tool logic.
- [x] Use `lsp-server` to read JSON-RPC requests from stdin and write JSON-RPC responses to stdout.
- [x] Support only the message-submit method in this unit; do not add a daemon, tool dispatcher, or streaming assistant loop. U11 adds the separate first-slice session persistence methods.
- [x] Define JSON-RPC method/event names, response status strings, error kinds, and non-obvious numeric limits as enums or named constants in `src/protocol.rs`; do not scatter hard-coded strings like `kqode.message.submit` or magic numbers through handlers/tests.
- [x] Treat malformed transport/framing input as a fatal transport error handled by the backend client lifecycle; return JSON-RPC errors through the library response path for valid requests with unsupported methods or invalid params.
- [x] Preserve a harmless default path for running the binary without the backend mode.
- [x] Keep error behavior explicit rather than silently treating read/write failures as success.
- [x] Configure `Cargo.toml` so the binary target uses root `main.rs`; keep that file as argument dispatch only. Put backend loop and protocol types in modules under `src/` when implementation would otherwise push a file above roughly 200 lines.
- [x] Use the hidden backend argument `--__kqode-json-rpc-backend`; reject extra backend-mode arguments and unsupported non-backend arguments with visible stderr.
- [x] Expose `kqode` as both the library crate and binary target so tests can import protocol constants and spawn the compiled `CARGO_BIN_EXE_kqode` binary.
- [x] Keep U2 message-submit params intentionally text-only (`{ "text": string }`) with unknown fields denied; session-bound params land with the later session-persistence methods.
- [x] Handle only JSON-RPC request frames in the backend loop: ignore notifications, return method/params errors for request-level failures, and treat unexpected JSON-RPC responses as fatal transport errors.

**Patterns to follow:**
- [x] Keep dependencies minimal; JSON serialization/parsing dependencies are acceptable because JSON-RPC is now the transport requirement.
- [x] Keep this in the current single package; do not create the future crate workspace as part of this slice.
- [x] Prefer focused modules/components/helpers over monolithic files; no source file in this slice should exceed roughly 200 lines unless there is a clear reason documented in review.
- [x] Follow the project constants/enums rule: protocol names and magic values belong in enums/constants that tests import, not in repeated string/number literals.
- [x] Keep U2 dependency additions limited to `lsp-server`, `serde`, and `serde_json`, with `Cargo.lock` updated by the same unit.

**Test scenarios:**
- [x] Happy path: a JSON-RPC `kqode.message.submit` request containing `hello from tui` returns a success response with `message: "ACK: message received"` and `receivedText: "hello from tui"`.
- [x] Happy path: tests build requests through the protocol enum/constant rather than duplicating method-name string literals.
- [x] Edge case: Unicode text and newline characters inside JSON-RPC params are preserved exactly in `receivedText`.
- [x] Edge case: an empty string request returns a valid ACK response for backend contract completeness, even though the TUI blocks empty submits.
- [x] Error path: malformed transport/framing input exits non-successfully with visible stderr and is handled as a fatal transport error by the client lifecycle.
- [x] Error path: unsupported method or invalid params returns a JSON-RPC error response.
- [x] Error path: invalid backend invocation or unexpected input failure exits non-successfully with visible stderr.
- [x] Integration: the Rust test exercises the compiled binary path rather than only a helper function.
- [x] Error path: backend mode rejects extra arguments, unsupported top-level arguments fail visibly, and default no-argument invocation remains harmless.
- [x] Error path: an unexpected JSON-RPC response received on stdin exits non-successfully with visible stderr instead of being ignored.
- [x] Integration path: the Rust RPC test helper writes `Content-Length` framed requests, parses framed stdout responses, and can exercise multiple requests against one backend process.

**Verification:**
- [x] The backend mode provides a deterministic local JSON-RPC ACK proof and does not invoke provider, agent, or tool behavior.
- [x] U2 is delivered by commit `f86f87f31e74ef3f27cd7ff22b70665e02b66b2e`, covering `main.rs`, `src/backend.rs`, `src/protocol.rs`, `src/lib.rs`, JSON-RPC dependencies, and compiled-binary integration tests.

---

### U3. Build the static home screen components
**Goal:** Implement the Copilot CLI-style KQode home screen as composable Ink components with centralized theme tokens.

**Requirements:** R1, R2, R3, R4, R5, R12, R13, R14, R18.

**Origin trace:** Covers F1 and AE1.

**Dependencies:** U1.

**Approach:**
- [x] Centralize GitHub/Gemini-inspired foreground colors plus message/input background tokens in `themeConfig`.
- [x] Include an error red token and use it for frontend validation failures and backend failure messages.
- [x] Use component props for version, `workspaceCwd`, model label, body output, and pending/error state.
- [x] Render a visual composer slot/shell so the first-screen layout can be validated before interactive composer behavior lands.
- [x] Render the bottom hints as inert muted affordances; they must not open command/help/mention behavior.
- [x] Right-align or degrade the model label based on terminal width while keeping core prompt affordances visible.
- [x] Support a practical minimum viewport of roughly 40 columns by 12 rows; below that, preserve the composer, cwd, and left hints first, then compact or hide model/version/logo detail.
- [x] Treat the logo as KQode-inspired terminal art, not copied product source.
- [x] Display the KQode product version from `repoRoot` metadata rather than the nested TUI package version.
- [x] Display `workspaceCwd` as the command invocation directory, including when tests run the TUI from the dummy React app fixture.
- [x] Keep optional message background rendering internal and Gemini-inspired: body prompt blocks may use half-line `▄`/`▀` rows, while the composer uses row background without changing vertical row accounting.

**Patterns to follow:**
- [x] `docs/kqode_architecture_spec.md` keeps UI surfaces replaceable; layout components should remain display-only.
- [x] `docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md` provides the visual wireframe and status labels.
- [x] Gemini CLI background rendering is product-behavior reference only: copy the half-line block idea, not source.

**Test scenarios:**
- [x] Covers AE1. Happy path: initial render includes the logo, `KQode`, root product version, cwd line, prompt region, bottom hints (`/ commands`, `@ mention`, `? help`), and `GPT-5.5`.
- [x] Covers AE1. Happy path: when launched from a copied dummy React workspace under `target/kqode-test-workspaces/`, the cwd line displays that copied workspace rather than `tui/`, the KQode repo root, or the committed fixture template.
- [x] Covers AE1. Happy path: the first screen uses centralized GitHub/Gemini-inspired foreground tokens for foreground, muted text, accents, errors, and scrollbars.
- [x] Happy path: the theme exposes an error red token for frontend/backend failure rendering.
- [x] Happy path: optional body prompt background rendering uses full-width half-line block rows and remains disabled by default in normal body rendering.
- [x] Happy path: composer row background renders without adding extra rows, so body height, cwd, composer, and status layout stay stable.
- [x] Edge case: a long `workspaceCwd` is truncated or compacted from the left while the composer and status bar remain visible.
- [x] Edge case: around 40 columns by 12 rows, the composer, `workspaceCwd`, and left-side status hints remain visible while lower-priority details compact or disappear.
- [x] Edge case: rendered output remains readable when color styling is stripped by the test renderer.

**Verification:**
- [x] The first rendered frame feels like the intended KQode home screen and keeps future output space available.

---

### U4. Implement composer input and wrapping behavior
**Goal:** Add focused prompt entry that accepts typed text, visually wraps long input, and treats Enter as submit.

**Requirements:** R4, R6, R7, R8, R12.

**Origin trace:** Covers the input leg of F2 and AE2.

**Dependencies:** U1, U3.

**Approach:**
- [x] Keep printable input, backspace/delete, Enter submit, and empty-submit behavior explicit in composer state.
- [x] Use Ink wrapping for the first slice; only add a separate width utility if the component tests prove it is needed.
- [x] Treat typed/pasted printable text as composer content, but do not require bracketed-paste or real newline editing support in this slice.
- [x] Block only empty or all-whitespace submits; preserve leading/trailing spaces for non-empty prompts.
- [x] Enforce the 64 KiB prompt-size ceiling before submit with visible feedback instead of sending an over-limit JSON-RPC request.
- [x] Keep slash, mention, help, and Tab behavior inert: `/`, `@`, and `?` are normal typed characters, and Tab should not trigger navigation.
- [x] On submit, emit an exact prompt snapshot to App and clear the composer so further typing can continue while App owns backend queue state.
- [x] Cap the composer to a small visible height and scroll/clip to the latest prompt lines so long prompts do not push the cwd and status bar off screen.
- [x] Render composer rows with the internal input background when color/background rendering is enabled, but do not add extra top/bottom padding rows to the composer.
- [x] Keep composer cursor placement tied to the active text row; single-line, authored multiline, and soft-wrapped prompts must not place the cursor on the cwd row or one row above the text.

**Patterns to follow:**
- [x] External Ink guidance favors `useInput` for keyboard handling and component/reducer tests for deterministic behavior.
- [x] The origin requirement defines multiline as wrapping behavior and Enter as submit.

**Test scenarios:**
- [x] Covers AE2. Happy path: typing a long prompt preserves all content and wraps within constrained width.
- [x] Happy path: printable characters append to the composer and backspace removes the last character.
- [x] Edge case: pressing Enter with empty or whitespace-only content does not submit.
- [x] Edge case: non-empty text with leading/trailing spaces submits the exact composer snapshot.
- [x] Edge case: `/`, `@`, and `?` remain typed content rather than opening UI modes.
- [x] Edge case: Tab does not navigate or mutate the prompt in this slice.
- [x] Edge case: typed/pasted printable text is retained as composer content; pasted newline preservation is not required for the interactive TUI path.
- [x] Edge case: after submit, the composer clears and accepts new input while the previous prompt is being handled by App queue state.
- [x] Edge case: content beyond the composer height cap remains in state and submits exactly, while the visible composer keeps the latest lines in view.
- [x] Error path: over-limit input is blocked before backend submit with visible composer/body feedback.
- [x] Edge case: cursor placement is verified for single-line, authored multiline, and soft-wrapped composer text.
- [x] Edge case: composer background color preserves existing visible row counts and bottom-sticky layout.

**Verification:**
- [x] The composer remains focused and usable as a prompt bar, with Enter reserved for submission.

---

### U5. Define the JSON-RPC message protocol

**Goal:** Define the TypeScript message protocol types and `vscode-jsonrpc` request wiring for `kqode.message.submit`.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Supports the protocol leg of F2 and is a prerequisite for AE3.

**Dependencies:** U1, U2.

**Approach:**
- [ ] Add `vscode-jsonrpc` to the TUI package dependencies.
- [ ] Define a narrow backend client interface that returns either an ACK result or an explicit error.
- [ ] Define minimal shared TypeScript request/response types for the `kqode.message.submit` method.
- [ ] Use `vscode-jsonrpc` to send the message-submit request, route responses by request ID, surface JSON-RPC errors, and avoid hand-rolled parsing/framing.

**Patterns to follow:**
- [ ] Keep method names KQode-owned even though transport mechanics come from `vscode-jsonrpc`.
- [ ] Do not introduce generated protocol packages or full agent session event types in this slice.

**Test scenarios:**
- [ ] Happy path: the TypeScript protocol helper sends `kqode.message.submit` through `vscode-jsonrpc` and receives an ACK success response.
- [ ] Edge case: Unicode, leading/trailing spaces, and JSON string newline characters are preserved in `receivedText` at the protocol layer.
- [ ] Error path: JSON-RPC method errors surface as typed backend client errors.

**Verification:**
- [ ] The message protocol unit proves request/response typing and library-backed response routing without launching a Rust child process.

---

### U8. Implement the guarded source backend process launcher

**Goal:** Add the source-mode backend process launcher with cwd/root handling, environment hardening, timeout, and process-tree cleanup.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Supports the backend process leg of F2 and is a prerequisite for AE3.

**Dependencies:** U1, U2, U5.

**Approach:**
- [ ] Add `tree-kill` and related typings if needed.
- [ ] Add the source-mode Cargo backend build/launch path.
- [ ] Resolve the Rust backend from `repoRoot` rather than assuming the current process cwd is `tuiPackageRoot`.
- [ ] Account for platform executable naming, including Windows.
- [ ] Do not assume `target/debug` already exists on a fresh checkout; the default client/test harness should invoke Cargo from canonical `repoRoot` using trusted repo Cargo configuration before launching the compiled backend in `workspaceCwd`.
- [ ] Spawn the Rust backend with `shell: false`, keep stdin/stdout open for library-framed JSON-RPC during the TUI session, and keep stderr separate for diagnostics.
- [ ] Preserve `workspaceCwd` for backend process execution.
- [ ] Use a strict environment allowlist for both build and backend launch and do not pass user-provided command strings into the launcher.
- [ ] Preserve only platform-required variables. On Windows include `PATH`, `PATHEXT`, `SystemRoot`/`WINDIR`, `TEMP`/`TMP`, and `USERPROFILE`/`HOME`. On Unix include `PATH`, `HOME`, `TMPDIR`, plus intentional terminal/color variables. Add Cargo/Rustup variables only when required for source-mode build, never log the environment, and strip secret-looking variables such as `*_TOKEN`, `*_SECRET`, `*_KEY`, provider keys, registry tokens, and SSH agent variables.
- [ ] In source mode, buffer and cap Cargo stderr for diagnostics but do not treat stderr presence alone as failure.
- [ ] Enforce a startup timeout and per-request timeout, terminate the process tree on TUI exit/fatal backend failure, and surface timeout separately from malformed JSON-RPC and non-zero exit.
- [ ] Convert missing executable, non-zero exit before/while serving, malformed protocol output, backend JSON-RPC error response, and timeout into explicit client errors.

**Patterns to follow:**
- [ ] Node child-process guidance recommends `spawn` with argument arrays for local process execution.
- [ ] KQode's architecture keeps process execution details out of display components.

**Test scenarios:**
- [ ] Integration: the client works when invoked from inside `tui/` while preserving the original workspace cwd captured before package-script execution.
- [ ] Integration: the client works when `workspaceCwd` is the dummy React app fixture, proving backend execution and visible cwd are tied to the user's launch directory rather than the TUI package.
- [ ] Integration: the documented fresh-checkout path builds or runs the Rust backend before the first submit instead of failing with a missing executable.
- [ ] Integration: source-mode uses Cargo regardless of whether generated package artifacts exist.
- [ ] Error path: malicious workspace `.cargo/config.toml` or PATH entries do not influence the trusted repo-root Cargo build step.
- [ ] Error path: timeout terminates the backend process and returns a visible timeout error without leaving an orphaned child.
- [ ] Error path: missing backend executable returns a typed client error.
- [ ] Error path: Cargo stderr without non-zero exit is retained as diagnostics and does not fail startup by itself.

**Verification:**
- [ ] The launcher starts and stops the source-mode backend through one guarded path without exposing process details to display components.

---

### U9. Implement the process JSON-RPC backend client
**Goal:** Connect the backend process launcher to `vscode-jsonrpc`, send message-submit requests, parse ACK responses, and own backend connection lifecycle.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Covers the client-side backend leg of F2 and is a prerequisite for AE3.

**Dependencies:** U5, U8.

**Approach:**
- [ ] Start one backend process for the TUI session and create a `vscode-jsonrpc` connection over its stdio pipes.
- [ ] Expose `message.submit` through the narrow backend-client interface for G1. U11/U12 extend the interface with `session.start`, `session.list`, and `session.resume`.
- [ ] Model backend lifecycle states as `starting`, `ready`, `closing`, and `dead`.
- [ ] Recoverable JSON-RPC method errors keep the process alive; fatal process/transport errors dispose the connection and mark it `dead`.
- [ ] On the next non-empty submit after `dead`, respawn the backend, restore the active session from SQLite, and continue from persisted state. Do not restart silently, do not provide a separate retry action, and do not automatically replay interrupted in-flight requests.
- [ ] Enforce per-request timeout separately from startup timeout.

**Patterns to follow:**
- [ ] Keep the process client independent from display components; App receives a narrow backend-client interface.

**Test scenarios:**
- [ ] Integration: the process client starts the Rust stdio backend, sends a JSON-RPC message-submit request, and receives the ACK message plus exact `receivedText`.
- [ ] Edge case: max-size allowed prompt returns exact `receivedText`, while over-limit prompt is rejected before spawn by the composer/App path; oversized display output is capped at 128 KiB without changing persisted exact text.
- [ ] Error path: malformed backend protocol output or JSON-RPC error response returns a typed client error.
- [ ] Error path: timeout kills the child, marks the client dead, shows a red backend-crashed error for the in-flight prompt, pauses queued prompts, and only a new non-empty submit respawns and restores persisted session state.

**Verification:**
- [ ] The TUI has a deterministic JSON-RPC backend client seam that proves local Rust communication without exposing process details to display components.

---

### U11. Add the SQLite session store and session JSON-RPC methods
**Goal:** Add a Rust-owned local SQLite session store under `~/.kqcode/` and expose narrow JSON-RPC methods for starting, recording, listing, and resuming first-slice sessions.

**Requirements:** R21, R22, R23, R24, R25, R26, R27. **Technical constraints:** T1.

**Origin trace:** Extends F2 and AE3 so the ACK demo is durable and resumable instead of memory-only.

**Dependencies:** U2, U5.

**Approach:**
- [ ] Add SQLite storage under the Rust backend, not under display components or TUI-only state.
- [ ] Use `rusqlite` with bundled SQLite (or an equivalent self-contained SQLite strategy) so packaged backends do not require system SQLite, pkg-config, vcpkg, or platform-specific runtime libraries.
- [ ] Place the SQLite database under `~/.kqcode/` by default, with a test-only override so integration tests do not write to the real user profile.
- [ ] Create a small schema with `sessions`, `session_messages`, `session_context`, and `repo_memory` tables. Include stable ids, canonical absolute `workspace_cwd`, git root/repo key when detected, relative workspace subpath from the git root, `created_at`, `updated_at`, title/last-prompt metadata, message order, role/kind, status, text/content JSON, first-slice context fragments, and repo-memory kind/source fields.
- [ ] Keep writes explicit and ordered: start session, record each user prompt when it is sent to the backend, record backend ACK/error, and update session `updated_at`/last prompt. Do not persist frontend-only queued prompts or validation-only errors in this slice.
- [ ] Record repo memory only through an explicit session API/event with structured content. This slice proves storage and restore only; it must not infer broad semantic memory from arbitrary prompt text and must not inject repo memory into an LLM context because no LLM run exists in this slice.
- [ ] Add JSON-RPC methods for `kqode.session.start`, `kqode.session.list`, `kqode.session.resume`, and extend `kqode.message.submit` to require `sessionId`.
- [ ] Session listing is always scoped to the current canonical absolute `workspaceCwd`; all-workspace browsing is out of scope for this slice. Canonicalization should resolve symlinks with best-effort realpath, normalize separators, and apply platform-appropriate case normalization where the filesystem is case-insensitive.
- [ ] Restore backend-observed transcript/context rows in stable message order and restore repo-memory rows for the session's git repo key. Frontend-only queued prompts from a crashed TUI are not restored because they were never sent to the backend.
- [ ] Keep this as first-slice persistence only: no full trace replay, checkpoint/rewind/fork, rename/delete/export, cost accounting, or model/tool session state.

**Patterns to follow:**
- [ ] KQode architecture already assigns durable session state to Rust and SQLite indexes; keep the TUI as a protocol client.
- [ ] Reference research shows useful precedent for project-scoped session files/lists, workdir validation, and replayable append-style records.

**Test scenarios:**
- [ ] Happy path: starting the backend creates a SQLite database and a session row for the current `workspaceCwd`.
- [ ] Happy path: the SQLite database is created under a test-overridden KQode home path and the production default resolves under `~/.kqcode/`.
- [ ] Happy path: packaged backend smoke tests confirm SQLite open/read/write works on each supported target without system SQLite dependencies.
- [ ] Happy path: starting a session inside a git repo stores git root/repo identity plus the relative workspace subpath and returns explicitly stored repo-memory rows for that repo.
- [ ] Happy path: submitting a prompt records the user message and matching ACK response with exact text and stable order.
- [ ] Happy path: explicitly written repo-memory rows are restored for later sessions in the same git repo, including sessions launched from subfolders with distinct relative workspace subpaths.
- [ ] Happy path: listing sessions returns current-workspace sessions ordered by most recently updated.
- [ ] Happy path: resuming a session returns metadata, context rows, repo memory rows, and transcript entries in display order.
- [ ] Edge case: starting or resuming outside a git repo skips repo memory and still restores session transcript/context.
- [ ] Edge case: symlink/case-variant paths that canonicalize to the same workspace can resume; paths that canonicalize differently return a typed JSON-RPC error and do not switch cwd.
- [ ] Edge case: malformed/corrupt persisted rows fail visibly and do not crash the TUI process.
- [ ] Error path: SQLite open/write failure returns an explicit backend error that renders red in the TUI.

**Verification:**
- [ ] A killed and restarted first-slice TUI can recover the persisted ACK transcript for a selected session without requiring daemon mode.

---

### U6. Wire App submit state and ACK output
**Goal:** Connect the composer, backend client, and scrollable body pane so Enter appends user prompts immediately, queues consecutive submits, and displays the matching Rust ACK/error for each prompt.

**Requirements:** R8, R9, R10, R11, R12, R19, R20. **Technical constraints:** T1.

**Origin trace:** Covers F2 and AE3 end-to-end.

**Dependencies:** U3, U4, U5, U9.

**Approach:**
- [ ] Inject the backend client into App state so tests can use a mock and production can use the process client.
- [ ] For G1, accept prompt submissions without durable session state. U11/U12 later add active `sessionId` state and transcript rehydration.
- [ ] Use a submitted prompt snapshot so the backend receives exactly what the composer submitted.
- [ ] Append every submitted user prompt to the body immediately and clear/refocus the composer so the next prompt can be typed while the backend is busy.
- [ ] Maintain an in-memory FIFO queue of submitted prompt snapshots; send only one backend request at a time and start the next queued request after the current request returns ACK or error.
- [ ] Define body states explicitly: initial backend explanation/tip, active user prompt without a marker, queued user prompt with `(pending)`, success output labeled as a Rust backend ACK, and red error output.
- [ ] Render the main body as a scrollview-like transcript that appends user prompt, ACK/status/error entries for this slice.
- [ ] Render only sanitized display text for user prompts, backend ACK payloads, backend errors, validation errors, and restored transcript entries. Persisted raw text must not be passed directly to Ink `Text`.
- [ ] On success, append or attach the matching ACK message for the active prompt.
- [ ] On failure or timeout, show a visible red body error for the active prompt and keep later queued prompts in order unless the backend lifecycle is fatal.
- [ ] Keep G1 transcript state in memory. U11/U12 later persist transcript/context changes through the backend client.
- [ ] Keep R11 concrete: App submit must use only the backend client seam, and display components must not import backend/process logic.
- [ ] Leave README terminal-run documentation for the standalone executable unit after the directly-callable artifact exists.

**Patterns to follow:**
- [ ] Layout components stay display-only; App owns cross-component state and backend calls.
- [ ] Scope boundaries keep slash commands other than `/resume`, model selection, tools, and provider calls unavailable.

**Test scenarios:**
- [ ] Covers AE3. Happy path: typing `hello from tui` and pressing Enter appends the user prompt immediately, sends it through the backend client, and appends `ACK: message received` in the body scrollview.
- [ ] Covers AE3. Integration: Unicode and leading/trailing spaces are preserved in the backend result's `receivedText`.
- [ ] Happy path: submitting three prompts quickly displays all three user prompts immediately, marks only the second and third as `(pending)`, sends requests to the backend one at a time, and removes each `(pending)` marker when that prompt becomes active.
- [ ] Happy path: successful output is visibly labeled as a Rust JSON-RPC ACK / no-model-call proof.
- [ ] Edge case: empty or all-whitespace Enter does not call the backend client and does not change body output.
- [ ] Edge case: pressing Enter while a request is active queues the new prompt rather than dropping it or sending concurrently.
- [ ] Edge case: successful submit clears the composer for the next prompt and leaves the matching prompt/ACK pair visible in the scrollview.
- [ ] Error path: backend failure displays a visible red error for the matching prompt and does not silently mark queued prompts as successful.
- [ ] Error path: frontend validation failures such as over-limit prompt input render in the same theme error red.
- [ ] Error path: prompts or backend errors containing ESC, ANSI CSI, OSC, carriage returns, backspaces, or other terminal-control characters render as safe escaped text and do not clear the screen, move the cursor, set clipboard content, overwrite lines, or change styling unexpectedly.
- [ ] Error path: display components have no imports or props that expose provider, tool, session, or model-call behavior.

**Verification:**
- [ ] The first interaction proves "Ink sends text, Rust acknowledges receipt, TUI displays the ACK" without invoking any provider, agent loop, or tool.

---

### U12. Implement `/resume` session picker and restore flow
**Goal:** Make `/resume` the first active slash command: list persisted sessions, let the user choose one, restore transcript/context, and continue appending prompts to that session.

**Requirements:** R10, R12, R21, R22, R23, R24, R25, R26, R27, R29.

**Origin trace:** Extends F1/F2 by adding durable session selection and continuation.

**Dependencies:** U3, U4, U6, U11.

**Approach:**
- [ ] Treat `/resume` as a command only when the composer content is exactly `/resume` after trimming. Other slash-prefixed text remains normal prompt content for this slice.
- [ ] On `/resume`, call the backend session list method for the current absolute `workspaceCwd` and render only sessions whose stored canonical workspace path matches it, with title/id, updated time, workspace path, and last prompt.
- [ ] While the session list is loading, render a compact loading animation directly under the input composer in the same area where the list will appear.
- [ ] During session-list loading, treat the composer as command/list mode: do not append typed characters to the prompt, preserve the pre-`/resume` draft, and let Escape cancel back to the composer when possible.
- [ ] Render the session list directly under the input composer, not as a full-screen overlay. Show a 5-row visible window over the session list, highlight the currently selected row, and scroll the window as the selection moves.
- [ ] Prefix the selected session row with a non-color pointer such as `>` in addition to any color/inverse highlight.
- [ ] Apply the picker-open vertical layout contract: BodyPane shrinks first, list height is `min(5, availableRowsForPicker)`, and cwd/composer remain higher priority than decorative/status details.
- [ ] Use Up/Down arrow keys to move the highlighted selection; Enter resumes the highlighted session; Escape cancels and returns focus to the composer.
- [ ] On selection, call session resume, replace the visible transcript/context with restored entries, set the active `sessionId`, and keep the composer focused for the next prompt.
- [ ] During session restore, disable prompt submit and preserve any draft text until restore completes or fails.
- [ ] If a direct resume request somehow targets a session from another canonical workspace path, show a red error and keep the current session; never switch cwd or offer cross-workspace resume.
- [ ] If the active queue has unsent/in-flight prompts, block `/resume` with a red error until the queue is idle.
- [ ] Keep session management minimal: no delete, rename, archive, export, checkpoint, rewind, or fork in this slice.

**Patterns to follow:**
- [ ] Use a replaceable display component for the picker; App owns command routing and backend calls.
- [ ] Keep loading animations terminal-safe, deterministic in tests, and isolated from persisted transcript/session state.
- [ ] Keep important states distinguishable without color: errors include text markers, selected rows include a pointer marker, loading includes static fallback text, and pending rows retain `(pending)`.
- [ ] Reference research favors project/workdir-scoped session lists and explicit workdir validation before resume; this slice tightens that to same-canonical-workspace-only.

**Test scenarios:**
- [ ] Happy path: `/resume` opens a current-workspace session list sorted by updated time.
- [ ] Happy path: while `/resume` is fetching sessions, a compact loading animation appears under the input bar and is replaced by the session list.
- [ ] Happy path: typed draft text before `/resume` is preserved while the session list loads and after Escape cancel.
- [ ] Happy path: the resume list appears under the input bar with 5 visible rows, a highlighted selected row, and Up/Down arrow navigation that scrolls beyond the visible window.
- [ ] Happy path: with colors stripped or `NO_COLOR` set, the selected row is still identifiable by `>` and errors remain identifiable by `ERROR:`/`!`.
- [ ] Happy path: opening `/resume` shrinks BodyPane first while preserving cwd, composer, picker rows, and bottom status bar at normal heights.
- [ ] Edge case: short terminal height renders fewer than 5 picker rows without hiding the composer or cwd.
- [ ] Happy path: selecting a session restores prior user prompts and backend ACK/error entries, then a new prompt appends to the restored session.
- [ ] Happy path: restored sessions in a git repo include explicitly written repo-memory rows for that git repo and preserve the launched subpath metadata.
- [ ] Edge case: no sessions shows an empty-state message and returns to the composer without crashing.
- [ ] Edge case: fewer than 5 sessions renders only the available rows without empty selectable placeholders.
- [ ] Edge case: slash text other than exact `/resume` submits as normal prompt content.
- [ ] Error path: attempting `/resume` while queued/in-flight prompts exist shows a red error and does not switch sessions.
- [ ] Error path: backend list/resume failure shows a red error and preserves the current session.
- [ ] Error path: a resume request for a different canonical workspace path shows a red error and preserves the current session/cwd.
- [ ] Error path: loading animation stops when list/resume fails or Escape cancels.
- [ ] Error path: session list or restore failure returns focus to the composer and preserves the prior draft/current session.
- [ ] Error path: red errors retain non-color error markers in color-stripped output.

**Verification:**
- [ ] A developer can run the TUI, submit prompts, exit, relaunch, type `/resume`, select the previous session, see the restored transcript/context, and continue submitting prompts into that session.

---

### U7. Create the standalone `kqode` executable
**Goal:** Add a local executable build that packages the Ink frontend and a prebuilt Rust backend into a true standalone native executable named `kqode`.

**Requirements:** R11, R12, R15. **Technical constraints:** T1, T2, T3.

**Origin trace:** Supports AE3 by making the end-to-end ACK proof runnable from the generated standalone executable.

**Dependencies:** U2, U6, U8, U9, U11, U12.

**Approach:**
- [ ] Use Rollup to bundle the TypeScript Ink entrypoint into `tui/dist/main.js` as the Node SEA input, with an explicit Node target and external/native module handling.
- [ ] Configure Rollup for dependency closure: bundle TypeScript TUI code plus runtime JS dependencies such as Ink, React, and JSON-RPC helpers into the SEA entrypoint; externalize only Node built-ins and explicitly documented native/asset cases.
- [ ] Validate that `tui/dist/main.js` and the final SEA executable do not require a sibling `node_modules` tree at runtime.
- [ ] Use Node SEA and `postject` to produce a native executable at `tui/dist/kqode[.exe]`.
- [ ] Compile the Rust backend into `tui/dist/assets/kqode-backend[.exe]` as a staging artifact, then package it as an executable asset for the SEA binary.
- [ ] At runtime, the standalone executable extracts or materializes the packaged backend asset into a controlled per-user cache location before launching it.
- [ ] Harden backend materialization: use a versioned per-user app cache directory, create directories/files with user-only permissions where supported, write the backend asset with create-new/atomic replacement semantics, never follow symlinks, avoid shared world-writable temp paths, and verify the materialized backend SHA-256 against the embedded asset manifest before every packaged-mode spawn. If the hash mismatches, re-materialize from the embedded asset; if verification still fails, show a red backend materialization error and do not spawn.
- [ ] Packaged executable mode must use only the packaged backend asset. Source mode must always use Cargo, even if generated artifacts exist.
- [ ] Keep generated artifacts under `tui/dist/` ignored unless the repository later decides to commit release artifacts.
- [ ] Document the direct terminal invocation path for `tui/dist/kqode[.exe]` and clarify that it still only runs local JSON-RPC ACK behavior.

**Patterns to follow:**
- [ ] Keep executable packaging local and first-slice focused; channel staging is handled separately in U10, while registry publishing, signing/notarization, auto-update, and daemon service work remain deferred.
- [ ] Preserve the Rust-core/TypeScript-surface boundary: the standalone executable packages both artifacts but does not move core behavior into TypeScript.

**Test scenarios:**
- [ ] Happy path: the executable build produces `tui/dist/kqode[.exe]`.
- [ ] Integration: invoking `tui/dist/kqode[.exe]` starts the Ink UI and can submit a prompt through the packaged Rust JSON-RPC backend.
- [ ] Integration: copy `tui/dist/kqode[.exe]` to a temporary directory with no `node_modules` tree and verify it still starts the TUI and reaches the local ACK path.
- [ ] Error path: Rollup externalizes an unexpected runtime dependency, causing the standalone smoke test to fail before release packaging.
- [ ] Edge case: source-mode development still uses the Cargo-backed launch path even when generated executable artifacts exist.
- [ ] Edge case: pre-existing files, symlinks, wrong permissions, or backend asset hash mismatch fail with a visible backend materialization error instead of executing the asset.
- [ ] Error path: missing or unmaterializable packaged backend asset shows a visible retryable backend error instead of silently falling back to model/tool behavior.

**Verification:**
- [ ] A developer can build `tui/dist/kqode[.exe]`, run it directly from the terminal, submit text, and see the Rust JSON-RPC ACK without running a separate backend command.

---

### U10. Prepare cross-platform distribution artifacts

**Goal:** Add channel-ready packaging around the standalone executable so the same runtime artifact can be distributed by direct download, npm global install, Homebrew, and winget.

**Requirements:** R15, R16. **Technical constraints:** T2, T3, T4.

**Origin trace:** Extends AE3 by proving the packaged ACK demo has a user-installable artifact shape, not only a developer-local build.

**Dependencies:** U7.

**Approach:**
- [ ] Define the first supported target matrix for the standalone executable: macOS arm64/x64, Linux arm64/x64, and Windows arm64/x64. Linux libc split can be refined during implementation if Node SEA or Rust backend constraints require separate GNU/musl artifacts.

| Target artifact | CI runner | Rust backend target | Node/SEA executable source | Archive | Smoke test expectation |
|-----------------|-----------|---------------------|----------------------------|---------|------------------------|
| `kqode-darwin-arm64` | `macos-latest` arm64 when available, otherwise documented cross-build fallback | `aarch64-apple-darwin` | Host/target Node binary copied before SEA injection; run ad-hoc codesign after `postject` when required | `.tar.gz` | Run on matching macOS arm64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-darwin-x64` | `macos-latest` x64 or macOS universal-capable runner | `x86_64-apple-darwin` | Host/target Node binary copied before SEA injection; run ad-hoc codesign after `postject` when required | `.tar.gz` | Run on matching macOS x64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-linux-x64` | `ubuntu-latest` | `x86_64-unknown-linux-gnu` unless musl is later required | Linux x64 Node binary copied before SEA injection | `.tar.gz` | Run the executable smoke test on CI. |
| `kqode-linux-arm64` | `ubuntu-latest` with arm64 runner when available, otherwise documented cross-build fallback | `aarch64-unknown-linux-gnu` unless musl is later required | Linux arm64 Node binary copied before SEA injection | `.tar.gz` | Run on matching Linux arm64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-windows-x64` | `windows-latest` | `x86_64-pc-windows-msvc` | Windows x64 Node executable copied before SEA injection | `.zip` | Run the executable smoke test on CI. |
| `kqode-windows-arm64` | Windows arm64 runner when available, otherwise documented cross-build fallback | `aarch64-pc-windows-msvc` | Windows arm64 Node executable copied before SEA injection | `.zip` | Run on matching Windows arm64 runner when available; otherwise mark as built-only with explicit release note. |

- [ ] Package direct-download artifacts as `kqode-<target>.tar.gz` for Unix-like targets and `kqode-<target>.zip` for Windows, each containing the standalone executable.
- [ ] Generate per-archive `.sha256` files and an aggregate `checksums.txt` for GitHub Release upload.
- [ ] Expose release packaging through an xtask command such as `cargo xtask package-release`, even if the xtask delegates to Bun/package-local Rollup/Node scripts internally.
- [ ] Do not generate npm/Homebrew/winget directories under `tui/dist/release/`. Those ecosystems consume published artifact URLs, not local staging folders.
- [ ] Write `docs/release/kqode_distribution_registration.md` after the echo/ACK executable works and release archives exist. The guide should walk a maintainer through GitHub Release asset upload/direct download, npm package registration/publish flow, Homebrew formula/tap registration, and winget manifest submission, each pointing at the GitHub Release asset URLs and checksums.
- [ ] Define npm distribution as a thin root package with platform-specific optional dependency packages. The root npm `bin` should run a small selector that locates the installed platform package executable; each platform package contains the corresponding prebuilt `kqode` executable and declares `os`/`cpu` metadata. Do not point npm `bin` at the TypeScript/Rollup JS runtime.
- [ ] Keep publishing credentials, registry upload, tap submission, winget submission, signing, notarization, and auto-update out of this implementation unit.

**Patterns to follow:**
- [ ] Treat package managers as distribution channels around `kqode`, not as separate application runtimes.
- [ ] Keep release archive/checksum staging deterministic and generated under `tui/dist/release/`.
- [ ] Prefer Cargo-facing release commands in docs and CI; Bun/package-local scripts remain implementation details inside the nested TUI package, while npm remains only a distribution channel.
- [ ] Keep the source-mode developer path separate from packaged-user install paths.

**Test scenarios:**
- [ ] Happy path: release packaging creates a direct-download archive and checksum for the current host target.
- [ ] Happy path: every supported target has a declared runner, Rust target, Node/SEA source, archive format, and smoke-test status.
- [ ] Happy path: `cargo xtask package-release` produces the same archive/checksum layout as the lower-level package script.
- [ ] Happy path: release packaging creates an aggregate `checksums.txt` covering all generated archives.
- [ ] Happy path: the registration guide names the generated artifact paths, the expected GitHub Release asset URL shape, and the manual publish/registration steps for GitHub direct download, npm, Homebrew, and winget.
- [ ] Happy path: the registration guide explains the npm root-selector package and platform optional package layout, including how the root `bin` locates the native executable.
- [ ] Edge case: missing standalone executable fails packaging with an explicit error instead of falling back to source-mode or package-manager runtime execution.
- [ ] Edge case: unsupported platform/arch reports a clear unsupported-target error.

**Verification:**
- [ ] The generated release archives/checksums and registration guide show how each install channel would deliver the same standalone executable from GitHub Release assets without requiring packaged users to install Cargo or run a backend separately.

---

### U13. Add the GitHub Release asset pipeline

**Goal:** Add a GitHub Actions workflow that builds the cross-platform standalone executable artifacts, creates release archives and checksums, and uploads them to a GitHub Release.

**Requirements:** R15, R16, R28. **Technical constraints:** T2, T3, T4.

**Origin trace:** Turns U10's local release artifacts into direct-download GitHub Release assets for downstream npm/Homebrew/winget registration.

**Dependencies:** U7, U10.

**Approach:**
- [ ] Trigger on version tags such as `v*` and allow manual `workflow_dispatch` for release candidates.
- [ ] Build the standalone executable matrix for macOS arm64/x64, Linux arm64/x64, and Windows arm64/x64 using the same `cargo xtask package-release` path as local U10.
- [ ] Use a two-stage workflow: matrix jobs build and upload workflow artifacts only; one final release job downloads all matrix artifacts, verifies the complete manifest/checksums, creates or updates the GitHub Release idempotently, and uploads per-target archives, per-target `.sha256` files, and aggregate `checksums.txt`.
- [ ] Keep this unsigned/not-notarized for the first slice unless implementation discovers platform requirements that block execution entirely.
- [ ] Add minimum release authenticity controls: protected release tags/environments where available, explicit least-privilege workflow permissions, pinned third-party actions by version or SHA, GitHub artifact attestations or signed checksums when available, and verification instructions in the registration guide.
- [ ] Do not publish npm packages, Homebrew taps, winget submissions, or auto-update metadata from this workflow. Those remain manual steps documented in the registration guide.
- [ ] Fail closed if any target archive or checksum is missing.

**Patterns to follow:**
- [ ] The workflow should use the same deterministic xtask command used locally so CI and local artifact shapes match.
- [ ] The final release job should be the only job with release-write permission; matrix build jobs should not have `contents: write`.
- [ ] Package managers consume the uploaded GitHub Release URLs; the workflow should not create package-manager-specific staging directories under `tui/dist/release/`.
- [ ] The workflow should make provenance/auditability visible in the release notes or registration guide so downstream package-manager registrations know which checksum/signature/attestation to verify.

**Test scenarios:**
- [ ] Happy path: a manual dry-run/release-candidate workflow produces all matrix artifacts as workflow artifacts without publishing package registries.
- [ ] Happy path: a tag-triggered run uploads the expected archive/checksum assets to the GitHub Release.
- [ ] Happy path: rerunning the workflow for the same tag is idempotent: it replaces or skips identical release assets deliberately instead of producing duplicates or partial releases.
- [ ] Happy path: release assets include checksums plus an attestation/signature path, or the workflow fails with a documented reason if the platform feature is unavailable.
- [ ] Edge case: missing archive/checksum fails the workflow before release upload completes.
- [ ] Edge case: final release job refuses to publish when any matrix artifact is missing, has a checksum mismatch, or has an unexpected target name.
- [ ] Edge case: unsupported platform/arch is reported as a matrix/configuration error, not silently skipped.

**Verification:**
- [ ] A maintainer can create a tag, run the workflow, and see GitHub Release assets whose URLs match the registration guide's npm/Homebrew/winget examples.

---

## Acceptance Coverage Matrix
| Origin acceptance | Planned coverage |
|-------------------|------------------|
| AE1 first render | `tui/src/components/__tests__/HomeScreen.test.tsx` verifies identity, version, cwd, prompt region, hints, model label, centralized GitHub/Gemini-inspired theme token usage, and resilient layout. |
| AE2 composer wrapping | `tui/src/components/__tests__/PromptComposer.test.tsx` and `tui/src/state/__tests__/composerReducer.test.ts` verify typing, wrapping preservation, inert hints, exact submit snapshots, empty-submit blocking, and post-submit composer clearing. |
| AE3 submit-to-ACK | `tests/main.rs`, `tui/src/backend/__tests__/backendProcess.test.ts`, `tui/src/backend/__tests__/messageProtocol.test.ts`, `tui/src/backend/__tests__/processBackendClient.test.ts`, `tui/src/__tests__/App.submit.test.tsx`, the standalone-executable smoke path, and U10 release-staging checks verify Rust JSON-RPC ACK, guarded launcher behavior, library-backed message protocol helpers, process client behavior, App queue state, exact prompt preservation in `receivedText`, user-prompt transcript display, queued/pending markers, red failure display, direct `kqode` invocation, and channel-ready packaging around the same executable. T1/T2/T3/T4 are covered by the Rust, TypeScript, standalone-executable, and distribution-staging tests. |
| Plan-added session resume | `tests/session_store.rs`, `tui/src/backend/__tests__/sessionProtocol.test.ts`, `tui/src/components/__tests__/ResumeSessionList.test.tsx`, `tui/src/state/__tests__/sessionTranscriptReducer.test.ts`, and App submit/resume tests verify SQLite session creation, transcript/context persistence, current-workspace session listing, `/resume` selection, different-workspace blocking, restored transcript display, and continuation in the selected session. |
| GitHub release assets | `.github/workflows/release.yml` and release-script checks verify matrix artifact generation, checksums, and GitHub Release upload without npm/Homebrew/winget publishing. |

---

## System-Wide Impact
- [ ] **Interaction graph:** The new surface is a nested TypeScript package plus one Rust binary JSON-RPC backend mode, a Rust-owned SQLite session store, and a standalone executable packaging the runtime artifacts together; no providers, tools, full session protocol, session replay, or VFS are involved.
- [ ] **Error propagation:** Rust JSON-RPC errors, malformed responses, backend-process failures, and request timeouts should become visible TUI errors, not swallowed output or silent no-ops.
- [ ] **State lifecycle risks:** Session metadata, transcript entries, and first-slice context persist in SQLite; full trace/replay state remains out of scope and dist output remains generated for this slice.
- [ ] **API surface parity:** The backend mode is an internal integration proof, not a public CLI contract. Headless agent functionality remains unchanged.
- [ ] **Integration coverage:** Cross-layer coverage is required for the process backend client and the App submit flow because component tests alone cannot prove Rust/Ink wiring.
- [ ] **Unchanged invariants:** Slash/status hints remain inert except for `/resume`, model label remains static, and KQode still does not run a model/provider/tool from the TUI.

---

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| The TUI package accidentally becomes the owner of agent/session behavior. | Keep components prop-driven and restrict backend logic to the backend client seam. |
| The hidden JSON-RPC backend argument is mistaken for a stable public CLI API. | Document it as an internal first-slice bridge and route future behavior through the planned session protocol. |
| The local session + ACK contract grows into a premature full agent session protocol. | Support only start/list/resume/message-submit requests in this slice and defer streaming deltas, tool events, assistant messages, checkpoints, replay, and provider state. |
| Running from `tui/` shows the package directory instead of the user's workspace. | Capture and pass the original workspace cwd explicitly in the TUI entrypoint/backend client. |
| Long prompts or narrow terminals push the status bar off screen. | Cap composer height and prioritize cwd/composer/status visibility in layout tests. |
| Backend failures hang the TUI or look successful. | Add timeout, non-zero-exit handling, immediate red backend-crashed output, paused queued prompts, and new-submit-only respawn behavior. |
| Source/packaged launch paths diverge. | Route both through the same backend process launcher abstraction and test both modes against the same guard contract. |
| Backend launch becomes arbitrary command execution. | Fail closed: support only the internal Cargo launch and bundled backend binary; defer user-provided backend paths and shell commands. |
| The child backend accidentally turns into daemon mode. | Keep the backend TUI-owned, stdio-only, socket-free, and short-lived; terminate it on TUI exit. Crash recovery is respawn plus SQLite restoration, not background continuation. |
| SQLite becomes the only long-term replay truth. | Keep this as first-slice resume persistence and preserve schema room for the later append-only JSONL trace/replay architecture. |
| `/resume` switches the user's workspace unexpectedly. | Scope lists to the current canonical absolute `workspaceCwd` only; realpath/case-normalize where possible, return a typed error for any direct resume request targeting another workspace, and never change cwd. |
| Dependency versions shift before implementation. | Resolve current compatible versions during implementation and keep the lockfile committed. |
| Distribution staging accidentally becomes full release infrastructure. | Generate GitHub Release-ready archives/checksums and a registration guide, but defer registry publishing, tap submission, winget submission, signing/notarization, auto-update, and daemon installation. |
| Release workflow accidentally publishes package registries. | Limit the workflow to GitHub Release asset creation; keep npm publish, Homebrew tap submission, and winget submission as manual documented steps. |
| Packaged backend materialization differs by platform or is tampered locally. | Package the platform-specific Rust binary as an executable asset, materialize it only into a per-user hardened cache path, verify hashes before execution, reject symlinks/pre-existing unsafe files, and test materialization/launch per target. |
| npm, Homebrew, or winget package paths drift from the direct executable path. | Treat each package manager artifact as a wrapper around the same standalone executable and add staging checks that reject source-build or alternate-runtime commands. |

---

## Documentation / Operational Notes

- [ ] Update `README.md` with the minimal TUI run path and clarify that this first TUI only ACKs submitted text.
- [ ] Document both source-mode and standalone-executable terminal testing paths.
- [ ] Document Cargo-facing xtask commands for contributor workflows, including fixture preparation, TUI build/test orchestration, and release packaging; Bun/package-local scripts remain package-internal implementation details.
- [ ] Document `/resume` as the only active slash command in this slice and clarify that it restores the local ACK transcript/context, not a real model conversation.
- [ ] Document the intended install channels as artifact consumers: direct download, `npm install -g`, Homebrew, and winget.
- [ ] Add `docs/release/kqode_distribution_registration.md` as the maintainer guide for registering/publishing generated artifacts after the echo executable is working.
- [ ] Document the GitHub Release workflow trigger, expected release assets, and the relationship between uploaded asset URLs and downstream npm/Homebrew/winget registration.
- [ ] Clarify that Cargo is required only for source-mode development, not for packaged-user execution.
- [ ] Do not document slash commands other than `/resume`, model selection, or real agent behavior as available from this TUI slice.
- [ ] Keep any backend ACK wording framed as a development/demo seam, not as the final session protocol.

---

## Sources & References
- [ ] **Origin document:** [docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md](../brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md)
- [ ] Product architecture: [docs/kqode_architecture_spec.md](../kqode_architecture_spec.md)
- [ ] Build path: [docs/kqode_build_path.md](../kqode_build_path.md)
- [ ] Adjacent context plan: [docs/plans/2026-06-25-002-feat-context-intent-retrieval-planning-plan.md](2026-06-25-002-feat-context-intent-retrieval-planning-plan.md)
- [ ] Reference spawn architecture research: [docs/research/2026-06-25-tui-backend-spawn-architecture.md](../research/2026-06-25-tui-backend-spawn-architecture.md)
- [ ] Reference session/resume research: [docs/research/2026-06-26-session-resume-storage-patterns.md](../research/2026-06-26-session-resume-storage-patterns.md)
- [ ] Ink documentation: [github.com/vadimdemedes/ink](https://github.com/vadimdemedes/ink)
- [ ] Ink testing utilities: [github.com/vadimdemedes/ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- [ ] Node child processes: [nodejs.org/api/child_process.html](https://nodejs.org/api/child_process.html)
- [ ] Node SEA: [nodejs.org/api/single-executable-applications.html](https://nodejs.org/api/single-executable-applications.html)
- [ ] `postject`: [github.com/nodejs/postject](https://github.com/nodejs/postject)
- [ ] npm `package.json` `bin`: [docs.npmjs.com/cli/v11/configuring-npm/package-json#bin](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin)
- [ ] Homebrew formula cookbook: [docs.brew.sh/Formula-Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [ ] winget manifests: [learn.microsoft.com/windows/package-manager/package/manifest](https://learn.microsoft.com/windows/package-manager/package/manifest)
- [ ] JSON-RPC reference: [jsonrpc.org/specification](https://www.jsonrpc.org/specification)
- [ ] NO_COLOR guidance: [no-color.org](https://no-color.org/)
