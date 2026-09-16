---
date: 2026-09-10
topic: windows-shell-sandbox-platforms
question: "参考 coding agents 在 Windows 上依赖 Git Bash、Cygwin、WSL，还是为 Windows/Linux/macOS 分别实现 shell 与 sandbox？对 KQode Windows-first U5 有什么借鉴？"
status: partial
---

# Windows-first：参考 Agent 的 Shell 与 Sandbox 平台分工

## Summary

**不是统一把 Windows 命令转交 Linux，也不是为三个平台重写三套 agent loop。** Codex、Gemini CLI、DeepSeek Harness 都有共享的 sandbox 接口或策略层，再根据宿主平台选择独立的执行 backend。Windows 路径使用原生 Windows 安全机制；Linux 和 macOS 各自使用对应的隔离机制。[\[1\]][ref-1] [\[13\]][ref-13] [\[18\]][ref-18]

**Shell 兼容与权限隔离是两层。** Kimi 的已检查本地 shell 选择偏向 Windows Git Bash；Pi 的 Bash 工具也优先找 Git Bash，并兼容 PATH 上的其他 Bash，同时另有 PowerShell 工具。OpenCode 当前源码已优先发现 PowerShell，Git Bash 是候选而非唯一要求。这些选择本身不能证明具有 OS sandbox。[\[6\]][ref-6] [\[8\]][ref-8] [\[10\]][ref-10] [\[12\]][ref-12]

本轮六个仓库均成功刷新并固定 SHA；整体标记 `partial`，因为 OpenCode、Kimi、Pi 的已检查本地执行路径没有找到平台 OS sandbox，不能据此断言所有扩展或远程运行方式都没有隔离。以下是源码研究，不是跨平台运行验证或安全认证。

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Fetch time (UTC) |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `ddea03ad049142943bdbf13e937b1d67e8c1ba0c` | complete | 2026-09-10T05:40:15Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `859106eb17d5b840475f5e4b78e64c9622f8750e` | partial: sandbox `not_found` in inspected path | 2026-09-10T05:40:18Z |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `9f7e68e8bdb70d3e5cde5a924740e357ede2fc40` | partial: sandbox `not_found` in inspected path | 2026-09-10T05:40:22Z |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `ed2ac40df67a319bf348bd7e3d10494696b31b38` | complete | 2026-09-10T05:40:25Z |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `400d6905ce46ec46e79da8a7701b1b48850192df` | partial: sandbox `not_found` in inspected path | 2026-09-10T05:40:28Z |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `aa8262ec091698bae9a6b04773a6b5b06ad4aef2` | complete | 2026-09-10T05:40:32Z |

Cache root: `~/.kqode/research/repos/<repo-id>`. Every selected checkout was fetched anonymously and detached at the recorded commit.

## Method

- Scope: the six default catalog repositories, including DeepSeek Harness.
- Themes: shell selection; Windows path compatibility; sandbox dispatch; native Windows token/process creation; filesystem/network boundaries.
- Search before targeted reads; no reference repository was built, installed, tested, or executed.
- Reference instruction files were not loaded as active instructions. No reference implementation was copied into KQode.
- Claims apply to the pinned source paths, not remembered behavior from earlier reports or every product mode.
- Numbered references link to exact source commits. Negative findings are bounded to the inspected execution path.

## Per-Repo Findings

### Codex CLI

**Status: complete for platform routing and the inspected Windows enforcement path.**

- `default_user_shell_from_path` chooses PowerShell on Windows, with a cmd fallback; Unix respects the discovered user shell, then uses platform-specific zsh/bash fallbacks. This is native shell selection rather than mandatory Cygwin/WSL forwarding. [\[2\]][ref-2]
- The shared sandbox manager selects `WindowsRestrictedToken`, `LinuxSeccomp`, or `MacosSeatbelt`. Its request carries common permission, cwd, environment and network data; platform-specific launch preparation sits below that contract. [\[1\]][ref-1]
- The Windows implementation constructs restricted tokens and workspace capability SIDs, including a `WRITE_RESTRICTED` path. It is not simply an AppContainer implementation. The source explicitly distinguishes unelevated and elevated enforcement: the unelevated path refuses unsupported deny-read/split-read restrictions instead of running unrestricted. [\[3\]][ref-3] [\[4\]][ref-4]
- The Windows setup path has dedicated firewall rules for an offline identity, including outbound and loopback handling. This is separate machinery from process lifetime ownership and filesystem permissions; it is not evidence that every restricted-token configuration alone blocks the network. [\[5\]][ref-5]

