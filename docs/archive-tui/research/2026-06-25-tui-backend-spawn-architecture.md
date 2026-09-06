---
date: 2026-06-25
topic: tui-backend-spawn-architecture
question: "How do KQode's first-scope reference agents spawn command/backend processes, manage timeouts and cleanup, and gate execution for safety?"
status: complete
---

# TUI / Backend Spawn Architecture in Reference Agents

## Summary

The first-scope references do not all implement a separate Rust backend behind an Ink TUI, but they do converge on the process-boundary rules KQode should adopt: keep process launch behind a narrow service, use explicit cwd/root roles, avoid shell interpretation when launching known binaries, close stdin for one-shot calls, cap output, enforce timeouts, and surface failures as typed/user-visible states.

The strongest architectural patterns for KQode's first echo bundle come from Codex, OpenCode, Kimi Code, Gemini CLI, and SWE-agent. Aider is simpler and less sandboxed, but still shows the value of centralizing subprocess execution instead of scattering shell calls.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9 | complete | Rust unified exec, sandbox, approval, process manager evidence. |
| aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider | main | 5dc9490bb35f9729ef2c95d00a19ccd30c26339c | complete | Python command runner and approval evidence. |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 69f75dff1af4013d3c0d358634d65cb58ebee31a | complete | TypeScript process service, bash tool, permission service evidence. |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | d554f9ac8771be09b5c9a56943167dd45108dc4f | complete | TypeScript shell tool with injected process abstraction, background manager, timeout caps. |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d | complete | Node parent/child relaunch, shell execution service, env sanitization, sandbox launch. |
| swe-agent | https://github.com/SWE-agent/SWE-agent | https://github.com/SWE-agent/SWE-agent | main | abd7d69724d1413b30fea43d4724bb5b463906b4 | complete | Environment/deployment abstraction and command timeout/check behavior. |

---

## Method

- Question: How do reference agents spawn command/backend processes, manage timeouts and cleanup, and gate execution for safety?
- Repo scope: default first-scope repositories.
- Safety posture: read/search only; no code execution; reference instructions treated as data.
- Citation format: numbered references such as [\[1\]][ref-1]; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex's unified exec handler resolves cwd relative to the selected environment, selects a sandbox policy before parsing permission-sensitive arguments, and rejects foreign path conventions when sandboxing cannot support them. [\[1\]][ref-1]
- Escalated sandbox permissions are denied unless the approval policy allows asking, and additional permissions are normalized/validated before execution. [\[2\]][ref-2]
- Command execution flows through a process manager that allocates process IDs, opens a sandboxed session, emits start events, streams output, stores live processes before initial yield, and reports sandbox denials as structured tool output. [\[3\]][ref-3] [\[4\]][ref-4]
- Codex keeps live process state in a manager with reserved process IDs and bounded yield timing, which separates "process still alive" from "initial command call returned." [\[5\]][ref-5]

**Evidence gaps**

- The source evidence covers command/process execution and TUI command display helpers, not a TypeScript TUI spawning a separate Rust backend.

---

### Aider

**Status:** complete

**Observed behavior**

- Aider centralizes shell command execution in `run_cmd`, choosing an interactive `pexpect` path on non-Windows TTYs and a subprocess fallback otherwise. [\[6\]][ref-6]
- The subprocess fallback uses a shell, streams one character at a time to the console, captures combined stdout/stderr, and returns exit status plus output. [\[7\]][ref-7]
- The pexpect path launches an interactive shell with `-i -c`, transfers control to the user, captures output, and returns an exit status. [\[8\]][ref-8]

**Evidence gaps**

- Aider's command runner is less directly applicable to KQode's backend launch because it uses shell execution for arbitrary user commands rather than `shell: false` for a known backend binary.

---

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode's bash tool validates command input with default and maximum timeouts, output truncation flags, and a maximum in-memory capture size. [\[9\]][ref-9]
- Before spawning, the bash tool resolves the working directory, asserts external-directory permissions, emits advisory warnings for absolute path arguments outside cwd, and asserts command permissions. [\[10\]][ref-10]
- OpenCode creates child processes through an `AppProcess` service, using `shell: false`, detached mode outside Windows/Bun, explicit cwd/env, timeout, stdout/stderr byte caps, and typed timeout errors. [\[11\]][ref-11] [\[12\]][ref-12]
- Permission evaluation defaults unknown action/resource pairs to `ask`, supports allow/deny/ask effects, and turns `ask` into a pending permission request whose deferred result must be resolved. [\[13\]][ref-13]

