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
> [!todo] Section review
> - [x] Reviewed this section

Add a small TypeScript Ink package under `tui/`, a minimal Rust JSON-RPC stdio backend process, and a true cross-platform standalone native executable named `kqode`. The packaged artifact should run without Cargo, Rustup, Node, or npm as runtime prerequisites, while npm global install, direct download, Homebrew, and winget all distribute the same standalone executable shape.

---

## Problem Frame
> [!todo] Section review
> - [x] Reviewed this section

KQode currently has a starter Rust binary and a checked-in starter TypeScript TUI scaffold. The architecture calls for a replaceable Ink surface over a Rust core, so this plan turns that scaffold into the first visual shell and text-submission path without making the UI responsible for core agent behavior.

---

## Requirements
> [!todo] Section review
> - [ ] Reviewed this section

**Origin-derived requirements**

- R1. Render a top identity area with a simple KQode logo, product name, and current application version at normal supported widths, with decorative details allowed to compact or hide under the responsive contract.
- R2. Reserve a main body area that is static on initial render, then displays local backend ACK/status/error content for this slice.
- R3. Display the workspace current working directory where the `kqode` command was invoked directly above the input composer.
- R4. Render the input composer above the bottom status bar as the active prompt area.
- R5. Render `/ commands`, `@ mention`, `? help`, and right-side `GPT-5.5` status affordances at normal supported widths, with lower-priority details allowed to compact or hide under the responsive contract.
- R6. Accept typed text in the composer.
- R7. Support visual multiline wrapping when input exceeds the available width.
- R8. Submit the current non-empty, non-whitespace composer text when Enter is pressed; block empty/all-whitespace submits.
- R9. Have the Rust backend receive submitted text and return an ACK-style response plus the exact received text.
- R10. Display every submitted user prompt and every backend response in the visible scrollable body area.
- R11. Avoid model provider calls, agent loop execution, and tool execution.
- R12. Organize the Ink TUI as components rather than a monolithic render function.
- R13. Place TUI source under `tui/`.
- R14. Use a One Dark Pro-inspired palette for the first screen.

**Distribution, release, and fixture requirements**

- R15. Packaged users can run `kqode` without having Cargo, Rustup, Node, or npm installed, except when npm itself is used as an installer.
- R16. Distribution channels target the same standalone executable artifact: direct release download, `npm install -g`, Homebrew, and winget.
- R17. After the echo/ACK implementation and release staging are complete, provide a registration guide for manually publishing the generated artifacts through GitHub Releases direct download, npm, Homebrew, and winget.
- R18. Provide a small committed dummy React frontend project fixture so cwd display and backend launch behavior can be tested from a realistic non-KQode workspace without a separate regeneration script.
- R28. Provide a GitHub Actions release pipeline that builds the supported standalone executables, packages archives/checksums, and uploads them as GitHub Release assets.

**Interaction, error, and loading requirements**

- R19. Queue consecutive non-empty submits in order: the active request is sent to the backend, later submits appear immediately as user prompts marked `(pending)`, and the queue drains one request at a time as ACKs arrive.
- R20. Render frontend validation failures and backend failure messages in the centralized theme error red.
- R30. Prevent terminal text injection by sanitizing all user prompt, backend ACK, backend error, and restored transcript text before rendering. Persist exact raw text when needed, but never render control sequences as executable terminal control.
- R29. Show a small terminal-safe loading animation for user-visible loading states such as backend/session startup, `/resume` session list loading, and session restore.

**Plan-added technical constraints**

- T1. Transmit submitted prompts and backend ACK responses through a real JSON-RPC request/response connection between TypeScript and Rust, using third-party JSON-RPC transport libraries rather than a hand-rolled codec.
- T2. Produce a true standalone native executable named `kqode`, packaging the bundled Ink frontend together with a prebuilt Rust backend binary.
- T3. Treat source-mode Cargo launch as a developer path only; packaged mode must never require Cargo, Rustup, or target-dir probing.
- T4. Build platform-specific executable artifacts for macOS, Linux, and Windows, at minimum covering x64 and arm64 where the toolchain supports them.

**Origin actors:** A1 user, A2 Ink TUI, A3 Rust backend.

**Origin flows:** F1 first screen render, F2 prompt submit and backend response.

**Origin acceptance examples:** AE1 first render, AE2 composer wrapping, AE3 submit-to-backend response.

**Plan-added session requirements**

- R21. Create a durable local session when the TUI starts, scoped to `workspaceCwd`, with session id, title/last prompt metadata, created/updated timestamps, and current status stored in SQLite.
- R22. Persist each user prompt only after it is sent to the Rust backend, plus the matching backend ACK/error needed to reconstruct the durable transcript. Frontend-only queued prompts and validation errors remain in-memory UI state for this slice.
- R23. Persist first-slice context needed to resume the session: workspace cwd, detected git repo identity when available, app version, backend mode, current transcript, message ordering, and serialized context fragments reserved for future agent context.
- R24. Implement `/resume` as the only active slash command in this slice. It opens a session list, scoped to the current `workspaceCwd` by default, and shows session title/id, updated time, workspace path, and last prompt.
- R25. Selecting a session restores its persisted transcript/context into the TUI body and continues future submits in that same session.
- R26. Allow resume only when the selected session's stored canonical absolute `workspaceCwd` matches the current canonical absolute `workspaceCwd`; sessions from other working directories must not be selectable/resumable and must never switch the user's cwd.
- R27. When `workspaceCwd` is inside a git repository, persist and restore explicitly written repo-scoped memory rows for that repository. Store memory under the detected git root/repo key plus the session's relative workspace subpath; automatic LLM-based memory extraction/injection is deferred.

---

## Scope Boundaries
> [!todo] Section review
> - [x] Reviewed this section

- Real slash command execution remains deferred except for `/resume`; `@` file mentions, help overlays, and Tab navigation remain inert visual affordances.
- Model selection, provider calls, streaming assistant output, prompt-history navigation/editing, and full editor behavior are deferred.
- Full session accounting, trace replay, cost display, approvals, diff panels, rename/delete/export, and checkpoint/rewind/fork remain deferred. Persistent session transcript/history needed for `/resume` is in scope.
- Daemon mode is explicitly out of scope for this milestone and is not a planned future direction: do not introduce `kqoded`, local sockets, listening ports, background services, or backend processes that survive the TUI. This product shape uses only a TUI-owned child Rust process over JSON-RPC stdio. Any in-flight work terminates if the TUI or child backend terminates; recovery comes from persisted session state on a later launch.
- Full theme configuration is deferred; the One Dark Pro-inspired palette is hardcoded as centralized tokens.
- The TUI lives under `tui/` for this slice, even though the architecture example mentions `apps/kqode-tui/`; the origin requirement takes precedence for now.
- Registry publishing, signed/notarized releases, auto-update, and daemon service installation are deferred; GitHub Release asset creation and channel-ready package artifacts for direct download, npm global install, Homebrew, and winget are in scope around the standalone executable.

### Deferred to Follow-Up Work
> [!todo] Section review
> - [x] Reviewed this section

- Expand the first local session + ACK JSON-RPC boundary into the eventual full agent session protocol when KQode adds real model/tool/session events.
- Promote the `tui/` package into any future workspace layout if the repository later adopts the full proposed `apps/` and `packages/` structure.

### No-Daemon Product Decision
> [!todo] Section review
> - [x] Reviewed this section

- User promise: KQode does not keep hidden background services running after the TUI exits. Work is owned by the visible `kqode` session and stops when the TUI or child backend terminates.
- Tradeoff accepted: KQode gains simpler local security, lifecycle, and install behavior, but users do not get background continuation after closing the terminal, multi-client attachment to one live backend, or a process owner for unattended long-running jobs.
- Recovery model: Persisted SQLite session state supports later inspection/resume of completed transcript/context, but interrupted in-flight work is not automatically continued.
- Reconsideration threshold: Reopen the no-daemon decision only with an explicit product decision document if KQode later commits to background execution while no TUI is open, multi-client live attachment, IDE/TUI/headless sharing of one live runtime, or unattended job ownership.

---

## Context & Research
### Relevant Code and Patterns
> [!todo] Section review
> - [x] Reviewed this section

- `Cargo.toml` defines a single Rust package named `KQode`, version `0.1.0`, edition `2024`, with no dependencies yet.
- `src/main.rs` is the only Rust runtime source today and currently prints a starter message; this plan moves the binary entrypoint to root `main.rs` and keeps implementation modules under `src/`.
- `docs/kqode_architecture_spec.md` assigns the Rust core runtime to Rust and the Ink TUI/protocol client to TypeScript. Its older daemon-mode direction is superseded for this product slice by the explicit no-daemon decision in this plan.
- `docs/kqode_build_path.md` requires the Rust core to run headless and the TUI to remain replaceable.
- `.gitignore` covers Rust artifacts, TUI Node artifacts, and local/editor files.
- `docs/research/2026-06-25-tui-backend-spawn-architecture.md` found that reference agents centralize process launch behind manager/service abstractions with explicit cwd roles, timeout/output caps, environment hardening, cleanup, and permission/sandbox gates.

### Institutional Learnings
> [!todo] Section review
> - [x] Reviewed this section

- No `docs/solutions/` learnings exist yet.
- `docs/plans/2026-06-25-002-feat-context-intent-retrieval-planning-plan.md` is adjacent future context work but explicitly not a TUI implementation source; do not pull retrieval or agent behavior into this slice.

### External References
> [!todo] Section review
> - [x] Reviewed this section