**Evidence gaps:** no execution of elevated setup, firewall modifications, or compatibility tests. This report does not endorse reproducing its host provisioning automatically.

### OpenCode

**Status: partial (`not_found` for OS sandbox in the inspected local shell path).**

- Current Windows shell candidates are `pwsh`, `powershell`, Git Bash, then `COMSPEC`/cmd; explicit configuration or a resolvable `SHELL` can take precedence. macOS/Linux have their own native shell discovery/fallbacks. “OpenCode on Windows requires only Git Bash” would be an outdated or overbroad conclusion for this SHA. [\[6\]][ref-6]
- The shell tool asks for external-directory and command permissions, then creates a local child process. PowerShell gets explicit noninteractive arguments; other shells use the selected shell. In this path, permission prompts and process creation are visible, but no token, namespace or Seatbelt wrapper was found. [\[7\]][ref-7]
- Its Windows process-tree cleanup uses `taskkill`, whereas Unix uses process-group signals. That is platform-specific lifecycle support, not a demonstrated file/network sandbox. [\[6\]][ref-6]

**Evidence gaps:** remote execution, plugins and other product integrations are outside this local-path trace.

### Kimi Code CLI

**Status: partial (`not_found` for OS sandbox in the inspected KAOS local path).**

- The current `packages/kaos` implementation chooses Git Bash on Windows, honoring `KIMI_SHELL_PATH` and searching Git installation locations. On Unix it searches bash and falls back to sh. This is a Windows Bash compatibility strategy, not automatic migration into a Linux sandbox. [\[8\]][ref-8]
- `LocalKaos.exec` and `execWithEnv` call Node child-process spawning with local cwd/environment options. No OS isolation wrapper was found in these methods. The inference is limited to this local backend, not KAOS remote backends or the full product. [\[9\]][ref-9]

**Evidence gaps:** current checkout also contains other execution modules; this report does not claim exhaustive coverage. In particular, do not reuse older Python source paths as if they described this refreshed TypeScript local backend.

### Gemini CLI

**Status: complete for factory routing and the inspected native helpers.**

- Windows shell discovery prefers PowerShell 7, with Windows PowerShell fallback; Linux/macOS use bash in this utility. [\[14\]][ref-14]
- With sandbox enabled, `createSandboxManager` chooses distinct Windows, Linux and macOS managers. Disabled sandbox uses `NoopSandboxManager`; having implementations does not imply every invocation is sandboxed. [\[13\]][ref-13]
- Windows uses a C# `GeminiSandbox.exe` helper. The inspected helper creates a restricted token, lowers integrity and establishes a Job Object. Linux prepares Bubblewrap/seccomp arguments; macOS invokes `sandbox-exec`. These are separate platform backends, not a common Cygwin layer. [\[15\]][ref-15] [\[16\]][ref-16] [\[17\]][ref-17]
- **Do not copy the Windows network path as proof of network denial:** in the inspected helper, the network-disabled branch sets a very small Job Object bandwidth limit and logs a warning if that setup fails. This source path is not equivalent to a demonstrated fail-closed connection ban. [\[15\]][ref-15]

**Evidence gaps:** helper behavior was not exercised. The network observation is a bounded design caveat, not a complete vulnerability assessment.

### Pi Coding Agent

**Status: partial (`not_found` for OS sandbox in the inspected local shell operations).**

