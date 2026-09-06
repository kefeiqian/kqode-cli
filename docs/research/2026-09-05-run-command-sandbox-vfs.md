---
date: 2026-09-05
topic: run-command-sandbox-vfs
question: "六个 coding agent 如何实现命令执行、sandbox 与文件写入安全；KQode 第一版采用 run_command 时是否必须先有 VFS，特别应该如何参考 Codex？"
status: partial
---

# `run_command`、Sandbox 与 VFS 的边界

## Summary

六个实现都证明：**应用层 VFS 不是 `run_command` 的前置条件，OS/process sandbox 才是通用命令安全的核心边界。** 普通 VFS 只能控制主动调用它的 `read`、`write`、`edit` 或 `apply_patch` handler，无法透明拦截 native child process 的 `open`、`write`、shell redirection、Git、compiler、formatter 或孙进程写入。 [\[12\]][ref-12] [\[24\]][ref-24] [\[28\]][ref-28] [\[33\]][ref-33] [\[35\]][ref-35] [\[38\]][ref-38]

Codex 能采用 `exec_command` 为中心的小工具面，不是因为命令本身安全，而是因为它在下面建立了完整链路：shell-aware command policy、allow/prompt/forbid、approval cache key、read-only/workspace-write/full-access profiles、独立 network policy、macOS Seatbelt、Linux bubblewrap/seccomp、Windows restricted token/Job Object、显式 environment construction、双层输出上限、process-tree cleanup，以及独立 `apply_patch`。 [\[1\]][ref-1] [\[7\]][ref-7] [\[10\]][ref-10] [\[13\]][ref-13] [\[15\]][ref-15] [\[16\]][ref-16] [\[17\]][ref-17] [\[19\]][ref-19]

KQode 第一版可以先实现：

```text
run_command
fetch_web_url
ask_user
```

但 `run_command` 上线前至少需要 workspace/cwd policy、allow/ask/deny、可执行的 OS sandbox backend、network mode、timeout/cancellation、process-tree cleanup、environment filtering 和 bounded output。VFS 与 `apply_patch` 可以作为下一阶段加入；在此之前，shell 对 workspace 的写入必须被明确标记为直接 mutation，不能宣称经过 staged VFS。

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `ddf04ad26789d040f9ef6a96736f76602e35a6cc` | complete | fetched 2026-09-05T06:16:06Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `e2894562f8ba943d72172d10b727c24d5f650c16` | partial | no platform sandbox found in inspected command path |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | partial | runtime backend details partially traced |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | partial | platform SandboxManager backends partially traced |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `9841914c71a74d81abe07f751aefd271fd924e63` | complete | no built-in action sandbox |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | partial | high-level policy and local FS traced |

---

## Method

- Question: `run_command` 是否依赖 VFS，以及六个实现如何处理 shell、sandbox、policy、network 和文件写入。
- Repo scope: default first-scope.
- Search themes: command schema、approval、sandbox profiles、OS enforcement、environment、timeout/output、process cleanup、edit tools、stale checks、atomic writes、shell mutation tracking。
- Safety posture: 仅搜索和读取源码；未运行、构建、安装或测试参考仓库；未读取参考仓库指令文件。
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries use commit-pinned source URLs.

---

## Codex Detailed Trace

### Model-facing command contract

Codex 的主要命令工具是 `exec_command`，输入包含 command string、workdir、可选 shell、login shell、PTY、yield interval 和 model-facing output token budget。长时间命令可以返回 session ID，由独立 `write_stdin` tool 继续输入或轮询。 [\[1\]][ref-1]

内部 request 还包含 one-shot timeout、sandbox mode、additional permissions、justification 和 reusable prefix rule。workdir 相对选定 environment cwd 解析；本地 sandbox 要求最终 cwd 是 host-native absolute path。 [\[2\]][ref-2] [\[3\]][ref-3]

Codex 对输出做两层限制：