- Ink documentation: use React-style `Box`, `Text`, and hooks for terminal rendering, with component tests through Ink testing utilities.
- Node `child_process.spawn` documentation: use argument arrays and `shell: false` for the Rust backend process rather than shelling through `exec`.
- Node SEA documentation and `postject` cover the single-executable packaging mechanism for the bundled Ink entrypoint and embedded assets.
- npm, Homebrew, and winget are distribution channels for prebuilt artifacts in this slice, not source-build mechanisms.
- JSON-RPC reference: use a library-backed request/response connection now for local session + ACK backend messages, while deferring the broader agent session protocol.
- NO_COLOR guidance: keep a later path for color-disabled terminals even though full theme configuration is out of scope.

---

## Key Technical Decisions
> [!todo] Section review
> - [x] Reviewed this section

- Use a nested npm-managed TypeScript package in `tui/`: This satisfies the origin path requirement without forcing a root JavaScript workspace before the broader M0 structure exists.
- Use Node 24 LTS and npm 11 as the TUI package baseline: Record the Node engine and package manager in package metadata so Ink/ESM/Vitest behavior is reproducible.
- Keep Ink components prop-driven and backend-agnostic: Layout components should not import process-spawning code, preserving the replaceable TUI boundary.
- Use a small library-backed JSON-RPC message seam: The TUI calls a backend client now, and that seam can later expand into a real protocol client without rewriting the UI tree.
- Use a TUI-owned Rust JSON-RPC stdio server for the first backend: This is not a daemon, exposes no socket/port, and exits with the TUI, but it is closer to KQode's intended Rust-core/TypeScript-surface boundary than one process per submit.
- Make the backend launch path clean-checkout-safe: The documented demo path must build or run the Rust backend from source rather than assuming an ignored `target/` artifact already exists.
- Use Cargo as the default first-slice backend build path: build from the trusted `repoRoot` manifest/config, then launch the compiled backend with process cwd set to `workspaceCwd`, so untrusted workspace Cargo config/PATH cannot influence the build step.
- Ship a standalone `kqode` executable as the core release artifact: Bundle the TypeScript Ink entrypoint into a Node SEA executable and embed/carry the compiled Rust backend binary so one user-invoked executable starts both frontend and backend.
- Use install channels as distribution wrappers, not alternate runtimes: npm global install, Homebrew, winget, and direct download should all select or install the same platform-specific `kqode` executable rather than rebuilding from source.
- Name path roles explicitly: `repoRoot` is the KQode repository root for Cargo/product metadata, `workspaceCwd` is the user's launch directory from `process.cwd()` when `kqode` starts and is displayed above the composer/used for backend execution, and `tuiPackageRoot` is the nested package directory.
- Keep a committed dummy React frontend project fixture under `tests/fixtures/dummy-react-app/` as read-only seed data: The checked-in files are the canonical fixture; no regeneration script is needed for this slice. Automated tests and manual development runs must copy the fixture into ignored workspaces under `target/kqode-test-workspaces/` before running `kqode`, so edits do not dirty the repository.
- Keep session persistence Rust-owned: The Ink TUI calls narrow JSON-RPC session methods, while the Rust backend creates, records, lists, and resumes SQLite-backed sessions.
- Use SQLite for the first-slice session store: Store session metadata, backend-observed transcript/message rows, backend responses/errors, serialized context rows, and git-repo-scoped memory rows in a local database under KQode's home/cache area. Frontend queue state and validation-only errors remain in memory. Keep the schema compatible with later append-only JSONL replay work, but do not implement full trace/replay in this slice.
- Detect git repository identity during session start: If `workspaceCwd` is inside a git repo, store the normalized git root, a stable repo key, and the session's relative subpath from the git root, then restore explicitly written repo-scoped memory rows for that repo on session start/resume. If no git repo is found, skip repo memory without failing the session.
- Treat `/resume` as a local TUI command backed by the Rust session API: It lists sessions for the current workspace, restores persisted transcript/context after selection, and then continues appending prompts to the selected session.
- Use a guarded backend process launcher: Source-mode Cargo launch and dist-mode bundled-backend launch must share timeout, output caps, stdin-close, environment hardening, cleanup, and typed-error behavior.
- Fail closed on backend launch policy: The first slice may launch only the internal JSON-RPC ACK backend through the two planned modes; user-supplied executables, arbitrary shell strings, and backend path overrides are deferred.
- Treat multiline as visual wrapping only: Enter submits, while true newline editing, history, slash commands, and full editor behavior remain deferred.
- Preserve exact non-empty prompt text: All-whitespace submits are blocked in the composer, but non-empty prompts keep leading/trailing spaces and Unicode through `receivedText`.
- Serialize backend submits through an in-memory FIFO queue: the TUI appends each user prompt immediately, sends only one request at a time over JSON-RPC, marks only queued prompts as `(pending)` in the scrollview, and clears a queued prompt's pending marker when that prompt becomes the active request.
- Bound first-slice text separately from JSON-RPC framing: cap submitted composer prompt text at 64 KiB decoded UTF-8 and cap displayed backend/error output at 128 KiB decoded UTF-8. Future tool output should use preview-plus-saved-full-output behavior instead of giant terminal dumps.
- Use root Rust metadata as the displayed product version: The TUI package may have its own package version for tooling, but the visible KQode version should come from root product metadata.
- Preserve the user's workspace cwd explicitly: Running package scripts from `tui/` must not accidentally display or use `tui/` as the KQode workspace.
- Keep the composer available while a backend request is pending: Enter snapshots and clears the current prompt, appends it to the transcript, and enqueues it behind any active request instead of dropping duplicate submits.
- Define a first-slice responsive contract: Prioritize composer, `workspaceCwd`, and left status hints; hide or compact lower-priority identity/model details before letting the prompt area disappear.
- Make backend failure visible and recoverable by new submit: A failed backend request must not look like a successful empty response or leave the user with no feedback.
- Style all frontend validation errors and backend failure messages with the centralized theme error red so failures are visually distinct from prompts, pending text, and ACK output.
- Separate raw persisted text from rendered display text: Persist exact user/backend text where fidelity matters, but render a sanitized form that escapes or neutralizes terminal control characters, ANSI CSI sequences, OSC sequences, carriage returns, backspaces, and other control bytes so backend/user text cannot manipulate the terminal UI.

### Local Data Handling
> [!todo] Section review
> - [ ] Reviewed this section

- All first-slice session data is local-only. Do not upload, sync, or export session SQLite data unless a future explicit export feature is added.
- Store KQode local data under the current user's profile directory at `~/.kqcode/`. The SQLite database and related local state should live under this directory, not inside the workspace repository.
- Create `~/.kqcode/` with per-user permissions where the platform supports it (for example `0700` for directories and `0600` for SQLite files on Unix-like systems).
- Do not persist environment variables, provider keys, tokens, or raw process environments. Backend diagnostics written to the session store should avoid known secret-bearing fields.
- Provide a documented local path and future deletion command target for clearing sessions; this slice may document manual deletion of `~/.kqcode/` before implementing a first-class delete command.
- Repo memory rows are explicit local records only. Automatic LLM memory extraction/injection and cross-session semantic memory ranking are deferred.

---

## Open Questions
### Resolved During Planning
> [!todo] Section review
> - [x] Reviewed this section

- Smallest reliable Ink-to-Rust boundary: Start a TUI-owned Rust JSON-RPC stdio backend process and exchange library-framed JSON-RPC request/response messages for this slice.
- Daemon-mode decision: Do not build daemon mode now or later. The backend is a child process owned by the TUI, has no local socket or listening port, and must not continue running after the TUI exits. Long-running jobs are owned by the live child backend only and terminate with it.
- TypeScript package tooling: Use a nested `tui/` package with TypeScript, Ink, React, Vitest, Ink testing utilities, and a dev runner.
- JavaScript toolchain baseline: Use Node 24 LTS and npm 11 as the minimum TUI runtime/package-manager baseline and record that in package metadata/documentation.
- Backend bootstrap: The TUI/demo path must build or run the Rust JSON-RPC stdio backend from repo source instead of depending on a pre-existing compiled binary.
- Backend launch rule: The default process client builds via Cargo from `repoRoot`, then launches the resulting backend binary with process cwd set to `workspaceCwd`; target-dir binary probing and backend path overrides are deferred until packaging work needs them.
- Standalone launch rule: The packaged executable uses its embedded Rust backend asset instead of Cargo; source-mode development always uses Cargo, regardless of whether generated artifacts exist.
- Distribution rule: Package managers are installers only. They must not require users to build the Rust backend, install Cargo, or keep the TUI as an npm-driven runtime.
- Project file-size rule: Keep source files across Rust and TypeScript at or below roughly 200 lines by splitting modules/components/helpers before they grow too large. Root `main.rs` is the small CLI entrypoint only; all other Rust implementation code should live in focused modules under `src/`. The first integration test file is `tests/main.rs`.
- Implementation-unit boundary: Each U-ID is intended to map to one atomic commit-sized change.
- Cwd semantics: Keep `repoRoot`, `workspaceCwd`, and `tuiPackageRoot` separate; display and backend execution use the `workspaceCwd` captured from the directory where `kqode` was invoked, while product metadata and Cargo launch use `repoRoot`.
- Test workspace fixture: Commit a minimal React app fixture under `tests/fixtures/dummy-react-app/` as a read-only template; do not add a regeneration script unless the fixture later becomes generated or large. Add ignore rules when the fixture is implemented so generated installs/build outputs and transient copied workspaces are not committed.
- Interactive development workspace: Provide a script or documented command that copies `tests/fixtures/dummy-react-app/` to `target/kqode-test-workspaces/manual-dummy-react-app/` for local hands-on testing. Developers should run `kqode` from the copied workspace, never mutate the committed fixture directly.
- Multiline behavior: Implement visual wrapping only; do not add semantic newline entry in this slice.
- Post-submit display: Append each user prompt to the scrollable body immediately, show `(pending)` only for prompts waiting behind the active request, clear that marker when the prompt starts sending, then append or attach the backend ACK response for that prompt when it completes. Do not add real model/assistant conversation history yet.
- Session persistence behavior: `/resume` is the only active slash command in this slice; it restores persisted user/backend transcript entries, first-slice context, and git repo memory from SQLite, not from an in-memory-only TUI state.
- Session scope behavior: Session lists use the current canonical absolute `workspaceCwd`; a different-workspace session must not be resumable from this TUI instance and must return a typed error if requested directly.
- Empty submit behavior: Block empty or all-whitespace composer submits; still allow the backend message-submit method to ACK an empty string for contract completeness.
- Version source: Display the root Rust package version as the KQode product version, not the nested TUI package version.
- Prompt/output bounds: Enforce a 64 KiB decoded UTF-8 composer prompt cap before submit and a 128 KiB decoded UTF-8 display cap for backend/error output. These are application/UX limits, not JSON-RPC constraints. Transport framing remains library-owned; malformed frames are fatal transport errors, not normal method-level JSON-RPC errors.