**Evidence gaps**

- OpenCode's process layer targets shell tools and background jobs, not a bundled Rust backend, but the service shape is directly relevant.

---

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi Code's bash tool documents that shell execution goes through an injected `Kaos` abstraction and `BackgroundManager`, not direct `node:child_process` calls inside the tool. [\[14\]][ref-14]
- The tool schema has default/max timeout rules for foreground and background commands, validates timeout caps, and requires background descriptions when background mode is used. [\[15\]][ref-15] [\[16\]][ref-16]
- The spawn path sets non-interactive environment variables such as `NO_COLOR`, `TERM=dumb`, and `GIT_TERMINAL_PROMPT=0`, routes through the environment shell, and closes process stdin immediately after spawn to avoid hangs. [\[17\]][ref-17] [\[18\]][ref-18]
- Foreground execution registers a managed task, applies timeouts and abort signals through the background manager, can detach foreground commands, reports timeout/kill/failure distinctly, and persists full output when previews are truncated. [\[19\]][ref-19] [\[20\]][ref-20]

**Evidence gaps**

- Kimi Code's implementation uses a shell abstraction and background-task manager; KQode's first echo backend should borrow lifecycle controls without adding background execution.

---

### Gemini CLI

**Status:** complete

**Observed behavior**

- Gemini CLI starts with a lightweight parent process that avoids heavy imports, computes spawn args/env, pauses stdin, spawns a child Node process with inherited stdio plus IPC, and relaunches on a specific exit code. [\[21\]][ref-21]
- The heavy child path imports the main CLI and wraps fatal cleanup with a forced 5-second timeout, preventing cleanup hangs from blocking exit forever. [\[22\]][ref-22]
- Gemini's shell execution service prepares execution by resolving shell configuration, adding UTF-8/codepage guards, sanitizing environment variables, disabling interactive credential prompts for non-interactive runs, and delegating sandbox command preparation to a sandbox manager. [\[23\]][ref-23]
- Its child-process fallback uses `spawn` with `shell: false`, stdio pipes, explicit cwd/env, process tracking, lifecycle attachment, group kill on abort, output truncation, binary detection, and cleanup on close/error. [\[24\]][ref-24] [\[25\]][ref-25]
- Gemini's sandbox launcher validates macOS Seatbelt profiles, prevents path traversal via profile basename handling, starts optional proxy processes with cleanup handlers, validates Docker image names and mount paths, mounts cwd/settings/tmp paths explicitly, and spawns the sandbox with inherited stdio. [\[26\]][ref-26] [\[27\]][ref-27]

**Evidence gaps**

- Gemini's parent/child split is a Node-to-Node relaunch, not frontend-to-Rust IPC, but it is the strongest first-scope example of a CLI wrapper spawning a heavier runtime safely.

---

### SWE-agent

**Status:** complete

**Observed behavior**

- SWE-agent wraps execution in an environment/deployment abstraction, with Docker deployment as the default configuration and per-command post-startup timeouts. [\[28\]][ref-28]
- Environment startup initializes deployment, creates a bash session with a startup timeout, sets non-interactive environment variables such as `PAGER=cat`, and runs post-startup commands with configured timeouts. [\[29\]][ref-29]
- Runtime command communication sends commands through the deployment runtime with timeout and check modes, logs input/output, and raises after closing the environment when `check="raise"` fails. [\[30\]][ref-30]
- SWE-agent also exposes an independent runtime `execute` path for commands outside the session, again through the deployment abstraction rather than direct subprocess calls in the caller. [\[31\]][ref-31]

**Evidence gaps**

- SWE-agent is benchmark/runtime oriented and container-first; it is less applicable to a local TUI bundle but useful for lifecycle boundaries and timeout/check semantics.

---

## Cross-Repo Comparison