- process collector 最多保留约 1 MiB，采用 head/tail retention；
- model-facing response 默认最多 10,000 tokens。

Unified exec process store 同时最多保留 64 个 live processes。 [\[5\]][ref-5] [\[6\]][ref-6]

### Approval 与 sandbox 是两个决定

Codex 先将常见 shell command form 拆成可分析的 command segments，在 Windows 还使用 PowerShell parser。Policy 结果是：

```text
Allow
Prompt
Forbidden
```

只有 explicit allow rule 覆盖所有 parsed segments 时，才可能请求 first-attempt sandbox bypass；parse failure 不会自动变成 allow。 [\[7\]][ref-7]

Approval cache key 不只包含 command text，还包含 environment、argv、cwd、TTY、sandbox override 和 additional permissions。用户批准的是特定执行上下文，而不是模糊的“允许 shell”。 [\[8\]][ref-8]

Central orchestrator 顺序是：

```text
resolve effective filesystem/network profile
  -> evaluate approval
  -> choose first-attempt sandbox
  -> execute
  -> classify sandbox denial
  -> optionally request escalation
  -> retry once
```

Approval 不等于自动 unsandboxed。普通允许命令仍可在 sandbox 中运行；只有明确 policy 或 denial escalation 才可能扩大 authority。Network owner policy 和 denied-read restrictions 不能被普通 filesystem escalation 顺带绕过。 [\[9\]][ref-9] [\[10\]][ref-10]

### Filesystem 与 network profiles

Codex 的主要 profiles 是：

```text
read-only
workspace-write
danger-full-access
external-sandbox
```

Network permission 与 filesystem permission 分开表示。`workspace-write` 添加 cwd、configured roots 和通常的 temp roots，同时可保留 `.git`、`.codex`、hooks 等 protected read-only subpaths。 [\[11\]][ref-11]

这不是 VFS。它是 platform sandbox 或 remote executor 使用的 capability policy，用来限制 shell 与所有 descendants 的真实 filesystem syscalls。

### OS enforcement

Codex 根据平台选择：

| Platform | Enforcement |
|---|---|
| macOS | Seatbelt profile |
| Linux | bubblewrap filesystem namespace + `no_new_privs` + seccomp；Landlock fallback |
| Windows | restricted token/capability、ACL、private desktop、Job Object |

如果平台 backend 不可用，manager 可以返回 `SandboxType::None`；调用方不能把 `None` 当作限制已经生效。 [\[12\]][ref-12]

macOS profile 根据 effective roots 生成 filesystem allow rules。Network 默认不出现，除非明确开启或通过 approved local proxy；managed proxy endpoint 缺失时网络 allowance 为空，属于 fail closed。 [\[13\]][ref-13]

Linux bubblewrap 默认把 filesystem 设为 read-only，再叠加 writable roots 与 protected carveouts；创建 user/PID/IPC namespaces，drop capabilities，使用 `--die-with-parent`，并在 isolated/proxy-only 模式 unshare network namespace。 [\[14\]][ref-14] [\[15\]][ref-15]

Windows backend 使用 restricted process token，支持 ConPTY 或 pipes，并将 process 放入 Job Object。终止时优先杀 Job Object，从而覆盖 descendants。 [\[16\]][ref-16]

### Environment 与 process lifecycle

Codex 通过显式 policy 构建 environment，并在启动前 `env_clear()`。它支持 inherit all、core-only、none、exclude、include-only 和 override。受限启动变量会在 user override 后再次移除。 [\[17\]][ref-17]

需要注意：当前默认 policy 仍可继承所有变量，secret-name filter 也不是天然强制开启。KQode 不应只复制 capability，而应选择更安全的默认值。

Timeout、cancel 和 interrupt 最终委托 process group、PTY session、remote executor 或 Windows Job Object 做清理；timeout 使用结构化状态而不是只返回一段文本。 [\[18\]][ref-18]

### `apply_patch` 与 shell writes