### Deferred to Implementation
> [!todo] Section review
> - [x] Reviewed this section

- Final dependency versions: Resolve by installing current compatible Ink, React, TypeScript, Vitest, and testing utility versions during implementation.
- Final internal backend argument name: Use a hidden/internal JSON-RPC backend mode and keep it non-public; the exact argument spelling can follow the smallest Rust CLI implementation.
- Exact string-width handling: Start with Ink wrapping and add a width helper only if tests expose a narrow-terminal or wide-character issue.

---

## Planned Libraries and Tooling
> [!todo] Section review
> - [x] Reviewed this section

| Area | Library/tool | Purpose |
|------|--------------|---------|
| TUI rendering | `ink`, `react` | Render the terminal interface with React-style components. |
| TypeScript runtime/dev | `typescript`, `tsx` | Strict TypeScript build and local development runner. |
| Root automation | Rust `xtask` helper crate | Provide Cargo-facing commands for fixture preparation, TUI build/test orchestration, release packaging, and CI parity. |
| Frontend bundling | `rollup` plus TypeScript/Node resolve plugins as needed | Produce an explicit Node-targeted JavaScript bundle used by development and executable packaging. |
| TUI tests | `vitest`, `ink-testing-library` | Deterministic component/input tests. |
| TypeScript JSON-RPC | `vscode-jsonrpc` | Manage JSON-RPC request IDs, response routing, errors, and stream framing over the Rust child process stdio pipes. |
| Rust JSON-RPC | `lsp-server`, `serde`, `serde_json` | Use proven JSON-RPC stdio message handling on the Rust side while defining only KQode's ACK method and params/result types. |
| Rust session persistence | `rusqlite` with bundled SQLite, `serde_json`, UUID/time helpers | Store and restore first-slice session metadata, transcript entries, and context rows without adding daemon mode or relying on system SQLite at runtime. |
| Process boundary | Node built-ins `node:child_process`, `node:path`, `node:fs`; `tree-kill` | Spawn Cargo or the bundled Rust backend without shelling out through `exec`, with timeout and cross-platform process-tree cleanup guards. |
| Standalone executable packaging | Node SEA plus `postject` | Build a native `kqode` executable that runs the bundled Ink frontend and launches the packaged Rust backend asset. |
| Distribution packaging | Release archives and checksums; registration guide for npm/Homebrew/winget | Produce GitHub Release-ready artifacts and document how package-manager manifests point at those release URLs. |
| GitHub release automation | GitHub Actions, `gh` CLI or `actions/upload-artifact`/release upload actions | Build cross-platform standalone archives, produce checksums, and upload them to GitHub Releases. |
| JSON-RPC protocol scope | KQode-owned method names and typed params/results | Use libraries for transport/protocol mechanics, but keep the first method surface intentionally small until the real session protocol exists. |

---

## Output Structure
> [!todo] Section review
> - [x] Reviewed this section

```text
tui/
  package.json
  package-lock.json
  tsconfig.json
  rollup.config.mjs
  vitest.config.ts
  src/
    main.tsx
    App.tsx
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
      tokens.ts
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
      package.json
      index.html
      src/
        App.jsx
        main.jsx
xtask/
  Cargo.toml
  src/
    main.rs
```

Generated by tests and manual fixture-copy commands after fixture implementation:

```text
target/
  kqode-test-workspaces/
    dummy-react-app-*/  # ignored working copies of committed fixtures
    manual-dummy-react-app/  # ignored interactive development workspace
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

The final reviewable runtime artifact is the standalone `tui/dist/kqode[.exe]` executable for the current platform, plus GitHub Release-ready archives and checksums. Staging artifacts under `dist/assets/` are packaging inputs, not extra files the user must invoke. Running from source still uses `npm` scripts and Cargo, but packaged users never need Cargo and direct/brew/winget users never need Node or npm. npm, Homebrew, and winget do not read local `dist` subdirectories directly; their package/manifest files should point at published GitHub Release asset URLs.

---

## High-Level Technical Design
> [!todo] Section review
> - [x] Reviewed this section

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
> [!todo] Section review
> - [x] Reviewed this section

> *This contract defines the first local session + ACK protocol shape. It is intentionally not the mature agent session protocol, generated schema system, streaming assistant protocol, or cross-process daemon.*

- Process lifecycle: The TUI starts one Rust child backend when the TUI starts, keeps it for the TUI session, and terminates it on TUI exit. If the child backend crashes or the JSON-RPC transport dies, the TUI immediately marks the backend `dead`, shows a red backend-crashed state, marks any in-flight prompt failed, and pauses queued prompts. It must not silently restart in the background. A fresh child backend may be spawned only when the user types and submits a new non-empty prompt. Respawn restores persisted session metadata/context/transcript from SQLite, but does not retry or auto-resubmit interrupted work.
- Transport framing: JSON-RPC 2.0 messages use the selected libraries' stdio stream framing. TypeScript uses `vscode-jsonrpc` stream readers/writers over child stdout/stdin; Rust uses `lsp-server` over stdio. Rust stdout must contain only JSON-RPC protocol frames; diagnostics go to stderr.
- Session start: method `kqode.session.start`, params containing absolute `workspaceCwd`, `appVersion`, and optional `resumeSessionId`; result contains `sessionId`, session metadata, restored context rows, restored transcript entries, and git repo memory rows when a repository is detected.
- Message submit: method `kqode.message.submit`, params containing `sessionId` and a single `text` string, and an ID that Rust mirrors back in the response.
- Session list: method `kqode.session.list`, params containing absolute `workspaceCwd`; the backend canonicalizes it before comparison and returns recent session summaries ordered by `updatedAt` descending for that canonical workspace only.
- Session resume: method `kqode.session.resume`, params containing `sessionId` and absolute `workspaceCwd`; result contains the selected session metadata, context rows, transcript entries, and git repo memory rows when available. If the selected session's stored canonical workspace path differs from the current canonical `workspaceCwd`, return a typed JSON-RPC error and do not change cwd.
- Success response: same ID and result `{ "message": "ACK: message received", "receivedText": string }` for message submits; the TUI displays both the ACK and `receivedText` in the body and persists them through the session store.
- Error response: JSON-RPC 2.0 error response for valid requests with unsupported methods, invalid params, over-limit payloads, or internal backend failures. Malformed transport frames are fatal transport errors handled by the backend client lifecycle.
- Size limits: decoded request text is capped at 64 KiB UTF-8 before submit, and displayed backend/error output is capped at 128 KiB UTF-8. Transport frame parsing/framing stays owned by `vscode-jsonrpc` and `lsp-server`.
- Scope guard: no streaming deltas, tool events, assistant messages, generated protocol package, local socket, listening port, background service, checkpoint/rewind/fork, or cross-process daemon are introduced in this slice.

---

## UI State and Responsive Contract
> [!todo] Section review
> - [x] Reviewed this section

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

### U1. Verify the nested Ink package scaffold
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Verify and adjust the existing TypeScript package infrastructure under `tui/` so the TUI can be developed, built, and tested independently from the current Rust crate.

**Requirements:** R12, R13, R18.

**Origin trace:** Supports F1/F2 scaffolding; no direct acceptance example.

**Dependencies:** None.

**Files:**
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `tui/package.json`
- Modify: `tui/package-lock.json`
- Modify: `tui/tsconfig.json`
- Modify: `tui/vitest.config.ts`
- Modify: `tui/src/main.tsx`
- Modify: `tui/src/App.tsx`
- Create: `xtask/Cargo.toml`
- Create: `xtask/src/main.rs`
- Create: `tests/fixtures/dummy-react-app/package.json`
- Create: `tests/fixtures/dummy-react-app/index.html`
- Create: `tests/fixtures/dummy-react-app/src/App.jsx`
- Create: `tests/fixtures/dummy-react-app/src/main.jsx`
- Modify: `.gitignore`

**Approach:**
- Keep the nested npm package rather than introducing a root JS workspace.
- Convert the root Cargo manifest into a package-plus-workspace manifest with members `[".", "xtask"]` and a resolver compatible with edition 2024, while keeping runtime code in the existing root package.
- Preserve strict TypeScript ESM and React JSX configuration.
- Preserve package-local npm scripts for TUI internals, but expose contributor-facing workflows through Cargo/xtask commands from the repository root.
- Preserve Node artifact ignores for package-local dependencies/build output.
- Add a tiny committed dummy React app fixture for cwd/workspace tests; do not add a regeneration script. Treat the committed fixture as read-only seed data and add `.gitignore` coverage in the same implementation unit for fixture `node_modules`, build output, coverage, logs, and copied/generated test workspaces.
- Add an xtask command such as `cargo run -p xtask -- fixture-prepare` that copies the committed fixture into `target/kqode-test-workspaces/manual-dummy-react-app/` for interactive local testing.
- Add a lightweight way for the TUI entrypoint to receive root product metadata, especially the KQode version.
- Keep README changes for the final submit/backend-response unit after the demo path exists.

**Patterns to follow:**
- Keep the runtime Rust code in the current root package; adding minimal `xtask` automation wiring is allowed, but do not split the runtime into the future planned crate workspace in this slice.
- `cargo run -p xtask -- ...` must work from the repository root after U1; do not document xtask commands before the workspace membership is wired.
- Existing docs describe TypeScript as a surface layer, not the core runtime owner.
- Do not run mutation tests or interactive `kqode` sessions directly in `tests/fixtures/dummy-react-app/`; always copy to `target/kqode-test-workspaces/` first.
- Root-level docs should prefer Cargo-facing commands such as `cargo run -p xtask -- fixture-prepare` over asking contributors to remember npm commands directly.

**Test scenarios:**
- Test expectation: none -- this unit is package scaffolding, and validation is covered by later TUI build/test outcomes.

**Verification:**
- The TUI package can be installed, typechecked, and used by later units without requiring a root JavaScript workspace.
- Rust build artifacts and Node package artifacts remain ignored appropriately.

---

### U2. Add the Rust JSON-RPC stdio backend mode
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Replace the starter-only Rust binary behavior with a minimal hidden backend mode that runs a JSON-RPC stdio loop, handles message submit requests, returns ACK responses, and stays separate from future agent behavior.

**Requirements:** R9, R11. **Technical constraints:** T1.

**Origin trace:** Supports the backend leg of F2 and is a prerequisite for AE3.

**Dependencies:** None.

**Files:**
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Move/modify: `main.rs`
- Create: `src/backend.rs`
- Create: `src/protocol.rs`
- Create: `tests/main.rs`

**Approach:**
- Add a small internal JSON-RPC stdio backend mode selected by a command-line argument, with no model/provider/tool logic.
- Use `lsp-server` to read JSON-RPC requests from stdin and write JSON-RPC responses to stdout.
- Support only the message-submit method in this unit; do not add a daemon, tool dispatcher, or streaming assistant loop. U11 adds the separate first-slice session persistence methods.
- Define JSON-RPC method/event names, response status strings, error kinds, and non-obvious numeric limits as enums or named constants in `src/protocol.rs`; do not scatter hard-coded strings like `kqode.message.submit` or magic numbers through handlers/tests.
- Treat malformed transport/framing input as a fatal transport error handled by the backend client lifecycle; return JSON-RPC errors through the library response path for valid requests with unsupported methods or invalid params.
- Preserve a harmless default path for running the binary without the backend mode.
- Keep error behavior explicit rather than silently treating read/write failures as success.
- Configure `Cargo.toml` so the binary target uses root `main.rs`; keep that file as argument dispatch only. Put backend loop and protocol types in modules under `src/` when implementation would otherwise push a file above roughly 200 lines.

**Patterns to follow:**
- Keep dependencies minimal; JSON serialization/parsing dependencies are acceptable because JSON-RPC is now the transport requirement.
- Keep this in the current single package; do not create the future crate workspace as part of this slice.
- Prefer focused modules/components/helpers over monolithic files; no source file in this slice should exceed roughly 200 lines unless there is a clear reason documented in review.
- Follow the project constants/enums rule: protocol names and magic values belong in enums/constants that tests import, not in repeated string/number literals.

**Test scenarios:**
- Happy path: a JSON-RPC `kqode.message.submit` request containing `hello from tui` returns a success response with `message: "ACK: message received"` and `receivedText: "hello from tui"`.
- Happy path: tests build requests through the protocol enum/constant rather than duplicating method-name string literals.
- Edge case: Unicode text and newline characters inside JSON-RPC params are preserved exactly in `receivedText`.
- Edge case: an empty string request returns a valid ACK response for backend contract completeness, even though the TUI blocks empty submits.
- Error path: malformed transport/framing input exits non-successfully with visible stderr and is handled as a fatal transport error by the client lifecycle.
- Error path: unsupported method or invalid params returns a JSON-RPC error response.
- Error path: invalid backend invocation or unexpected input failure exits non-successfully with visible stderr.
- Integration: the Rust test exercises the compiled binary path rather than only a helper function.

**Verification:**
- The backend mode provides a deterministic local JSON-RPC ACK proof and does not invoke provider, agent, or tool behavior.

---

### U3. Build the static home screen components
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Implement the Copilot CLI-style KQode home screen as composable Ink components with centralized theme tokens.

**Requirements:** R1, R2, R3, R4, R5, R12, R13, R14, R18.

**Origin trace:** Covers F1 and AE1.

**Dependencies:** U1.

**Files:**
- Create: `tui/src/theme/tokens.ts`
- Create: `tui/src/components/Header.tsx`
- Create: `tui/src/components/BodyPane.tsx`
- Create: `tui/src/components/CwdLine.tsx`
- Create: `tui/src/components/StatusBar.tsx`
- Create: `tui/src/components/HomeScreen.tsx`
- Create: `tui/src/components/__tests__/HomeScreen.test.tsx`
- Modify: `tui/src/App.tsx`

**Approach:**
- Centralize One Dark Pro-inspired colors in theme tokens.
- Include an error red token and use it for frontend validation failures and backend failure messages.
- Use component props for version, `workspaceCwd`, model label, body output, and pending/error state.
- Render a visual composer slot/shell so the first-screen layout can be validated before interactive composer behavior lands.
- Render the bottom hints as inert muted affordances; they must not open command/help/mention behavior.
- Right-align or degrade the model label based on terminal width while keeping core prompt affordances visible.
- Support a practical minimum viewport of roughly 40 columns by 12 rows; below that, preserve the composer, cwd, and left hints first, then compact or hide model/version/logo detail.
- Treat the logo as KQode-inspired terminal art, not copied product source.
- Display the KQode product version from `repoRoot` metadata rather than the nested TUI package version.
- Display `workspaceCwd` as the command invocation directory, including when tests run the TUI from the dummy React app fixture.

**Patterns to follow:**
- `docs/kqode_architecture_spec.md` keeps UI surfaces replaceable; layout components should remain display-only.
- `docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md` provides the visual wireframe and status labels.

**Test scenarios:**
- Covers AE1. Happy path: initial render includes the logo, `KQode`, root product version, cwd line, prompt region, bottom hints (`/ commands`, `@ mention`, `? help`), and `GPT-5.5`.
- Covers AE1. Happy path: when launched from a copied dummy React workspace under `target/kqode-test-workspaces/`, the cwd line displays that copied workspace rather than `tui/`, the KQode repo root, or the committed fixture template.
- Covers AE1. Happy path: the first screen uses centralized One Dark Pro-inspired theme tokens for background, muted text, and accent colors.
- Happy path: the theme exposes an error red token for frontend/backend failure rendering.
- Edge case: a long `workspaceCwd` is truncated or compacted from the left while the composer and status bar remain visible.
- Edge case: around 40 columns by 12 rows, the composer, `workspaceCwd`, and left-side status hints remain visible while lower-priority details compact or disappear.
- Edge case: rendered output remains readable when color styling is stripped by the test renderer.

**Verification:**
- The first rendered frame feels like the intended KQode home screen and keeps future output space available.

---

### U4. Implement composer input and wrapping behavior
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Add focused prompt entry that accepts typed text, visually wraps long input, and treats Enter as submit.

**Requirements:** R4, R6, R7, R8, R12.

**Origin trace:** Covers the input leg of F2 and AE2.

**Dependencies:** U1, U3.

**Files:**
- Create: `tui/src/components/PromptComposer.tsx`
- Create: `tui/src/state/composerReducer.ts`
- Create: `tui/src/components/__tests__/PromptComposer.test.tsx`
- Create: `tui/src/state/__tests__/composerReducer.test.ts`
- Modify: `tui/src/components/HomeScreen.tsx`
- Modify: `tui/src/App.tsx`

**Approach:**
- Keep printable input, backspace/delete, Enter submit, and empty-submit behavior explicit in composer state.
- Use Ink wrapping for the first slice; only add a separate width utility if the component tests prove it is needed.
- Treat typed/pasted printable text as composer content, but do not require bracketed-paste or real newline editing support in this slice.
- Block only empty or all-whitespace submits; preserve leading/trailing spaces for non-empty prompts.
- Enforce the 64 KiB prompt-size ceiling before submit with visible feedback instead of sending an over-limit JSON-RPC request.
- Keep slash, mention, help, and Tab behavior inert: `/`, `@`, and `?` are normal typed characters, and Tab should not trigger navigation.
- On submit, emit an exact prompt snapshot to App and clear the composer so further typing can continue while App owns backend queue state.
- Cap the composer to a small visible height and scroll/clip to the latest prompt lines so long prompts do not push the cwd and status bar off screen.

**Patterns to follow:**
- External Ink guidance favors `useInput` for keyboard handling and component/reducer tests for deterministic behavior.
- The origin requirement defines multiline as wrapping behavior and Enter as submit.

**Test scenarios:**
- Covers AE2. Happy path: typing a long prompt preserves all content and wraps within constrained width.
- Happy path: printable characters append to the composer and backspace removes the last character.
- Edge case: pressing Enter with empty or whitespace-only content does not submit.
- Edge case: non-empty text with leading/trailing spaces submits the exact composer snapshot.
- Edge case: `/`, `@`, and `?` remain typed content rather than opening UI modes.
- Edge case: Tab does not navigate or mutate the prompt in this slice.
- Edge case: typed/pasted printable text is retained as composer content; pasted newline preservation is not required for the interactive TUI path.
- Edge case: after submit, the composer clears and accepts new input while the previous prompt is being handled by App queue state.
- Edge case: content beyond the composer height cap remains in state and submits exactly, while the visible composer keeps the latest lines in view.
- Error path: over-limit input is blocked before backend submit with visible composer/body feedback.

**Verification:**
- The composer remains focused and usable as a prompt bar, with Enter reserved for submission.

---

### U5. Define the JSON-RPC message protocol
> [!todo] Section review
> - [ ] Reviewed this section

**Goal:** Define the TypeScript message protocol types and `vscode-jsonrpc` request wiring for `kqode.message.submit`.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Supports the protocol leg of F2 and is a prerequisite for AE3.

**Dependencies:** U1, U2.

**Files:**
- Create: `tui/src/backend/BackendClient.ts`
- Create: `tui/src/backend/messageProtocol.ts`
- Modify: `tui/package.json`
- Modify: `tui/package-lock.json`
- Create: `tui/src/backend/__tests__/messageProtocol.test.ts`

**Approach:**
- Add `vscode-jsonrpc` to the TUI package dependencies.
- Define a narrow backend client interface that returns either an ACK result or an explicit error.
- Define minimal shared TypeScript request/response types for the `kqode.message.submit` method.
- Use `vscode-jsonrpc` to send the message-submit request, route responses by request ID, surface JSON-RPC errors, and avoid hand-rolled parsing/framing.

**Patterns to follow:**
- Keep method names KQode-owned even though transport mechanics come from `vscode-jsonrpc`.
- Do not introduce generated protocol packages or full agent session event types in this slice.

**Test scenarios:**
- Happy path: the TypeScript protocol helper sends `kqode.message.submit` through `vscode-jsonrpc` and receives an ACK success response.
- Edge case: Unicode, leading/trailing spaces, and JSON string newline characters are preserved in `receivedText` at the protocol layer.
- Error path: JSON-RPC method errors surface as typed backend client errors.

**Verification:**
- The message protocol unit proves request/response typing and library-backed response routing without launching a Rust child process.

---

### U8. Implement the guarded source backend process launcher
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Add the source-mode backend process launcher with cwd/root handling, environment hardening, timeout, and process-tree cleanup.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Supports the backend process leg of F2 and is a prerequisite for AE3.

**Dependencies:** U1, U2, U5.

**Files:**
- Create: `tui/src/backend/backendProcess.ts`
- Create: `tui/src/backend/__tests__/backendProcess.test.ts`
- Modify: `tui/package.json`
- Modify: `tui/package-lock.json`

**Approach:**
- Add `tree-kill` and related typings if needed.
- Add the source-mode Cargo backend build/launch path.
- Resolve the Rust backend from `repoRoot` rather than assuming the current process cwd is `tuiPackageRoot`.
- Account for platform executable naming, including Windows.
- Do not assume `target/debug` already exists on a fresh checkout; the default client/test harness should invoke Cargo from canonical `repoRoot` using trusted repo Cargo configuration before launching the compiled backend in `workspaceCwd`.
- Spawn the Rust backend with `shell: false`, keep stdin/stdout open for library-framed JSON-RPC during the TUI session, and keep stderr separate for diagnostics.
- Preserve `workspaceCwd` for backend process execution.
- Use a strict environment allowlist for both build and backend launch and do not pass user-provided command strings into the launcher.
- Preserve only platform-required variables. On Windows include `PATH`, `PATHEXT`, `SystemRoot`/`WINDIR`, `TEMP`/`TMP`, and `USERPROFILE`/`HOME`. On Unix include `PATH`, `HOME`, `TMPDIR`, plus intentional terminal/color variables. Add Cargo/Rustup variables only when required for source-mode build, never log the environment, and strip secret-looking variables such as `*_TOKEN`, `*_SECRET`, `*_KEY`, provider keys, registry tokens, and SSH agent variables.
- In source mode, buffer and cap Cargo stderr for diagnostics but do not treat stderr presence alone as failure.
- Enforce a startup timeout and per-request timeout, terminate the process tree on TUI exit/fatal backend failure, and surface timeout separately from malformed JSON-RPC and non-zero exit.
- Convert missing executable, non-zero exit before/while serving, malformed protocol output, backend JSON-RPC error response, and timeout into explicit client errors.

**Patterns to follow:**
- Node child-process guidance recommends `spawn` with argument arrays for local process execution.
- KQode's architecture keeps process execution details out of display components.

**Test scenarios:**
- Integration: the client works when invoked from inside `tui/` while preserving the original workspace cwd captured before package-script execution.
- Integration: the client works when `workspaceCwd` is the dummy React app fixture, proving backend execution and visible cwd are tied to the user's launch directory rather than the TUI package.
- Integration: the documented fresh-checkout path builds or runs the Rust backend before the first submit instead of failing with a missing executable.
- Integration: source-mode uses Cargo regardless of whether generated package artifacts exist.
- Error path: malicious workspace `.cargo/config.toml` or PATH entries do not influence the trusted repo-root Cargo build step.
- Error path: timeout terminates the backend process and returns a visible timeout error without leaving an orphaned child.
- Error path: missing backend executable returns a typed client error.
- Error path: Cargo stderr without non-zero exit is retained as diagnostics and does not fail startup by itself.

**Verification:**
- The launcher starts and stops the source-mode backend through one guarded path without exposing process details to display components.

---

### U9. Implement the process JSON-RPC backend client
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Connect the backend process launcher to `vscode-jsonrpc`, send message-submit requests, parse ACK responses, and own backend connection lifecycle.

**Requirements:** R8, R9, R11, R12. **Technical constraints:** T1.

**Origin trace:** Covers the client-side backend leg of F2 and is a prerequisite for AE3.

**Dependencies:** U5, U8.

**Files:**
- Create: `tui/src/backend/processBackendClient.ts`
- Create: `tui/src/backend/__tests__/processBackendClient.test.ts`

**Approach:**
- Start one backend process for the TUI session and create a `vscode-jsonrpc` connection over its stdio pipes.
- Expose `message.submit` through the narrow backend-client interface for G1. U11/U12 extend the interface with `session.start`, `session.list`, and `session.resume`.
- Model backend lifecycle states as `starting`, `ready`, `closing`, and `dead`.
- Recoverable JSON-RPC method errors keep the process alive; fatal process/transport errors dispose the connection and mark it `dead`.
- On the next non-empty submit after `dead`, respawn the backend, restore the active session from SQLite, and continue from persisted state. Do not restart silently, do not provide a separate retry action, and do not automatically replay interrupted in-flight requests.
- Enforce per-request timeout separately from startup timeout.

**Patterns to follow:**
- Keep the process client independent from display components; App receives a narrow backend-client interface.

**Test scenarios:**
- Integration: the process client starts the Rust stdio backend, sends a JSON-RPC message-submit request, and receives the ACK message plus exact `receivedText`.
- Edge case: max-size allowed prompt returns exact `receivedText`, while over-limit prompt is rejected before spawn by the composer/App path; oversized display output is capped at 128 KiB without changing persisted exact text.
- Error path: malformed backend protocol output or JSON-RPC error response returns a typed client error.
- Error path: timeout kills the child, marks the client dead, shows a red backend-crashed error for the in-flight prompt, pauses queued prompts, and only a new non-empty submit respawns and restores persisted session state.

**Verification:**
- The TUI has a deterministic JSON-RPC backend client seam that proves local Rust communication without exposing process details to display components.

---

### U11. Add the SQLite session store and session JSON-RPC methods
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Add a Rust-owned local SQLite session store under `~/.kqcode/` and expose narrow JSON-RPC methods for starting, recording, listing, and resuming first-slice sessions.

**Requirements:** R21, R22, R23, R24, R25, R26, R27. **Technical constraints:** T1.

**Origin trace:** Extends F2 and AE3 so the ACK demo is durable and resumable instead of memory-only.

**Dependencies:** U2, U5.

**Files:**
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `main.rs`
- Create: `src/session_store.rs`
- Create: `src/session_protocol.rs`
- Create: `tests/session_store.rs`
- Create: `tui/src/backend/sessionProtocol.ts`
- Create: `tui/src/backend/__tests__/sessionProtocol.test.ts`
- Modify: `tui/src/backend/BackendClient.ts`
- Modify: `tui/src/backend/messageProtocol.ts`

**Approach:**
- Add SQLite storage under the Rust backend, not under display components or TUI-only state.
- Use `rusqlite` with bundled SQLite (or an equivalent self-contained SQLite strategy) so packaged backends do not require system SQLite, pkg-config, vcpkg, or platform-specific runtime libraries.
- Place the SQLite database under `~/.kqcode/` by default, with a test-only override so integration tests do not write to the real user profile.
- Create a small schema with `sessions`, `session_messages`, `session_context`, and `repo_memory` tables. Include stable ids, canonical absolute `workspace_cwd`, git root/repo key when detected, relative workspace subpath from the git root, `created_at`, `updated_at`, title/last-prompt metadata, message order, role/kind, status, text/content JSON, first-slice context fragments, and repo-memory kind/source fields.
- Keep writes explicit and ordered: start session, record each user prompt when it is sent to the backend, record backend ACK/error, and update session `updated_at`/last prompt. Do not persist frontend-only queued prompts or validation-only errors in this slice.
- Record repo memory only through an explicit session API/event with structured content. This slice proves storage and restore only; it must not infer broad semantic memory from arbitrary prompt text and must not inject repo memory into an LLM context because no LLM run exists in this slice.
- Add JSON-RPC methods for `kqode.session.start`, `kqode.session.list`, `kqode.session.resume`, and extend `kqode.message.submit` to require `sessionId`.
- Session listing is always scoped to the current canonical absolute `workspaceCwd`; all-workspace browsing is out of scope for this slice. Canonicalization should resolve symlinks with best-effort realpath, normalize separators, and apply platform-appropriate case normalization where the filesystem is case-insensitive.
- Restore backend-observed transcript/context rows in stable message order and restore repo-memory rows for the session's git repo key. Frontend-only queued prompts from a crashed TUI are not restored because they were never sent to the backend.
- Keep this as first-slice persistence only: no full trace replay, checkpoint/rewind/fork, rename/delete/export, cost accounting, or model/tool session state.

**Patterns to follow:**
- KQode architecture already assigns durable session state to Rust and SQLite indexes; keep the TUI as a protocol client.
- Reference research shows useful precedent for project-scoped session files/lists, workdir validation, and replayable append-style records.

**Test scenarios:**
- Happy path: starting the backend creates a SQLite database and a session row for the current `workspaceCwd`.
- Happy path: the SQLite database is created under a test-overridden KQode home path and the production default resolves under `~/.kqcode/`.
- Happy path: packaged backend smoke tests confirm SQLite open/read/write works on each supported target without system SQLite dependencies.
- Happy path: starting a session inside a git repo stores git root/repo identity plus the relative workspace subpath and returns explicitly stored repo-memory rows for that repo.
- Happy path: submitting a prompt records the user message and matching ACK response with exact text and stable order.
- Happy path: explicitly written repo-memory rows are restored for later sessions in the same git repo, including sessions launched from subfolders with distinct relative workspace subpaths.
- Happy path: listing sessions returns current-workspace sessions ordered by most recently updated.
- Happy path: resuming a session returns metadata, context rows, repo memory rows, and transcript entries in display order.
- Edge case: starting or resuming outside a git repo skips repo memory and still restores session transcript/context.
- Edge case: symlink/case-variant paths that canonicalize to the same workspace can resume; paths that canonicalize differently return a typed JSON-RPC error and do not switch cwd.
- Edge case: malformed/corrupt persisted rows fail visibly and do not crash the TUI process.
- Error path: SQLite open/write failure returns an explicit backend error that renders red in the TUI.

**Verification:**
- A killed and restarted first-slice TUI can recover the persisted ACK transcript for a selected session without requiring daemon mode.

---

### U6. Wire App submit state and ACK output
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Connect the composer, backend client, and scrollable body pane so Enter appends user prompts immediately, queues consecutive submits, and displays the matching Rust ACK/error for each prompt.

**Requirements:** R8, R9, R10, R11, R12, R19, R20. **Technical constraints:** T1.

**Origin trace:** Covers F2 and AE3 end-to-end.

**Dependencies:** U3, U4, U5, U9.

**Files:**
- Create: `tui/src/__tests__/App.submit.test.tsx`
- Create: `tui/src/text/sanitizeDisplayText.ts`
- Create: `tui/src/text/__tests__/sanitizeDisplayText.test.ts`
- Modify: `tui/src/App.tsx`
- Modify: `tui/src/components/BodyPane.tsx`

**Approach:**
- Inject the backend client into App state so tests can use a mock and production can use the process client.
- For G1, accept prompt submissions without durable session state. U11/U12 later add active `sessionId` state and transcript rehydration.
- Use a submitted prompt snapshot so the backend receives exactly what the composer submitted.
- Append every submitted user prompt to the body immediately and clear/refocus the composer so the next prompt can be typed while the backend is busy.
- Maintain an in-memory FIFO queue of submitted prompt snapshots; send only one backend request at a time and start the next queued request after the current request returns ACK or error.
- Define body states explicitly: initial backend explanation/tip, active user prompt without a marker, queued user prompt with `(pending)`, success output labeled as a Rust backend ACK, and red error output.
- Render the main body as a scrollview-like transcript that appends user prompt, ACK/status/error entries for this slice.
- Render only sanitized display text for user prompts, backend ACK payloads, backend errors, validation errors, and restored transcript entries. Persisted raw text must not be passed directly to Ink `Text`.
- On success, append or attach the matching ACK message for the active prompt.
- On failure or timeout, show a visible red body error for the active prompt and keep later queued prompts in order unless the backend lifecycle is fatal.
- Keep G1 transcript state in memory. U11/U12 later persist transcript/context changes through the backend client.
- Keep R11 concrete: App submit must use only the backend client seam, and display components must not import backend/process logic.
- Leave README terminal-run documentation for the standalone executable unit after the directly-callable artifact exists.

**Patterns to follow:**
- Layout components stay display-only; App owns cross-component state and backend calls.
- Scope boundaries keep slash commands other than `/resume`, model selection, tools, and provider calls unavailable.

**Test scenarios:**
- Covers AE3. Happy path: typing `hello from tui` and pressing Enter appends the user prompt immediately, sends it through the backend client, and appends `ACK: message received` in the body scrollview.
- Covers AE3. Integration: Unicode and leading/trailing spaces are preserved in the backend result's `receivedText`.
- Happy path: submitting three prompts quickly displays all three user prompts immediately, marks only the second and third as `(pending)`, sends requests to the backend one at a time, and removes each `(pending)` marker when that prompt becomes active.
- Happy path: successful output is visibly labeled as a Rust JSON-RPC ACK / no-model-call proof.
- Edge case: empty or all-whitespace Enter does not call the backend client and does not change body output.
- Edge case: pressing Enter while a request is active queues the new prompt rather than dropping it or sending concurrently.
- Edge case: successful submit clears the composer for the next prompt and leaves the matching prompt/ACK pair visible in the scrollview.
- Error path: backend failure displays a visible red error for the matching prompt and does not silently mark queued prompts as successful.
- Error path: frontend validation failures such as over-limit prompt input render in the same theme error red.
- Error path: prompts or backend errors containing ESC, ANSI CSI, OSC, carriage returns, backspaces, or other terminal-control characters render as safe escaped text and do not clear the screen, move the cursor, set clipboard content, overwrite lines, or change styling unexpectedly.
- Error path: display components have no imports or props that expose provider, tool, session, or model-call behavior.

**Verification:**
- The first interaction proves "Ink sends text, Rust acknowledges receipt, TUI displays the ACK" without invoking any provider, agent loop, or tool.

---

### U12. Implement `/resume` session picker and restore flow
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Make `/resume` the first active slash command: list persisted sessions, let the user choose one, restore transcript/context, and continue appending prompts to that session.

**Requirements:** R10, R12, R21, R22, R23, R24, R25, R26, R27, R29.

**Origin trace:** Extends F1/F2 by adding durable session selection and continuation.

**Dependencies:** U3, U4, U6, U11.

**Files:**
- Create: `tui/src/components/ResumeSessionList.tsx`
- Create: `tui/src/components/__tests__/ResumeSessionList.test.tsx`
- Create: `tui/src/state/sessionTranscriptReducer.ts`
- Create: `tui/src/state/__tests__/sessionTranscriptReducer.test.ts`
- Modify: `tui/src/App.tsx`
- Modify: `tui/src/components/BodyPane.tsx`
- Modify: `tui/src/components/PromptComposer.tsx`

**Approach:**
- Treat `/resume` as a command only when the composer content is exactly `/resume` after trimming. Other slash-prefixed text remains normal prompt content for this slice.
- On `/resume`, call the backend session list method for the current absolute `workspaceCwd` and render only sessions whose stored canonical workspace path matches it, with title/id, updated time, workspace path, and last prompt.
- While the session list is loading, render a compact loading animation directly under the input composer in the same area where the list will appear.
- During session-list loading, treat the composer as command/list mode: do not append typed characters to the prompt, preserve the pre-`/resume` draft, and let Escape cancel back to the composer when possible.
- Render the session list directly under the input composer, not as a full-screen overlay. Show a 5-row visible window over the session list, highlight the currently selected row, and scroll the window as the selection moves.
- Prefix the selected session row with a non-color pointer such as `>` in addition to any color/inverse highlight.
- Apply the picker-open vertical layout contract: BodyPane shrinks first, list height is `min(5, availableRowsForPicker)`, and cwd/composer remain higher priority than decorative/status details.
- Use Up/Down arrow keys to move the highlighted selection; Enter resumes the highlighted session; Escape cancels and returns focus to the composer.
- On selection, call session resume, replace the visible transcript/context with restored entries, set the active `sessionId`, and keep the composer focused for the next prompt.
- During session restore, disable prompt submit and preserve any draft text until restore completes or fails.
- If a direct resume request somehow targets a session from another canonical workspace path, show a red error and keep the current session; never switch cwd or offer cross-workspace resume.
- If the active queue has unsent/in-flight prompts, block `/resume` with a red error until the queue is idle.
- Keep session management minimal: no delete, rename, archive, export, checkpoint, rewind, or fork in this slice.

**Patterns to follow:**
- Use a replaceable display component for the picker; App owns command routing and backend calls.
- Keep loading animations terminal-safe, deterministic in tests, and isolated from persisted transcript/session state.
- Keep important states distinguishable without color: errors include text markers, selected rows include a pointer marker, loading includes static fallback text, and pending rows retain `(pending)`.
- Reference research favors project/workdir-scoped session lists and explicit workdir validation before resume; this slice tightens that to same-canonical-workspace-only.

**Test scenarios:**
- Happy path: `/resume` opens a current-workspace session list sorted by updated time.
- Happy path: while `/resume` is fetching sessions, a compact loading animation appears under the input bar and is replaced by the session list.
- Happy path: typed draft text before `/resume` is preserved while the session list loads and after Escape cancel.
- Happy path: the resume list appears under the input bar with 5 visible rows, a highlighted selected row, and Up/Down arrow navigation that scrolls beyond the visible window.
- Happy path: with colors stripped or `NO_COLOR` set, the selected row is still identifiable by `>` and errors remain identifiable by `ERROR:`/`!`.
- Happy path: opening `/resume` shrinks BodyPane first while preserving cwd, composer, picker rows, and bottom status bar at normal heights.
- Edge case: short terminal height renders fewer than 5 picker rows without hiding the composer or cwd.
- Happy path: selecting a session restores prior user prompts and backend ACK/error entries, then a new prompt appends to the restored session.
- Happy path: restored sessions in a git repo include explicitly written repo-memory rows for that git repo and preserve the launched subpath metadata.
- Edge case: no sessions shows an empty-state message and returns to the composer without crashing.
- Edge case: fewer than 5 sessions renders only the available rows without empty selectable placeholders.
- Edge case: slash text other than exact `/resume` submits as normal prompt content.
- Error path: attempting `/resume` while queued/in-flight prompts exist shows a red error and does not switch sessions.
- Error path: backend list/resume failure shows a red error and preserves the current session.
- Error path: a resume request for a different canonical workspace path shows a red error and preserves the current session/cwd.
- Error path: loading animation stops when list/resume fails or Escape cancels.
- Error path: session list or restore failure returns focus to the composer and preserves the prior draft/current session.
- Error path: red errors retain non-color error markers in color-stripped output.

**Verification:**
- A developer can run the TUI, submit prompts, exit, relaunch, type `/resume`, select the previous session, see the restored transcript/context, and continue submitting prompts into that session.

---

### U7. Create the standalone `kqode` executable
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Add a local executable build that packages the Ink frontend and a prebuilt Rust backend into a true standalone native executable named `kqode`.

**Requirements:** R11, R12, R15. **Technical constraints:** T1, T2, T3.

**Origin trace:** Supports AE3 by making the end-to-end ACK proof runnable from the generated standalone executable.

**Dependencies:** U2, U6, U8, U9, U11, U12.

**Files:**
- Create: `tui/rollup.config.mjs`
- Modify: `tui/package.json`
- Modify: `tui/src/main.tsx`
- Modify: `tui/src/backend/backendProcess.ts`
- Modify: `tui/src/backend/processBackendClient.ts`
- Modify: `.gitignore`
- Modify: `README.md`

**Approach:**
- Use Rollup to bundle the TypeScript Ink entrypoint into `tui/dist/main.js` as the Node SEA input, with an explicit Node target and external/native module handling.
- Configure Rollup for dependency closure: bundle TypeScript TUI code plus runtime JS dependencies such as Ink, React, and JSON-RPC helpers into the SEA entrypoint; externalize only Node built-ins and explicitly documented native/asset cases.
- Validate that `tui/dist/main.js` and the final SEA executable do not require a sibling `node_modules` tree at runtime.
- Use Node SEA and `postject` to produce a native executable at `tui/dist/kqode[.exe]`.
- Compile the Rust backend into `tui/dist/assets/kqode-backend[.exe]` as a staging artifact, then package it as an executable asset for the SEA binary.
- At runtime, the standalone executable extracts or materializes the packaged backend asset into a controlled per-user cache location before launching it.
- Harden backend materialization: use a versioned per-user app cache directory, create directories/files with user-only permissions where supported, write the backend asset with create-new/atomic replacement semantics, never follow symlinks, avoid shared world-writable temp paths, and verify the materialized backend SHA-256 against the embedded asset manifest before every packaged-mode spawn. If the hash mismatches, re-materialize from the embedded asset; if verification still fails, show a red backend materialization error and do not spawn.
- Packaged executable mode must use only the packaged backend asset. Source mode must always use Cargo, even if generated artifacts exist.
- Keep generated artifacts under `tui/dist/` ignored unless the repository later decides to commit release artifacts.
- Document the direct terminal invocation path for `tui/dist/kqode[.exe]` and clarify that it still only runs local JSON-RPC ACK behavior.

**Patterns to follow:**
- Keep executable packaging local and first-slice focused; channel staging is handled separately in U10, while registry publishing, signing/notarization, auto-update, and daemon service work remain deferred.
- Preserve the Rust-core/TypeScript-surface boundary: the standalone executable packages both artifacts but does not move core behavior into TypeScript.

**Test scenarios:**
- Happy path: the executable build produces `tui/dist/kqode[.exe]`.
- Integration: invoking `tui/dist/kqode[.exe]` starts the Ink UI and can submit a prompt through the packaged Rust JSON-RPC backend.
- Integration: copy `tui/dist/kqode[.exe]` to a temporary directory with no `node_modules` tree and verify it still starts the TUI and reaches the local ACK path.
- Error path: Rollup externalizes an unexpected runtime dependency, causing the standalone smoke test to fail before release packaging.
- Edge case: source-mode development still uses the Cargo-backed launch path even when generated executable artifacts exist.
- Edge case: pre-existing files, symlinks, wrong permissions, or backend asset hash mismatch fail with a visible backend materialization error instead of executing the asset.
- Error path: missing or unmaterializable packaged backend asset shows a visible retryable backend error instead of silently falling back to model/tool behavior.

**Verification:**
- A developer can build `tui/dist/kqode[.exe]`, run it directly from the terminal, submit text, and see the Rust JSON-RPC ACK without running a separate backend command.

---

### U10. Prepare cross-platform distribution artifacts
> [!todo] Section review
> - [x] Reviewed this section

**Goal:** Add channel-ready packaging around the standalone executable so the same runtime artifact can be distributed by direct download, npm global install, Homebrew, and winget.

**Requirements:** R15, R16. **Technical constraints:** T2, T3, T4.

**Origin trace:** Extends AE3 by proving the packaged ACK demo has a user-installable artifact shape, not only a developer-local build.

**Dependencies:** U7.

**Files:**
- Modify: `tui/package.json`
- Create: `tui/scripts/distribution/package-release.mjs`
- Modify: `xtask/src/main.rs`
- Create: `docs/release/kqode_distribution_registration.md`
- Modify: `.gitignore`
- Modify: `README.md`

**Approach:**
- Define the first supported target matrix for the standalone executable: macOS arm64/x64, Linux arm64/x64, and Windows arm64/x64. Linux libc split can be refined during implementation if Node SEA or Rust backend constraints require separate GNU/musl artifacts.

| Target artifact | CI runner | Rust backend target | Node/SEA executable source | Archive | Smoke test expectation |
|-----------------|-----------|---------------------|----------------------------|---------|------------------------|
| `kqode-darwin-arm64` | `macos-latest` arm64 when available, otherwise documented cross-build fallback | `aarch64-apple-darwin` | Host/target Node binary copied before SEA injection; run ad-hoc codesign after `postject` when required | `.tar.gz` | Run on matching macOS arm64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-darwin-x64` | `macos-latest` x64 or macOS universal-capable runner | `x86_64-apple-darwin` | Host/target Node binary copied before SEA injection; run ad-hoc codesign after `postject` when required | `.tar.gz` | Run on matching macOS x64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-linux-x64` | `ubuntu-latest` | `x86_64-unknown-linux-gnu` unless musl is later required | Linux x64 Node binary copied before SEA injection | `.tar.gz` | Run the executable smoke test on CI. |
| `kqode-linux-arm64` | `ubuntu-latest` with arm64 runner when available, otherwise documented cross-build fallback | `aarch64-unknown-linux-gnu` unless musl is later required | Linux arm64 Node binary copied before SEA injection | `.tar.gz` | Run on matching Linux arm64 runner when available; otherwise mark as built-only with explicit release note. |
| `kqode-windows-x64` | `windows-latest` | `x86_64-pc-windows-msvc` | Windows x64 Node executable copied before SEA injection | `.zip` | Run the executable smoke test on CI. |
| `kqode-windows-arm64` | Windows arm64 runner when available, otherwise documented cross-build fallback | `aarch64-pc-windows-msvc` | Windows arm64 Node executable copied before SEA injection | `.zip` | Run on matching Windows arm64 runner when available; otherwise mark as built-only with explicit release note. |

- Package direct-download artifacts as `kqode-<target>.tar.gz` for Unix-like targets and `kqode-<target>.zip` for Windows, each containing the standalone executable.
- Generate per-archive `.sha256` files and an aggregate `checksums.txt` for GitHub Release upload.
- Expose release packaging through an xtask command such as `cargo run -p xtask -- package-release`, even if the xtask delegates to package-local npm/Rollup/Node scripts internally.
- Do not generate npm/Homebrew/winget directories under `tui/dist/release/`. Those ecosystems consume published artifact URLs, not local staging folders.
- Write `docs/release/kqode_distribution_registration.md` after the echo/ACK executable works and release archives exist. The guide should walk a maintainer through GitHub Release asset upload/direct download, npm package registration/publish flow, Homebrew formula/tap registration, and winget manifest submission, each pointing at the GitHub Release asset URLs and checksums.
- Define npm distribution as a thin root package with platform-specific optional dependency packages. The root npm `bin` should run a small selector that locates the installed platform package executable; each platform package contains the corresponding prebuilt `kqode` executable and declares `os`/`cpu` metadata. Do not point npm `bin` at the TypeScript/Rollup JS runtime.
- Keep publishing credentials, registry upload, tap submission, winget submission, signing, notarization, and auto-update out of this implementation unit.

**Patterns to follow:**
- Treat package managers as distribution channels around `kqode`, not as separate application runtimes.
- Keep release archive/checksum staging deterministic and generated under `tui/dist/release/`.
- Prefer Cargo-facing release commands in docs and CI; npm remains an implementation detail inside the nested TUI package.
- Keep the source-mode developer path separate from packaged-user install paths.

**Test scenarios:**
- Happy path: release packaging creates a direct-download archive and checksum for the current host target.
- Happy path: every supported target has a declared runner, Rust target, Node/SEA source, archive format, and smoke-test status.
- Happy path: `cargo run -p xtask -- package-release` produces the same archive/checksum layout as the lower-level package script.
- Happy path: release packaging creates an aggregate `checksums.txt` covering all generated archives.
- Happy path: the registration guide names the generated artifact paths, the expected GitHub Release asset URL shape, and the manual publish/registration steps for GitHub direct download, npm, Homebrew, and winget.
- Happy path: the registration guide explains the npm root-selector package and platform optional package layout, including how the root `bin` locates the native executable.
- Edge case: missing standalone executable fails packaging with an explicit error instead of falling back to Cargo or npm runtime execution.
- Edge case: unsupported platform/arch reports a clear unsupported-target error.

**Verification:**
- The generated release archives/checksums and registration guide show how each install channel would deliver the same standalone executable from GitHub Release assets without requiring packaged users to install Cargo or run a backend separately.

---

### U13. Add the GitHub Release asset pipeline
> [!todo] Section review
> - [ ] Reviewed this section

**Goal:** Add a GitHub Actions workflow that builds the cross-platform standalone executable artifacts, creates release archives and checksums, and uploads them to a GitHub Release.

**Requirements:** R15, R16, R28. **Technical constraints:** T2, T3, T4.

**Origin trace:** Turns U10's local release artifacts into direct-download GitHub Release assets for downstream npm/Homebrew/winget registration.

**Dependencies:** U7, U10.

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `xtask/src/main.rs`
- Modify: `tui/package.json`
- Modify: `README.md`
- Modify: `docs/release/kqode_distribution_registration.md`

**Approach:**
- Trigger on version tags such as `v*` and allow manual `workflow_dispatch` for release candidates.
- Build the standalone executable matrix for macOS arm64/x64, Linux arm64/x64, and Windows arm64/x64 using the same `cargo run -p xtask -- package-release` path as local U10.
- Use a two-stage workflow: matrix jobs build and upload workflow artifacts only; one final release job downloads all matrix artifacts, verifies the complete manifest/checksums, creates or updates the GitHub Release idempotently, and uploads per-target archives, per-target `.sha256` files, and aggregate `checksums.txt`.
- Keep this unsigned/not-notarized for the first slice unless implementation discovers platform requirements that block execution entirely.
- Add minimum release authenticity controls: protected release tags/environments where available, explicit least-privilege workflow permissions, pinned third-party actions by version or SHA, GitHub artifact attestations or signed checksums when available, and verification instructions in the registration guide.
- Do not publish npm packages, Homebrew taps, winget submissions, or auto-update metadata from this workflow. Those remain manual steps documented in the registration guide.
- Fail closed if any target archive or checksum is missing.

**Patterns to follow:**
- The workflow should use the same deterministic xtask command used locally so CI and local artifact shapes match.
- The final release job should be the only job with release-write permission; matrix build jobs should not have `contents: write`.
- Package managers consume the uploaded GitHub Release URLs; the workflow should not create package-manager-specific staging directories under `tui/dist/release/`.
- The workflow should make provenance/auditability visible in the release notes or registration guide so downstream package-manager registrations know which checksum/signature/attestation to verify.

**Test scenarios:**
- Happy path: a manual dry-run/release-candidate workflow produces all matrix artifacts as workflow artifacts without publishing package registries.
- Happy path: a tag-triggered run uploads the expected archive/checksum assets to the GitHub Release.
- Happy path: rerunning the workflow for the same tag is idempotent: it replaces or skips identical release assets deliberately instead of producing duplicates or partial releases.
- Happy path: release assets include checksums plus an attestation/signature path, or the workflow fails with a documented reason if the platform feature is unavailable.
- Edge case: missing archive/checksum fails the workflow before release upload completes.
- Edge case: final release job refuses to publish when any matrix artifact is missing, has a checksum mismatch, or has an unexpected target name.
- Edge case: unsupported platform/arch is reported as a matrix/configuration error, not silently skipped.

**Verification:**
- A maintainer can create a tag, run the workflow, and see GitHub Release assets whose URLs match the registration guide's npm/Homebrew/winget examples.

---

## Acceptance Coverage Matrix
> [!todo] Section review
> - [x] Reviewed this section

| Origin acceptance | Planned coverage |
|-------------------|------------------|
| AE1 first render | `tui/src/components/__tests__/HomeScreen.test.tsx` verifies identity, version, cwd, prompt region, hints, model label, One Dark Pro-inspired theme token usage, and resilient layout. |
| AE2 composer wrapping | `tui/src/components/__tests__/PromptComposer.test.tsx` and `tui/src/state/__tests__/composerReducer.test.ts` verify typing, wrapping preservation, inert hints, exact submit snapshots, empty-submit blocking, and post-submit composer clearing. |
| AE3 submit-to-ACK | `tests/main.rs`, `tui/src/backend/__tests__/backendProcess.test.ts`, `tui/src/backend/__tests__/messageProtocol.test.ts`, `tui/src/backend/__tests__/processBackendClient.test.ts`, `tui/src/__tests__/App.submit.test.tsx`, the standalone-executable smoke path, and U10 release-staging checks verify Rust JSON-RPC ACK, guarded launcher behavior, library-backed message protocol helpers, process client behavior, App queue state, exact prompt preservation in `receivedText`, user-prompt transcript display, queued/pending markers, red failure display, direct `kqode` invocation, and channel-ready packaging around the same executable. T1/T2/T3/T4 are covered by the Rust, TypeScript, standalone-executable, and distribution-staging tests. |
| Plan-added session resume | `tests/session_store.rs`, `tui/src/backend/__tests__/sessionProtocol.test.ts`, `tui/src/components/__tests__/ResumeSessionList.test.tsx`, `tui/src/state/__tests__/sessionTranscriptReducer.test.ts`, and App submit/resume tests verify SQLite session creation, transcript/context persistence, current-workspace session listing, `/resume` selection, different-workspace blocking, restored transcript display, and continuation in the selected session. |
| GitHub release assets | `.github/workflows/release.yml` and release-script checks verify matrix artifact generation, checksums, and GitHub Release upload without npm/Homebrew/winget publishing. |

---

## System-Wide Impact
> [!todo] Section review
> - [x] Reviewed this section

- **Interaction graph:** The new surface is a nested TypeScript package plus one Rust binary JSON-RPC backend mode, a Rust-owned SQLite session store, and a standalone executable packaging the runtime artifacts together; no providers, tools, full session protocol, session replay, or VFS are involved.
- **Error propagation:** Rust JSON-RPC errors, malformed responses, backend-process failures, and request timeouts should become visible TUI errors, not swallowed output or silent no-ops.
- **State lifecycle risks:** Session metadata, transcript entries, and first-slice context persist in SQLite; full trace/replay state remains out of scope and dist output remains generated for this slice.
- **API surface parity:** The backend mode is an internal integration proof, not a public CLI contract. Headless agent functionality remains unchanged.
- **Integration coverage:** Cross-layer coverage is required for the process backend client and the App submit flow because component tests alone cannot prove Rust/Ink wiring.
- **Unchanged invariants:** Slash/status hints remain inert except for `/resume`, model label remains static, and KQode still does not run a model/provider/tool from the TUI.

---

## Risks & Dependencies
> [!todo] Section review
> - [x] Reviewed this section

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
> [!todo] Section review
> - [x] Reviewed this section

- Update `README.md` with the minimal TUI run path and clarify that this first TUI only ACKs submitted text.
- Document both source-mode and standalone-executable terminal testing paths.
- Document Cargo-facing xtask commands for contributor workflows, including fixture preparation, TUI build/test orchestration, and release packaging; npm commands remain package-internal implementation details.
- Document `/resume` as the only active slash command in this slice and clarify that it restores the local ACK transcript/context, not a real model conversation.
- Document the intended install channels as artifact consumers: direct download, `npm install -g`, Homebrew, and winget.
- Add `docs/release/kqode_distribution_registration.md` as the maintainer guide for registering/publishing generated artifacts after the echo executable is working.
- Document the GitHub Release workflow trigger, expected release assets, and the relationship between uploaded asset URLs and downstream npm/Homebrew/winget registration.
- Clarify that Cargo is required only for source-mode development, not for packaged-user execution.
- Do not document slash commands other than `/resume`, model selection, or real agent behavior as available from this TUI slice.
- Keep any backend ACK wording framed as a development/demo seam, not as the final session protocol.

---

## Sources & References
> [!todo] Section review
> - [x] Reviewed this section

- **Origin document:** [docs/brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md](../brainstorms/2026-06-25-first-ink-tui-homepage-requirements.md)
- Product architecture: [docs/kqode_architecture_spec.md](../kqode_architecture_spec.md)
- Build path: [docs/kqode_build_path.md](../kqode_build_path.md)
- Adjacent context plan: [docs/plans/2026-06-25-002-feat-context-intent-retrieval-planning-plan.md](2026-06-25-002-feat-context-intent-retrieval-planning-plan.md)
- Reference spawn architecture research: [docs/research/2026-06-25-tui-backend-spawn-architecture.md](../research/2026-06-25-tui-backend-spawn-architecture.md)
- Reference session/resume research: [docs/research/2026-06-26-session-resume-storage-patterns.md](../research/2026-06-26-session-resume-storage-patterns.md)
- Ink documentation: [github.com/vadimdemedes/ink](https://github.com/vadimdemedes/ink)
- Ink testing utilities: [github.com/vadimdemedes/ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- Node child processes: [nodejs.org/api/child_process.html](https://nodejs.org/api/child_process.html)
- Node SEA: [nodejs.org/api/single-executable-applications.html](https://nodejs.org/api/single-executable-applications.html)
- `postject`: [github.com/nodejs/postject](https://github.com/nodejs/postject)
- npm `package.json` `bin`: [docs.npmjs.com/cli/v11/configuring-npm/package-json#bin](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin)
- Homebrew formula cookbook: [docs.brew.sh/Formula-Cookbook](https://docs.brew.sh/Formula-Cookbook)
- winget manifests: [learn.microsoft.com/windows/package-manager/package/manifest](https://learn.microsoft.com/windows/package-manager/package/manifest)
- JSON-RPC reference: [jsonrpc.org/specification](https://www.jsonrpc.org/specification)
- NO_COLOR guidance: [no-color.org](https://no-color.org/)