- The Bash tool prefers Git Bash on Windows, then looks for `bash.exe` on PATH; its source explicitly anticipates Cygwin/MSYS2/WSL candidates and special handling for the legacy WSL bash launcher. Unix uses bash/sh. This is the clearest example in the set of a Bash compatibility-oriented execution path. [\[10\]][ref-10]
- The same checkout also includes a separate PowerShell tool, backed by Windows PowerShell discovery. Therefore “Pi has only Bash” is not accurate for the current source. [\[10\]][ref-10] [\[12\]][ref-12]
- Shared local shell operations spawn the chosen shell, collect output and apply cancellation/timeout cleanup. No mandatory OS sandbox is visible in those operations. Extensions can replace operations, so the negative finding does not cover extension-provided isolation. [\[11\]][ref-11]

### DeepSeek Harness

**Status: complete for local platform selection and inspected Windows runner.**

- `PLATFORM_CHAINS` dispatches by host OS: Linux chooses Bubblewrap then Landlock, macOS Seatbelt, Windows `windows-acl`. Missing confinement fails closed rather than returning the original argv. This is an explicit shared-interface/platform-backend design. [\[18\]][ref-18]
- The Windows shell implementation resolves PowerShell 7, PATH candidates, then Windows PowerShell 5.1. Its Windows sandbox runner wraps the requested executable rather than invoking Linux. [\[19\]][ref-19] [\[20\]][ref-20]
- The runner constructs a restricted token with workspace/private-temp capability grants. Process launch adapts a shared native Win32 process owner, including a kill-on-close Job path. These are Windows APIs behind a TypeScript interface, not Cygwin providing isolation. [\[20\]][ref-20] [\[21\]][ref-21]
- Importantly, the backend explicitly reports Windows ACL enforcement as **partial**: its source documents Everyone-write and NTFS hard-link alias limitations. Workspace grants and private-temp lifecycle are also distinct. This is evidence for exposing enforcement limits, not evidence that its backend already satisfies KQode's stronger “outside writes always denied” acceptance criterion. [\[18\]][ref-18]

**Evidence gaps:** the inspected ACL runner does not establish complete network isolation; do not infer that from the filesystem backend or its name.

## Cross-Repo Comparison

| Agent | Windows shell strategy | Sandbox platform strategy | What this establishes |
|---|---|---|---|
| Codex | Native PowerShell; cmd fallback | Windows restricted-token/elevated paths; Linux and macOS backends | Shared policy, native platform enforcement. [\[1\]][ref-1] [\[2\]][ref-2] [\[4\]][ref-4] |
| OpenCode | PowerShell candidates before Git Bash/cmd unless overridden | Local permission checks and child spawn found; OS sandbox not found in trace | Native shell support is separate from sandbox support. [\[6\]][ref-6] [\[7\]][ref-7] |
| Kimi | Windows Git Bash; Unix bash/sh | Local KAOS spawn found; OS sandbox not found in trace | Shell compatibility rather than demonstrated isolation. [\[8\]][ref-8] [\[9\]][ref-9] |
| Gemini | Windows PowerShell; Unix bash | Windows native helper, Linux Bubblewrap, macOS Seatbelt | Explicit platform managers; enabled/disabled distinction matters. [\[13\]][ref-13] [\[14\]][ref-14] [\[15\]][ref-15] [\[16\]][ref-16] [\[17\]][ref-17] |
| Pi | Git Bash/PATH Bash compatibility plus a separate PowerShell tool | Local shell operations; OS sandbox not found in trace | Bash compatibility and native PowerShell can coexist. [\[10\]][ref-10] [\[11\]][ref-11] [\[12\]][ref-12] |
| DeepSeek | Native PowerShell implementation on Windows | Linux bwrap/Landlock; macOS Seatbelt; Windows ACL/token runner | Explicit platform chain and partial-enforcement reporting. [\[18\]][ref-18] [\[19\]][ref-19] [\[20\]][ref-20] |

## KQode Lessons

### Product behavior