Codex 提供独立 `apply_patch`。如果模型把一个可识别的 `apply_patch` command 包在 `exec_command` 里，Codex 会在 shell 启动前截获，并路由到同一 patch runtime。 [\[19\]][ref-19]

Patch approval 根据 exact affected paths 推导；已在 active policy 可写的路径不会扩大 permission，其他路径只请求 bounded parent-directory writes。 [\[20\]][ref-20]

Patch engine 会：

- 读取当前文件；
- 验证 expected context/old lines；
- context 不匹配则拒绝；
- 生成 before/after delta；
- 通过 executor filesystem 写入和删除。

但已检查路径不构成通用 multi-file transaction，也没有证明所有本地写入都采用 temp-file atomic rename。 [\[21\]][ref-21]

最重要的边界是：Codex turn diff tracker 只追踪 committed `apply_patch` deltas，并不会透明捕获任意 shell writes。Shell redirection、formatter、compiler、Git 和 script 直接修改 sandbox-visible filesystem。 [\[22\]][ref-22]

### 为什么 Codex 的小工具面可行

Codex 的 `exec_command` 不是一个简单 `Command::spawn` wrapper。它依赖：

- parsed command policy；
- approval 与 sandbox 分离；
- per-command additional permissions；
- platform sandbox；
- independent network policy；
- environment construction；
- PTY/session lifecycle；
- output/process limits；
- process-tree cleanup；
- dedicated patch path；
- patch-originated diff tracking；
- headless fail closed。

Headless exec 默认 approval policy 为 `never`，因此无人值守执行不会停在等待审批，也不会自动放行。 [\[23\]][ref-23]

---

## Other Repositories

### OpenCode

**Status:** partial

- `bash` 接收 command、workdir、timeout，使用 pipes，无 PTY/background，默认 120 秒、最大 600 秒，并限制 combined stdout/stderr 约 1 MiB。已检查实现明确拥有 host-user filesystem、process 和 network authority。 [\[24\]][ref-24]
- Permission 使用 wildcard allow/ask/deny，未匹配默认 ask；bash approval 绑定完整 command string，外部 workdir 需要额外 `external_directory` approval。 [\[25\]][ref-25]
- File tools canonicalize paths、阻止 symlink escape、执行 stale byte comparison，并用 per-target mutex 串行化写入；shell writes 绕过这些 guard。 [\[26\]][ref-26]

### Kimi Code CLI

**Status:** partial

- Bash 支持 command、cwd、timeout、description 和 background。Foreground 默认 60 秒、最大 300 秒；background 默认 600 秒并可扩大到 24 小时。无 PTY 或持续 stdin。 [\[27\]][ref-27]
- 命令通过 runtime process capability 执行，environment 很小，stdin 立即关闭；abort/force stop 使用 signals，但已检查 wrapper 未证明完整 descendant-tree cleanup。 [\[28\]][ref-28]
- Permission 是 ordered first-result-wins chain，包含 explicit deny、dangerous-command analysis、auto/yolo、sensitive-file、ask/allow 和 fallback ask。Parser 对时间、AST size 和 nested-shell depth 有上限，parse failure 选择 ask。 [\[29\]][ref-29]
- Edit/Write 使用 runtime filesystem 和 path-access metadata；shell writes 不经过这些 metadata、diff 或 runtime-generation stale validation。 [\[30\]][ref-30]

### Gemini CLI

**Status:** partial

- Shell 支持 command、description、workspace-relative directory、background 和 additional sandbox permissions，并在执行前阻止部分 command-substitution forms。可使用 node-pty，失败后退到 pipes；timeout 基于 output inactivity。 [\[31\]][ref-31]
- Interactive 默认 `ASK_USER`，noninteractive 默认 `DENY`。Policy 支持 priority、prefix/regex、arguments、approval mode、interactivity、redirection 和 deny message；redirection 通常把 allow 降级为 ask。 [\[32\]][ref-32]
- Shell service 构建 sanitized environment，关闭 global/system Git config 和 interactive Git prompts，并把 cwd、network 和 additional permissions 交给 platform SandboxManager。Cancellation 杀 process group 并销毁 PTY。 [\[33\]][ref-33]
- File tools 使用 direct local `FileSystemService`，edit 会 reread + hash-check 并生成 diff；shell writes 绕过 FileSystemService 与 tool diff。 [\[34\]][ref-34]