| Dimension | Codex | Aider | OpenCode | Kimi Code | Gemini CLI | SWE-agent | Confidence |
|---|---|---|---|---|---|---|---|
| Process boundary shape | Rust unified exec manager with sandbox/approval context. [\[1\]][ref-1] [\[3\]][ref-3] | Central `run_cmd` chooses pexpect or subprocess. [\[6\]][ref-6] | `AppProcess` service wraps child process spawn, timeout, output caps. [\[11\]][ref-11] | Injected `Kaos` plus `BackgroundManager`, not raw child process calls. [\[14\]][ref-14] | Lightweight parent spawns heavy child; shell service wraps child processes. [\[21\]][ref-21] [\[24\]][ref-24] | Deployment/runtime abstraction owns commands. [\[28\]][ref-28] | high |
| Timeout and cleanup | Yield windows and process store distinguish alive/exited state. [\[4\]][ref-4] [\[5\]][ref-5] | No clear timeout in `run_cmd`; simpler exit-status capture. [\[7\]][ref-7] | Timeout and output caps flow through `AppProcess.run`. [\[12\]][ref-12] | Foreground/background timeout caps, abort, detach, kill handling. [\[15\]][ref-15] [\[20\]][ref-20] | Abort kills process group; cleanup and log streams run on close/error. [\[25\]][ref-25] | Command/session startup timeouts and check modes. [\[29\]][ref-29] [\[30\]][ref-30] | high |
| Safety gates | Sandbox selection, escalated permission rejection, additional-permission validation. [\[1\]][ref-1] [\[2\]][ref-2] | User confirmation exists elsewhere, but command runner itself is shell-centric. [\[6\]][ref-6] | Unknown permissions default to ask; command and external-dir permission assertions precede spawn. [\[10\]][ref-10] [\[13\]][ref-13] | Tool schema caps plus non-interactive env; broader approval lives in tool execution metadata. [\[15\]][ref-15] [\[17\]][ref-17] | Env sanitization, non-interactive credential suppression, sandbox manager, sandbox mount validation. [\[23\]][ref-23] [\[27\]][ref-27] | Container/deployment boundary and check modes. [\[28\]][ref-28] [\[30\]][ref-30] | high |
| TUI/backend spawn relevance | Strong for Rust process manager, less for JS frontend. [\[3\]][ref-3] | Low; arbitrary shell command runner. [\[7\]][ref-7] | Strong for service boundary and shell:false spawn. [\[11\]][ref-11] | Strong lifecycle lessons, but shell abstraction is heavier than KQode needs. [\[14\]][ref-14] | Strong parent/child CLI spawn and cleanup model. [\[21\]][ref-21] [\[22\]][ref-22] | Medium; runtime abstraction and timeout/check lessons. [\[28\]][ref-28] | partial-high |

---

## KQode Lessons

### Product behavior

- Label the first echo output as local backend/protocol proof, not assistant output. Gemini and Kimi both distinguish process lifecycle states from final user-facing results, and KQode should prevent users from mistaking an echo for a failed model answer. [\[20\]][ref-20] [\[22\]][ref-22]
- Make direct terminal testing a first-class outcome: Gemini's lightweight parent/heavy child pattern shows that startup wrappers can exist purely to make the runtime ergonomic without moving core behavior into the UI layer. [\[21\]][ref-21]

### Architecture implications

- KQode should introduce a tiny backend process runner/launcher even for the echo slice. OpenCode, Kimi, Gemini, and SWE-agent all centralize process execution behind a service/manager/deployment abstraction rather than scattering spawn calls. [\[11\]][ref-11] [\[14\]][ref-14] [\[23\]][ref-23] [\[28\]][ref-28]
- The source-mode and dist-mode backend launchers should share the same guard envelope: explicit cwd roles, `shell: false` for known binaries, stdin closed after the single JSON-RPC request, timeout, output cap, no extra stdout logs, and typed error mapping. This is supported by OpenCode's `AppProcess.run`, Gemini's child-process fallback, and Kimi's closed-stdin hardening. [\[11\]][ref-11] [\[24\]][ref-24] [\[18\]][ref-18]
- KQode should defer broad policy/sandbox infrastructure but still encode first-slice safety gates: only approved internal launch modes, no user-supplied executable or shell string, sanitized/minimal env, bounded output, and visible failure. Codex and OpenCode show permission gates before process execution; Gemini adds env sanitization and sandbox preparation. [\[2\]][ref-2] [\[10\]][ref-10] [\[13\]][ref-13] [\[23\]][ref-23]