- **Keep Windows-first genuinely native.** Recommend PowerShell as the first Windows shell adapter; a future explicit Git Bash choice should be a shell feature, not a substitute for sandbox enforcement. This fits the native paths observed in Codex/Gemini and the separation demonstrated by Pi/OpenCode. [\[2\]][ref-2] [\[6\]][ref-6] [\[10\]][ref-10] [\[14\]][ref-14]
- **Do not silently forward a Windows command into WSL.** It changes the chosen execution environment rather than merely implementing the same backend. Pi's explicit legacy-WSL transport handling illustrates why this needs distinct handling rather than an invisible fallback. This is a recommendation, not a claim that all references forbid WSL. [\[10\]][ref-10]

### Architecture implications

- Use one provider-neutral policy/approval layer, one process-result contract, and platform-specific enforcement below them. Do not fork the agent loop, tool schema or ACP layer for each OS. Codex, Gemini and DeepSeek demonstrate the interface/dispatch separation. [\[1\]][ref-1] [\[13\]][ref-13] [\[18\]][ref-18]
- **Do not preselect AppContainer merely because the target is Windows.** The inspected reference paths primarily use restricted tokens, ACLs and native process ownership. Compare those against AppContainer in a separate Windows feasibility exercise; this research does not prove either design meets all KQode requirements. [\[3\]][ref-3] [\[15\]][ref-15] [\[20\]][ref-20]
- Treat filesystem isolation, network isolation and process ownership as distinct capabilities. A backend that lacks a required capability must reject that profile; approval must not turn partial enforcement into a full guarantee. Codex's unsupported-read rejection and DeepSeek's partial status provide concrete precedent. [\[4\]][ref-4] [\[18\]][ref-18]

### Evaluation ideas

- Exercise read-only/workspace-write against ordinary files, protected metadata, pre-existing ACLs, hard links and private-temp paths. Assert actual allowed/denied operations, not merely successful creation of a restricted token. DeepSeek documents why token creation alone is insufficient. [\[18\]][ref-18] [\[20\]][ref-20]
- Validate PowerShell and a spawned native executable separately, then descendants and cancellation. The token/default-DACL and Job ownership paths make those distinct compatibility concerns. [\[3\]][ref-3] [\[21\]][ref-21]
- Independently test denied TCP/UDP/loopback access and backend setup failure. A throttle or warning cannot satisfy KQode's network-denial requirement; compare Gemini's inspected helper path with Codex's dedicated firewall setup rather than treating both as equivalent. [\[5\]][ref-5] [\[15\]][ref-15]

### Risks and tradeoffs

- Native Windows safety may require host-visible ACL changes, separate identities or elevated provisioning. Do not add persistent grants, accounts or firewall rules to the user's machine merely to make a smoke test pass. Codex setup and DeepSeek's standing workspace grants illustrate the lifecycle cost. [\[5\]][ref-5] [\[18\]][ref-18]
- The Windows-first decision is justified; **U5 is still unimplemented** in this research turn. The existing U4 Job Object is process ownership, not sufficient file/network enforcement. Before marking U5 accepted, a native backend must demonstrate the required boundaries without silently relaxing the plan. The reference designs support this separation but do not replace local validation. [\[4\]][ref-4] [\[15\]][ref-15] [\[18\]][ref-18]

## Evidence Gaps

- OpenCode/Kimi/Pi: `not_found` for OS sandbox in the named local shell paths; no product-wide absence claim.
- Kimi: `partial_trace` across its multiple execution implementations; findings name the inspected KAOS path.
- No reference code was executed. Shell availability, helper compilation, ACL behavior and network confinement on this host remain unverified.
- Codex elevated provisioning, Gemini helper enforcement and DeepSeek partial boundaries were inspected only to answer architecture questions; this is not an exhaustive security audit.
- No evidence establishes Cygwin or WSL as a universal mandatory backend across these six repositories.

## References

Body citations link to these commit-pinned source entries.