### Pi Coding Agent

**Status:** complete

- Bash 只有 command 与 optional timeout，使用 configured shell、普通 pipes 和较广泛的 inherited environment；没有 PTY、background、approval parser、filesystem sandbox 或 network gate。 [\[35\]][ref-35]
- Output 支持 streaming、line/byte truncation 和 spill file；timeout/cancel 会杀 process tree，Unix 使用 process group，Windows 使用 trusted System32 `taskkill.exe /F /T`。 [\[35\]][ref-35]
- Pi 明确说明 commands/extensions 以启动用户权限运行；project trust 只控制是否加载 project config，不是 action sandbox。 [\[36\]][ref-36]
- File operations 可替换，edit/write 还有 per-file queue，但 Bash 仍看到真实 filesystem，shell writes 绕过 queues 和替代 file operations。 [\[37\]][ref-37]

### DeepSeek Harness

**Status:** partial

- Bash 支持 command、description、timeout、workdir、background 和 explicit sandbox escalation。Foreground result 结构化包含 stdout/stderr、exit、signal、timeout、abort、truncation/spill 与 sandbox facts；background 返回 job ID。 [\[38\]][ref-38]
- Sandbox modes 为 `read-only`、`workspace-write`、`danger-full-access`，默认 read-only。Escalation 只能请求严格更宽的 mode，并要求 justification；approval 不可用或 `never` 时 fail closed。 [\[39\]][ref-39]
- Model 不能传任意 environment；ambient managed variables 被 scrubbed，受控变量优先。Process group termination 和 composition teardown 会清理 outstanding jobs。 [\[40\]][ref-40]
- Write/Edit 使用 filesystem capability、observation/version guard、per-target lock，并通过 private sibling staging 后 atomic publish；Windows 使用 `ReplaceFileW` 保留 ACL metadata。Shell redirection仍然绕过这些 guard。 [\[41\]][ref-41]

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi | Gemini CLI | Pi | DeepSeek Harness |
|---|---|---|---|---|---|---|
| Command input | command + cwd + shell/PTY [\[1\]][ref-1] | command + workdir [\[24\]][ref-24] | command + cwd/background [\[27\]][ref-27] | command + directory/background [\[31\]][ref-31] | command + timeout [\[35\]][ref-35] | command + workdir/background [\[38\]][ref-38] |
| Approval | parsed allow/prompt/forbid [\[7\]][ref-7] | wildcard allow/ask/deny [\[25\]][ref-25] | ordered policies + parser [\[29\]][ref-29] | TOML policy + parser [\[32\]][ref-32] | none [\[36\]][ref-36] | escalation approval [\[39\]][ref-39] |
| FS sandbox | Seatbelt/bwrap/Windows sandbox [\[12\]][ref-12] | not found [\[24\]][ref-24] | runtime-dependent | SandboxManager [\[33\]][ref-33] | none [\[36\]][ref-36] | read-only/workspace-write/full [\[39\]][ref-39] |
| Network gate | independent sandbox policy [\[10\]][ref-10] | none observed [\[24\]][ref-24] | runtime-dependent | passed to SandboxManager [\[33\]][ref-33] | none [\[36\]][ref-36] | sandbox policy, backend partial [\[39\]][ref-39] |
| Environment | explicit clear/filter policy [\[17\]][ref-17] | no explicit overlay observed | deliberately small [\[28\]][ref-28] | sanitized [\[33\]][ref-33] | broad inheritance [\[35\]][ref-35] | managed variables [\[40\]][ref-40] |
| Process-tree cleanup | process group / Job Object [\[18\]][ref-18] | partial evidence | signals, descendants uncertain | process groups/PTY [\[33\]][ref-33] | process group/taskkill [\[35\]][ref-35] | process group/composition teardown [\[40\]][ref-40] |
| Dedicated mutation path | `apply_patch` [\[19\]][ref-19] | edit/write [\[26\]][ref-26] | Edit/Write [\[30\]][ref-30] | edit/write [\[34\]][ref-34] | edit/write [\[37\]][ref-37] | edit/write + atomic publish [\[41\]][ref-41] |
| Shell writes pass file tools | no [\[22\]][ref-22] | no [\[26\]][ref-26] | no [\[30\]][ref-30] | no [\[34\]][ref-34] | no [\[37\]][ref-37] | no [\[41\]][ref-41] |
| Headless approval | default never [\[23\]][ref-23] | incomplete | mode-dependent | default deny [\[32\]][ref-32] | no approval | unavailable approval rejects [\[39\]][ref-39] |