### Evaluation ideas

- Add deterministic tests for clean-checkout source launch, dist launch, backend timeout, oversized JSON-RPC response, malformed JSON-RPC response, and missing backend binary. These mirror timeout/output/cap/error surfaces in OpenCode, Kimi, Gemini, and SWE-agent. [\[12\]][ref-12] [\[20\]][ref-20] [\[25\]][ref-25] [\[30\]][ref-30]
- Add a test that verifies stdout contains only the JSON-RPC response and no logs. Gemini and OpenCode both treat output stream handling and truncation as explicit contracts, which should be true for KQode's first protocol seam too. [\[9\]][ref-9] [\[24\]][ref-24]

### Risks and tradeoffs

- Borrow lifecycle controls, not full shell-tool complexity. Kimi's background manager and Gemini's sandbox launcher are robust but much larger than a one-shot echo backend; KQode's first slice should keep background jobs, generic shell execution, and sandbox policy engines deferred. [\[19\]][ref-19] [\[26\]][ref-26]
- Aider is a useful cautionary contrast: centralization is good, but shell-based arbitrary command execution is not the right default for KQode's known backend binary. [\[7\]][ref-7]

---

## Evidence Gaps

- No first-scope repo exactly matches "TypeScript Ink frontend spawns Rust backend over JSON-RPC." The recommendations are inferred from adjacent, source-evidenced process-boundary patterns.
- Kimi Code source contains richer approval/policy code, but this report focused on shell spawn lifecycle and did not exhaustively trace its full permission scheduler.
- SWE-agent relies on SWE-ReX runtime abstractions; this report cites the caller-side lifecycle and timeout contract, not the implementation of the external runtime package.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: unified exec cwd resolution and sandbox selection before permission-sensitive parsing ([code](https://github.com/openai/codex/blob/c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs#L141-L179)).
- <a id="ref-2"></a>[2] Codex CLI: escalated sandbox permissions and additional permission validation before execution ([code](https://github.com/openai/codex/blob/c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs#L254-L312)).
- <a id="ref-3"></a>[3] Codex CLI: unified exec handler delegates to process manager and maps sandbox denial into structured output ([code](https://github.com/openai/codex/blob/c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs#L343-L391)).
- <a id="ref-4"></a>[4] Codex CLI: process manager opens sandboxed session, emits begin events, streams output, and stores live process before yielding ([code](https://github.com/openai/codex/blob/c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9/codex-rs/core/src/unified_exec/process_manager.rs#L399-L469)).
- <a id="ref-5"></a>[5] Codex CLI: process manager state, reserved process IDs, and yield-time clamping ([code](https://github.com/openai/codex/blob/c38b2e9ba69cb57d197c6e5ba78b5e52ae0870f9/codex-rs/core/src/unified_exec/mod.rs#L134-L180)).
- <a id="ref-6"></a>[6] Aider: centralized command runner chooses pexpect or subprocess and returns status/output ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/run_cmd.py#L11-L23)).
- <a id="ref-7"></a>[7] Aider: subprocess fallback runs through shell, streams combined output, and returns exit code/output ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/run_cmd.py#L42-L86)).
- <a id="ref-8"></a>[8] Aider: pexpect interactive shell path captures output and exit status ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/run_cmd.py#L89-L132)).
- <a id="ref-9"></a>[9] OpenCode: bash tool schema defines default/max timeouts and capture/truncation output fields ([code](https://github.com/anomalyco/opencode/blob/69f75dff1af4013d3c0d358634d65cb58ebee31a/packages/core/src/tool/bash.ts#L16-L44)).
- <a id="ref-10"></a>[10] OpenCode: bash tool resolves cwd, asserts external-directory and command permissions, and emits external-path warnings ([code](https://github.com/anomalyco/opencode/blob/69f75dff1af4013d3c0d358634d65cb58ebee31a/packages/core/src/tool/bash.ts#L120-L169)).
- <a id="ref-11"></a>[11] OpenCode: child process service supports stdin, output/error caps, timeout, abort, and typed errors ([code](https://github.com/anomalyco/opencode/blob/69f75dff1af4013d3c0d358634d65cb58ebee31a/packages/core/src/process.ts#L22-L52)).
- <a id="ref-12"></a>[12] OpenCode: process service collects bounded streams and applies timeout/abort behavior ([code](https://github.com/anomalyco/opencode/blob/69f75dff1af4013d3c0d358634d65cb58ebee31a/packages/core/src/process.ts#L118-L193)).
- <a id="ref-13"></a>[13] OpenCode: permission evaluation defaults unknown actions to ask and assert creates pending requests for ask decisions ([code](https://github.com/anomalyco/opencode/blob/69f75dff1af4013d3c0d358634d65cb58ebee31a/packages/core/src/permission.ts#L75-L85)).
- <a id="ref-14"></a>[14] Kimi Code: bash tool documents injected Kaos/background manager dependencies and hardening goals ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L1-L23)).
- <a id="ref-15"></a>[15] Kimi Code: bash input schema defines foreground/background timeout defaults and maximums ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L40-L93)).
- <a id="ref-16"></a>[16] Kimi Code: run request validation blocks unavailable background mode and missing background descriptions ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L328-L349)).
- <a id="ref-17"></a>[17] Kimi Code: spawn path sets non-interactive env and executes through Kaos shell abstraction ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L196-L220)).
- <a id="ref-18"></a>[18] Kimi Code: execution closes process stdin immediately after spawn ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L243-L254)).
- <a id="ref-19"></a>[19] Kimi Code: execution registers foreground/background tasks with timeout, detach, and abort handling ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L270-L326)).
- <a id="ref-20"></a>[20] Kimi Code: foreground completion distinguishes timeout, user interrupt, killed/failed, success, and exit-code failure ([code](https://github.com/moonshotai/kimi-code/blob/d554f9ac8771be09b5c9a56943167dd45108dc4f/packages/agent-core/src/tools/builtin/shell/bash.ts#L351-L400)).
- <a id="ref-21"></a>[21] Gemini CLI: lightweight parent process spawns heavy child with inherited stdio and IPC ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/index.ts#L84-L130)).
- <a id="ref-22"></a>[22] Gemini CLI: heavy child wraps cleanup in a forced timeout and formats fatal errors ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/index.ts#L147-L190)).
- <a id="ref-23"></a>[23] Gemini CLI: shell execution preparation sanitizes env, suppresses interactive prompts, and delegates sandbox preparation ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/services/shellExecutionService.ts#L421-L545)).
- <a id="ref-24"></a>[24] Gemini CLI: child-process fallback uses shell:false with explicit cwd/env and lifecycle tracking ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/services/shellExecutionService.ts#L547-L620)).
- <a id="ref-25"></a>[25] Gemini CLI: child-process fallback handles output truncation, binary detection, abort group kill, and cleanup on close/error ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/services/shellExecutionService.ts#L663-L878)).
- <a id="ref-26"></a>[26] Gemini CLI: macOS Seatbelt sandbox validates profile names/paths and proxy cleanup ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/src/utils/sandbox.ts#L61-L90)).
- <a id="ref-27"></a>[27] Gemini CLI: container sandbox validates image/mounts, sets workdir, clears entrypoint, and mounts cwd/settings/tmp paths ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/src/utils/sandbox.ts#L241-L440)).
- <a id="ref-28"></a>[28] SWE-agent: environment config defaults to Docker deployment and defines post-startup command timeouts ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/environment/swe_env.py#L24-L43)).
- <a id="ref-29"></a>[29] SWE-agent: environment startup initializes deployment/session, sets non-interactive env, and runs post-startup commands with timeouts ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/environment/swe_env.py#L109-L190)).
- <a id="ref-30"></a>[30] SWE-agent: runtime command communication applies timeout and check modes, logs output, and closes on raise failures ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/environment/swe_env.py#L197-L232)).
- <a id="ref-31"></a>[31] SWE-agent: independent runtime execute path delegates to deployment runtime rather than direct caller subprocess ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/environment/swe_env.py#L265-L276)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
[ref-20]: #ref-20
[ref-21]: #ref-21
[ref-22]: #ref-22
[ref-23]: #ref-23
[ref-24]: #ref-24
[ref-25]: #ref-25
[ref-26]: #ref-26
[ref-27]: #ref-27
[ref-28]: #ref-28
[ref-29]: #ref-29
[ref-30]: #ref-30
[ref-31]: #ref-31