- <a id="ref-1"></a>[1] Codex: shared sandbox contract and platform dispatch ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/sandboxing/src/manager.rs#L1-L145)).
- <a id="ref-2"></a>[2] Codex: native shell discovery and Windows default ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/shell-command/src/shell_detect.rs#L251-L369)).
- <a id="ref-3"></a>[3] Codex: restricted token creation and capability inputs ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/windows-sandbox-rs/src/token.rs#L352-L493)).
- <a id="ref-4"></a>[4] Codex: unsupported unelevated read restrictions fail closed ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/sandboxing/src/windows.rs#L71-L128)).
- <a id="ref-5"></a>[5] Codex: offline identity firewall provisioning ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/windows-sandbox-rs/src/bin/setup_main/win/firewall.rs#L32-L195)).
- <a id="ref-6"></a>[6] OpenCode: shell candidates, overrides, argv and tree cleanup ([code](https://github.com/anomalyco/opencode/blob/859106eb17d5b840475f5e4b78e64c9622f8750e/packages/core/src/shell.ts#L31-L213)).
- <a id="ref-7"></a>[7] OpenCode: permission requests and local process construction ([code](https://github.com/anomalyco/opencode/blob/859106eb17d5b840475f5e4b78e64c9622f8750e/packages/opencode/src/tool/shell.ts#L266-L311)).
- <a id="ref-8"></a>[8] Kimi: Windows Git Bash discovery and Unix fallback ([code](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/kaos/src/environment.ts#L62-L162)).
- <a id="ref-9"></a>[9] Kimi: local process execution ([code](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/kaos/src/local.ts#L727-L770)).
- <a id="ref-10"></a>[10] Pi: Bash compatibility discovery and native PowerShell discovery ([code](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/utils/shell.ts#L15-L135)).
- <a id="ref-11"></a>[11] Pi: shared local shell spawning and cancellation ([code](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/tools/bash.ts#L54-L155)).
- <a id="ref-12"></a>[12] Pi: separate PowerShell tool ([code](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/tools/powershell.ts#L1-L58)).
- <a id="ref-13"></a>[13] Gemini: OS-specific sandbox manager factory ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/services/sandboxManagerFactory.ts#L21-L42)).
- <a id="ref-14"></a>[14] Gemini: Windows PowerShell and Unix Bash selection ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/utils/shell-utils.ts#L658-L702)).
- <a id="ref-15"></a>[15] Gemini: native Windows token, integrity, Job and network-throttling implementation ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/sandbox/windows/GeminiSandbox.cs#L232-L308)).
- <a id="ref-16"></a>[16] Gemini: Linux Bubblewrap/seccomp launch construction ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/sandbox/linux/LinuxSandboxManager.ts#L303-L325)).
- <a id="ref-17"></a>[17] Gemini: macOS sandbox-exec launch ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/sandbox/macos/MacOsSandboxManager.ts#L160-L190)).
- <a id="ref-18"></a>[18] DeepSeek: platform backend chains, grant lifecycle and partial Windows enforcement ([code](https://github.com/deepseek-ai/deepseek-harness/blob/aa8262ec091698bae9a6b04773a6b5b06ad4aef2/packages/sandbox/sandbox-local/src/index.ts#L1-L200)).
- <a id="ref-19"></a>[19] DeepSeek: PowerShell executable discovery ([code](https://github.com/deepseek-ai/deepseek-harness/blob/aa8262ec091698bae9a6b04773a6b5b06ad4aef2/packages/shell/pwsh-local/src/resolve.ts#L14-L79)).
- <a id="ref-20"></a>[20] DeepSeek: Windows ACL/token runner contract and implementation ([code](https://github.com/deepseek-ai/deepseek-harness/blob/aa8262ec091698bae9a6b04773a6b5b06ad4aef2/packages/sandbox/sandbox-windows-acl/src/runner.ts#L1-L188)).
- <a id="ref-21"></a>[21] DeepSeek: restricted-token adapters over shared Win32 process ownership ([code](https://github.com/deepseek-ai/deepseek-harness/blob/aa8262ec091698bae9a6b04773a6b5b06ad4aef2/packages/sandbox/sandbox-windows-acl/src/spawn.ts#L1-L60)).

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