---

## Direct Answers

### `run_command` 之前必须先实现 VFS 吗？

**不必须。**

六个实现中，没有一个依赖“应用层 VFS 拦截所有 shell filesystem calls”才能启动命令。Codex、Gemini 和 DeepSeek 使用真实 OS process + sandbox policy；OpenCode 与 Pi 更直接地使用 host filesystem；Kimi 通过 runtime capability 抽象执行，但 shell writes 也不经过 dedicated file tools。 [\[12\]][ref-12] [\[24\]][ref-24] [\[28\]][ref-28] [\[33\]][ref-33] [\[35\]][ref-35] [\[38\]][ref-38]

`run_command` 真正的前置能力是：

1. canonical workspace root 与 cwd validation；
2. allow/ask/deny policy；
3. 至少一个实际可执行的 OS sandbox backend；
4. filesystem mode；
5. 与 filesystem 分离的 network mode；
6. timeout、cancel 和 descendant cleanup；
7. explicit environment construction；
8. bounded stdout/stderr；
9. headless fail closed；
10. trace 与 mutation accounting。

### 普通 VFS 为什么管不了 shell？

普通 VFS 只影响调用它的 KQode code：

```text
apply_patch -> KQode VFS -> filesystem
```

但 child process 调用的是 OS：

```text
run_command -> PowerShell/Bash -> Win32/POSIX filesystem API
```

因此它可以直接执行：

```text
redirection: >
rename/unlink
memory-mapped writes
absolute paths
symlink/junction traversal
Git/formatter/compiler writes
child and grandchild writes
```

除非使用 kernel sandbox、container/VM、syscall interception，或完全禁止 native processes，否则应用层 VFS 无法透明控制这些行为。

### Sandbox 与 VFS 的正确关系

```text
run_command
  -> command policy
  -> approval
  -> OS sandbox
  -> process supervisor
  -> real filesystem

apply_patch
  -> file policy
  -> VFS/file service
  -> stale/version check
  -> diff
  -> approved publish
  -> real filesystem
```

Sandbox 管的是进程的 capability；VFS 管的是 KQode 自己的精确文件操作。

---

## KQode Lessons

### Product behavior

第一版建议保留：

```text
run_command
fetch_web_url
ask_user
```

`run_command` 第一版只做 foreground、one-shot、noninteractive execution，不做 PTY、background、persistent stdin 或 `write_stdin`。Codex 的 interactive process model 很成熟，但不是验证第一条 agent-tool loop 所必需。 [\[1\]][ref-1] [\[6\]][ref-6]

建议公开三种 filesystem modes：

```text
read-only
workspace-write
danger-full-access
```

并让 network mode 独立：

```text
network-deny
network-proxy/allowlist
network-full
```

不要让 filesystem escalation 自动得到网络。Codex 的 network owner policy 与 DeepSeek 的 strictly-wider escalation 都支持这一分离。 [\[10\]][ref-10] [\[39\]][ref-39]

### Architecture implications

#### Milestone 1：安全 foreground `run_command`

最小 schema：

```text
input:
  command
  cwd?
  timeout_ms?

result:
  exit_code?
  signal?
  timed_out
  cancelled
  stdout
  stderr
  truncated
  omitted_bytes
  duration_ms
  sandbox_mode
  network_mode
```

必须满足：

- cwd canonicalization；
- fixed total timeout；
- process-group/Job Object termination；
- explicit env allowlist/denylist；
- output byte cap + model token cap；
- noninteractive approval denial；
- sandbox unavailable 时显式 `unsandboxed`，不得 silent fallback。

#### Milestone 2：Command policy

增加：

```text
allow
ask
deny
```

Approval identity 至少绑定：

```text
command
cwd
filesystem_mode
network_mode
requested_extra_roots
environment profile
```

Parser 第一版只需处理常见 `&&`、`||`、`;`、pipeline 和 redirection。Parse failure、outside-workspace path、redirection 至少 ask，不能默认 allow。Codex 的 every-segment allow、Gemini 的 redirection downgrade 和 Kimi 的 bounded parser 是合适组合。 [\[7\]][ref-7] [\[29\]][ref-29] [\[32\]][ref-32]

#### Milestone 3：加入 `apply_patch`

第一种 mutation tool 建议只做 `apply_patch`：

- affected paths 预计算；
- workspace enforcement；
- expected old-context；
- read version/hash；
- per-file lock；
- structured diff；
- atomic single-file publish where possible；
- multi-file partial-effect status；
- approval。

如果 `run_command` 中出现可精确识别的 KQode `apply_patch` invocation，可以像 Codex 一样 intercept 到 dedicated path；不要尝试拦截任意 shell write。 [\[19\]][ref-19] [\[20\]][ref-20] [\[21\]][ref-21]

写入 mechanics 可以比 Codex 更严格，参考 DeepSeek 的 observed version、private sibling staging 和 atomic publish。 [\[41\]][ref-41]

#### Milestone 4：观察 shell mutations

每个可能写入的 command 完成后：

- Git repo 使用 bounded `git status` / `git diff --no-ext-diff`；
- 非 Git workspace 使用受限 metadata/content snapshot；
- 标记为 `observed_after_command`，不要表示为 VFS-intercepted；
- 记录 untracked、deleted 和 binary metadata；
- 观察失败时返回 `mutation_state_unknown`。

所有六个实现都表明 arbitrary shell writes 不会经过 file tool path。 [\[22\]][ref-22] [\[26\]][ref-26] [\[30\]][ref-30] [\[34\]][ref-34] [\[37\]][ref-37] [\[41\]][ref-41]

#### Milestone 5：Managed shell network

- 首选 `fetch_web_url` 作为 audited HTTP read path；
- sandboxed shell 默认 network deny；
- 按 host/port 请求权限；
- 不让 `fetch_web_url` approval 隐含 arbitrary shell network；
- filesystem escalation 不能绕过 network owner policy。

### Evaluation ideas

- read-only mode：`rg` 成功，source redirection/write/delete 失败。
- workspace-write mode：workspace output 成功，outside path 失败。
- protected metadata：`.git/hooks`、`.kqode` 等保持只读。
- network deny：DNS、TCP 和 metadata-service address 被阻止。
- approval unavailable：headless 返回 typed denial，不挂起。
- command parser：pipeline 中一个 denied segment 导致整体 deny。
- redirection：从 allow 降为 ask 或 deny。
- timeout：同时终止 shell、child 和 grandchild。
- output cap：模型结果截断，但 spill artifact 有界且受控。
- environment：secret-like variables 不进入 child。
- sandbox unavailable：不能伪装为 sandboxed success。
- patch stale check：外部修改后拒绝旧 patch。
- shell mutation observation：formatter 修改文件后 diff 被标记为 observed，而非 VFS staged。

### Risks and tradeoffs

- 只有 approval 没有 sandbox：用户批准一个看似安全 command 后，脚本和 descendants 仍拥有完整用户权限。
- 只有 sandbox 没有 command policy：每个允许范围内的危险操作都无需解释，用户无法建立可复用规则。
- 只有 VFS 没有 process sandbox：shell 可以完全绕过 VFS。
- 只有 system prompt 禁止写入：属于行为建议，不是 enforcement。
- 允许 silent unsandboxed fallback：UI 会错误表示安全边界，是最危险的失败模式之一。
- 一开始支持 PTY/background 会大幅增加 process ownership、recovery、cleanup 和 UI 复杂度。

---

## Evidence Gaps

- Codex: 未枚举全部 permission-profile v2 配置；legacy profiles 与 runtime path 已足以回答本问题。
- Codex: local patch filesystem 未证明统一 atomic write；本报告不声称 Codex patch 全部原子。
- OpenCode: 未在已检查 command path 找到 platform sandbox；descendant cleanup 细节不完整。
- Kimi Code: runtime filesystem backend、atomicity 与完整 descendant cleanup 是 partial trace。
- Gemini CLI: 已追踪 SandboxManager integration，但未逐个完成当前所有 platform backend。
- DeepSeek Harness: policy、local filesystem 与部分 native enforcement 已追踪，所有 platform backend 仍为 partial。
- All repos: 未发现能够透明拦截所有 arbitrary native child-process writes 的 application-level VFS。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex: `exec_command` and `write_stdin` schemas ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/shell_spec.rs#L15-L157)).
- <a id="ref-2"></a>[2] Codex: internal execution arguments and permission fields ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/unified_exec.rs#L28-L70)).
- <a id="ref-3"></a>[3] Codex: environment selection and workdir validation ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs#L175-L245)).
- <a id="ref-4"></a>[4] Codex: execution lifetime, permission merging and request construction ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs#L280-L447)).
- <a id="ref-5"></a>[5] Codex: structured command output ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/context.rs#L346-L405)).
- <a id="ref-6"></a>[6] Codex: yield/output/process-store limits ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/unified_exec/mod.rs#L77-L220)).
- <a id="ref-7"></a>[7] Codex: parsed shell allow/prompt/forbid policy ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/exec_policy.rs#L280-L460)).
- <a id="ref-8"></a>[8] Codex: approval key includes command execution context ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/runtimes/unified_exec.rs#L65-L194)).
- <a id="ref-9"></a>[9] Codex: approval states and policy mapping ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/sandboxing.rs#L152-L225)).
- <a id="ref-10"></a>[10] Codex: approval, sandbox selection, denial and bounded retry orchestration ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/orchestrator.rs#L145-L525)).
- <a id="ref-11"></a>[11] Codex: sandbox modes, network flags, writable roots and protected paths ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/protocol/src/protocol.rs#L1054-L1275)).
- <a id="ref-12"></a>[12] Codex: platform sandbox selection ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/sandboxing/src/manager.rs#L42-L82)).
- <a id="ref-13"></a>[13] Codex: Seatbelt filesystem and managed-network fail-closed policy ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/sandboxing/src/seatbelt.rs#L250-L370)).
- <a id="ref-14"></a>[14] Codex: Linux bubblewrap and Landlock architecture ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/linux-sandbox/src/bwrap.rs#L1-L112)).
- <a id="ref-15"></a>[15] Codex: bubblewrap mounts, namespaces, network isolation and parent-death behavior ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/linux-sandbox/src/bwrap.rs#L228-L380)).
- <a id="ref-16"></a>[16] Codex: Windows restricted launch and Job Object termination ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/windows-sandbox-rs/src/bin/command_runner/win.rs#L280-L455)).
- <a id="ref-17"></a>[17] Codex: environment construction and filtering ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/protocol/src/shell_environment.rs#L92-L170)).
- <a id="ref-18"></a>[18] Codex: process interruption and termination ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/unified_exec/process.rs#L215-L270)).
- <a id="ref-19"></a>[19] Codex: interception of `apply_patch` embedded in shell execution ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/apply_patch.rs#L500-L588)).
- <a id="ref-20"></a>[20] Codex: exact affected-path patch permissions ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/tools/handlers/apply_patch.rs#L220-L340)).
- <a id="ref-21"></a>[21] Codex: patch context verification and filesystem mutation ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/apply-patch/src/file_update.rs#L20-L190)).
- <a id="ref-22"></a>[22] Codex: turn diff tracker records committed patch deltas ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/turn_diff_tracker.rs#L39-L111)).
- <a id="ref-23"></a>[23] Codex: headless mode defaults approval to `never` ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/exec/src/lib.rs#L500-L525)).
- <a id="ref-24"></a>[24] OpenCode: Bash schema, timeout, execution authority and output bounds ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/core/src/tool/bash.ts#L23-L190)).
- <a id="ref-25"></a>[25] OpenCode: permission matching and approval lifecycle ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/core/src/permission.ts#L144-L273)).
- <a id="ref-26"></a>[26] OpenCode: path boundary, stale edit detection and mutation locking ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/core/src/location-mutation.ts#L15-L139)).
- <a id="ref-27"></a>[27] Kimi Code: Bash schema, foreground/background timeout and execution ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/os/bash/bashTool.ts#L110-L260)).
- <a id="ref-28"></a>[28] Kimi Code: restricted shell environment and process termination ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/os/bash/bashTool.ts#L157-L210)).
- <a id="ref-29"></a>[29] Kimi Code: ordered permission policies and bounded dangerous-command analysis ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/permissionPolicy/policies/dangerous-command-ask.ts#L13-L164)).
- <a id="ref-30"></a>[30] Kimi Code: edit/write filesystem access and generation validation ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/edit/editTool.ts#L48-L111)).
- <a id="ref-31"></a>[31] Gemini CLI: shell schema, validation, PTY, background and timeout ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/shell.ts#L84-L653)).
- <a id="ref-32"></a>[32] Gemini CLI: interactive/headless defaults and parsed policy rules ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/policy/policy-engine.ts#L286-L511)).
- <a id="ref-33"></a>[33] Gemini CLI: environment sanitization, sandbox request and process cleanup ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/services/shellExecutionService.ts#L427-L569)).
- <a id="ref-34"></a>[34] Gemini CLI: direct filesystem service, stale hash check and writes ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/edit.ts#L546-L576)).
- <a id="ref-35"></a>[35] Pi: Bash execution, output bounds and process-tree cleanup ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/bash.ts#L23-L346)).
- <a id="ref-36"></a>[36] Pi: local-user privilege security model ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/docs/security.md#L1-L50)).
- <a id="ref-37"></a>[37] Pi: direct write/edit and per-file mutation queue ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L22-L62)).
- <a id="ref-38"></a>[38] DeepSeek Harness: Bash schema, output, timeout and jobs ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/shell/tool-bash/src/index.ts#L42-L353)).
- <a id="ref-39"></a>[39] DeepSeek Harness: sandbox modes, escalation and approval outcomes ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/sandbox/sandbox/src/escalation.ts#L20-L150)).
- <a id="ref-40"></a>[40] DeepSeek Harness: environment precedence and process cleanup ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/shell/bash-local/src/index.ts#L111-L287)).
- <a id="ref-41"></a>[41] DeepSeek Harness: versioned writes, locking and atomic publication ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/fs/fs-local/src/index.ts#L175-L290)).

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
[ref-32]: #ref-32
[ref-33]: #ref-33
[ref-34]: #ref-34
[ref-35]: #ref-35
[ref-36]: #ref-36
[ref-37]: #ref-37
[ref-38]: #ref-38
[ref-39]: #ref-39
[ref-40]: #ref-40
[ref-41]: #ref-41
