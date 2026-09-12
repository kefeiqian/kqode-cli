---
date: 2026-09-12
topic: windows-agent-sandbox-strategies
question: "其他 coding agents 在 Windows 上采用什么沙箱方案，与 KQode U5 的严格隔离要求有什么区别？"
status: partial
---

# Windows agent 沙箱方案：原生隔离、部分约束与直接执行

## Summary

不能把 Windows Sandbox 虚拟机当作其他 agent 的统一做法。Codex 有原生受限令牌路径，以及管理员配置专用普通账户、ACL 和网络规则的 elevated 路径；Gemini CLI 也有 C# 实现的 `windows-native` 后端。二者的这些实现不是 Windows Sandbox 可选功能。[\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3] [\[5\]][ref-5]

另一些实现并不承诺同样的隔离边界：OpenCode 明确区分审批提示与安全隔离；Pi 的默认本地 shell 和容器/扩展建议也是另一种产品选择。DeepSeek Harness 的 Windows 写限制实现明确记录 Everyone、硬链接和网络边界。不能据此认定 KQode 已经找到满足 U5 全部验收要求的替代品。[\[7\]][ref-7] [\[8\]][ref-8] [\[11\]][ref-11] [\[12\]][ref-12]

本报告比较同步到的源码，不是各产品发行版的实机安全认证。OpenCode 的 fetch 成功，但缓存 checkout 被已有文件变化阻止；没有覆盖这些变化，仅从固定提交读取 blob。因此总体状态为 partial。Kimi 的结论仅限本次追踪的本地执行路径。

## Run Metadata

所有时间均为 2026-09-12 UTC。五个缓存已 detached checkout；OpenCode 的引用固定为本次 fetch 的提交，而非缓存工作树。

| Repo | Requested URL | Resolved URL | Branch | SHA | Fetch time UTC | Status | Notes |
|---|---|---|---|---|---|---|---|
| codex | `https://github.com/openai/codex` | 同 requested | main | `c4017a87aacc7558002b7cb510025e967c1d765e` | 09:11:43 | complete | 机制级源码证据 |
| opencode | `https://github.com/anomalyco/opencode` | 同 requested | dev | `95daf90670b7c039c436c85537da5fbfe2205b41` | 09:13:52 | partial | checkout blocked；读取固定提交的普通文件 blob |
| kimi-code | `https://github.com/moonshotai/kimi-code` | 同 requested | main | `ee2cac102b835fcd7adb3d4b9bc3d62b0b71cdfd` | 09:11:48 | partial | partial_trace：未穷尽注入的 host process service/扩展后端 |
| gemini-cli | `https://github.com/google-gemini/gemini-cli` | 同 requested | main | `9c1b0a610534d6f8120964cf2672c07807d8fc90` | 09:12:06 | complete | 机制与配置选择源码证据 |
| pi-agent | `https://github.com/earendil-works/pi` | 同 requested | main | `71dca871bc80b6bc97be37f0ca3189399d651fff` | 09:12:11 | complete | 默认本地执行与文档边界 |
| deepseek-harness | `https://github.com/deepseek-ai/deepseek-harness` | 同 requested | master | `c291e7961a515f6d7af9304e7fd1d257929aef26` | 09:12:20 | complete | 原生写限制实现及其已知边界 |

## Method

- Question：核对 Windows 执行机制、权限准备、网络语义与明确的边界，不做一般性的 agent loop 综述。
- Repo scope：catalog 默认六个仓库；没有自动扩展到 Claude Code 或 Copilot。
- Safety posture：匿名 HTTPS fetch；禁用凭据 helper、Git hooks 和 LFS smudge；仅搜索与读取源码，未运行、构建、安装或测试任何参考仓库代码。
- 搜索主题：Windows 原生启动、受限令牌/ACL/完整性级别、网络约束、shell 调度、审批与容器边界。
- 引用固定提交与源码行号；读取提交对象时检查普通文件类型，不跟随源码中的 symlink。没有加载参考仓库指令作为本项目指令。

## Per-Repo Findings

### Codex CLI

**Status:** complete，限机制比较。

**Observed behavior**

- 配置区分 `Elevated`、`RestrictedToken` 和 `Disabled`；`unelevated` 映射受限令牌路径。elevated setup 是单独的准备步骤。[\[1\]][ref-1]
- elevated 路径配置 offline/online 专用账户及 sandbox 用户组；新账户使用 `USER_PRIV_USER`。因此管理员配置不等于让模型以管理员账户运行。runner 从 sandbox 用户派生受限令牌再启动子进程。[\[2\]][ref-2] [\[3\]][ref-3]
- setup 有 read ACL 配置以及面向 offline 用户的网络规则。它不只是调用一次 `CreateRestrictedToken`，也不是不改变主机配置的轻量方案。[\[4\]][ref-4]
- 令牌构造仍包含 logon SID、Everyone、能力 SID，并使用 `WRITE_RESTRICTED` 等标志。必须结合完整账户、ACL、网络与生命周期逻辑理解，不能直接把其中一个函数移植为“严格隔离”。[\[13\]][ref-13]

**Evidence gaps**

- 未执行其 setup、命令或 smoke tests；没有证明它通过 KQode 的 Everyone/ARAP、别名与全协议拒绝矩阵。

### OpenCode

**Status:** partial。

**Observed behavior**

- 安全说明明确表示不对 agent 提供沙箱，权限系统用于确认和用户知情；真正隔离应由外部容器或 VM 提供。[\[8\]][ref-8]
- Bash 实现请求权限，但代码同样明确说明路径扫描只是提示，命令拥有宿主用户的文件系统、进程与网络权限。[\[9\]][ref-9]

**Evidence gaps**

- fetch 成功但未能安全切换已有缓存工作树。以上为固定提交 blob 的证据，没有读取那些本地变化，也没有将其当成最新工作树。

### Kimi Code CLI

**Status:** partial。

**Observed behavior**

- 本次版本的 Bash tool 生成命令审批规则，再通过注入的 host process service 执行 shell。[\[10\]][ref-10]
- `LocalKaos.exec` 和 `execWithEnv` 使用 Node `spawn` 启动普通子进程。这个具体实现不能单独证明存在 Windows OS 沙箱。[\[14\]][ref-14]

**Evidence gaps**

- 本次未穷尽 host process service 的所有实现及部署配置；不能把本地路径的观察扩大成“任何 Kimi 后端都没有隔离”。

### Gemini CLI

**Status:** complete，限机制比较。

**Observed behavior**

- 源码存在 `windows-native` 选项，也提供 Docker、Podman 等选项；不能因 native manager 存在，就断言所有 Windows 调用默认启用它。[\[6\]][ref-6]
- Windows manager 使用 C# helper。helper 创建 restricted token、降低完整性级别、配置 Job Object，并对允许写入的目标配置 ACL/低完整性标签。这是原生进程隔离实现，不是 Windows Sandbox VM。[\[5\]][ref-5] [\[15\]][ref-15]
- `networkAccess == false` 分支设置 Job 带宽上限；设置失败输出 warning。这不是与 KQode “拒绝网络且配置失败必须阻止执行”相同的实现语义。[\[5\]][ref-5]

**Evidence gaps**

- 没有实测其低完整性目录、已有 ACL、硬链接或网络行为；仅描述机制与代码中的失败处理。

### Pi Coding Agent

**Status:** complete，限默认本地路径。

**Observed behavior**

- 默认 shell operations 直接调用 Node `spawn`。[\[11\]][ref-11]
- 文档明确不内置权限弹窗，建议使用容器或自行通过扩展添加确认流程；根 README 也将更强边界放在外部容器/沙箱方案中。[\[12\]][ref-12]

**Evidence gaps**

- 没有审核第三方扩展或外部容器配置；这些不是默认 local shell 的安全保证。

### DeepSeek Harness

**Status:** complete，限 Windows ACL 后端。

**Observed behavior**

- 使用 `WRITE_RESTRICTED` 令牌、workspace/temp SID 和真实目录上的 ACL grant；workspace ACE 为跨会话复用而保留，临时目录授权有独立生命周期。[\[7\]][ref-7]
- README 明确记录 Everyone 的环境写权限和硬链接对象别名边界；也明确说明该层不限制读取、网络和进程可见性。减少某些兼容 SID 会导致 DLL/CNG 初始化失败，不能把“能启动”与“完全隔离”混为一谈。[\[7\]][ref-7]

**Evidence gaps**

- 本报告不把该后端的边界扩大成整个 Harness 部署的边界；其他外层隔离与策略需要另行验证。

## Cross-Repo Comparison

| Agent | 已核对的 Windows/本地方案 | 是否可直接视为 KQode U5 Full |
|---|---|---|
| Codex | 原生 restricted token；elevated 路径另有专用普通账户、ACL、网络 setup。[\[1\]][ref-1] [\[2\]][ref-2] [\[4\]][ref-4] | 否；完整实现是研究对象，未实测 KQode 验收矩阵 |
| OpenCode | 宿主权限执行，权限提示不是安全边界；外部容器/VM 可另行提供隔离。[\[8\]][ref-8] [\[9\]][ref-9] | 否 |
| Kimi | 已追踪路径为命令审批规则、host process service 与 LocalKaos 普通子进程。[\[10\]][ref-10] [\[14\]][ref-14] | 证据不足；不作全产品否定 |
| Gemini | 可选原生 C# helper：restricted token、Low Integrity、Job、ACL/标签；另有容器选项。[\[5\]][ref-5] [\[6\]][ref-6] [\[15\]][ref-15] | 否；尤其网络处理不等同 fail-closed 全拒绝 |
| Pi | 默认本地 shell；更强隔离和确认机制交给外部环境或扩展。[\[11\]][ref-11] [\[12\]][ref-12] | 否 |
| DeepSeek Harness | 原生 ACL 写限制，明确记录环境权限与别名边界，网络不在这一层。[\[7\]][ref-7] | 否 |

## KQode Lessons

### Product behavior

- 审批、部分约束与严格隔离是不同产品承诺。OpenCode/Pi 的简化方案可以作为另一种产品选择，但不能静默替代当前 U5 的严格验收。是否改范围必须由用户决定。[\[8\]][ref-8] [\[12\]][ref-12]

### Architecture implications

- 原生 Windows 仍有值得研究的路线：Codex 和 Gemini 都不依赖 Windows Sandbox VM。刚才将启用 Windows Sandbox 提为下一步，不应被理解为已排除这些路线。[\[1\]][ref-1] [\[5\]][ref-5]
- **单仓库启示（Codex）：** 下一次原生评估应针对完整专用账户/ACL/网络组合，而不是继续给当前用户的令牌增加兼容 SID。其 setup 会改变主机状态，同样必须另行授权，不能照搬到本机执行。[\[2\]][ref-2] [\[4\]][ref-4] [\[13\]][ref-13]

### Evaluation ideas

- 将环境允许 ACE、已有硬链接、初始化兼容性与实际文件变化作为独立对照，而不是只检查令牌构造成功。参考源码只能给出测试方向，不能替代 KQode 的实测。[\[7\]][ref-7] [\[13\]][ref-13]
- 区分网络“限速”“配置失败仅警告”和真正拒绝，不因后端名称中包含 sandbox 就提升能力。[\[5\]][ref-5]

### Risks and tradeoffs

- 专用账户和 ACL 标签方案不是零系统副作用；VM 方案也不是安装后就能宣布 U5 完成。需要分别评估权限准备、路径映射、通信、清理和失败行为。前者的系统副作用已有代码依据；后者为待设计事项，不是本报告的实现结论。[\[2\]][ref-2] [\[4\]][ref-4] [\[15\]][ref-15]

## Evidence Gaps

- OpenCode：checkout blocked by existing cache changes；固定提交 blob 可引用，但 checkout 工作流未完整完成。
- Kimi：partial_trace；不能从 LocalKaos 推断所有扩展后端。
- 所有仓库：仅阅读默认分支固定提交，未确认各发布版本、默认配置或执行任何安全验证。
- 不将 absence of evidence 写成“所有 agent 都不用虚拟机”或“所有原生方案都不可行”。
- 用户在系统授权表单中提出本研究问题，而非授权系统变更。本次未启用 Windows Sandbox、创建账户或修改主机 ACL/防火墙。

## References

- <a id="ref-1"></a>[1] Codex：Windows 模式与 elevated setup ([code](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/windows_sandbox.rs#L24-L42), [setup](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/windows_sandbox.rs#L101-L130)).
- <a id="ref-2"></a>[2] Codex：sandbox 账户组与普通账户创建 ([code](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/windows-sandbox-rs/src/bin/setup_main/win/sandbox_users.rs#L62-L125)).
- <a id="ref-3"></a>[3] Codex：elevated runner 从 sandbox 用户派生令牌 ([code](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/windows-sandbox-rs/src/bin/command_runner/win.rs#L1-L10)).
- <a id="ref-4"></a>[4] Codex：ACL 与 offline 网络 setup ([code](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/windows-sandbox-rs/src/bin/setup_main/win.rs#L608-L632), [network](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/windows-sandbox-rs/src/bin/setup_main/win.rs#L733-L762)).
- <a id="ref-5"></a>[5] Gemini：受限令牌、Low Integrity、Job 与网络限速失败处理 ([code](https://github.com/google-gemini/gemini-cli/blob/9c1b0a610534d6f8120964cf2672c07807d8fc90/packages/core/src/sandbox/windows/GeminiSandbox.cs#L240-L307)).
- <a id="ref-6"></a>[6] Gemini：sandbox 配置与平台选择 ([code](https://github.com/google-gemini/gemini-cli/blob/9c1b0a610534d6f8120964cf2672c07807d8fc90/packages/cli/src/config/sandboxConfig.ts#L24-L115)).
- <a id="ref-7"></a>[7] DeepSeek：workspace/temp ACL 与已知边界 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-windows-acl/src/index.ts#L1-L39), [boundaries](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-windows-acl/README.md#L100-L120)).
- <a id="ref-8"></a>[8] OpenCode：明确的非沙箱威胁模型 ([code](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/SECURITY.md#L9-L19)).
- <a id="ref-9"></a>[9] OpenCode：Bash 宿主权限及审批请求 ([code](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/packages/core/src/tool/bash.ts#L129-L149)).
- <a id="ref-10"></a>[10] Kimi：Bash 的审批规则与 host process service 调用 ([code](https://github.com/moonshotai/kimi-code/blob/ee2cac102b835fcd7adb3d4b9bc3d62b0b71cdfd/packages/agent-core-v2/src/agent/tools/os/bash/bashTool.ts#L137-L172)).
- <a id="ref-11"></a>[11] Pi：本地 shell 直接启动子进程 ([code](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/tools/bash.ts#L78-L105)).
- <a id="ref-12"></a>[12] Pi：权限确认与外部隔离的产品选择 ([code](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/README.md#L493-L507), [containerization](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/README.md#L39-L48)).
- <a id="ref-13"></a>[13] Codex：兼容 SID 与 WRITE_RESTRICTED 构造 ([code](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/windows-sandbox-rs/src/token.rs#L448-L486)).
- <a id="ref-14"></a>[14] Kimi：LocalKaos 的 Node 子进程启动 ([code](https://github.com/moonshotai/kimi-code/blob/ee2cac102b835fcd7adb3d4b9bc3d62b0b71cdfd/packages/kaos/src/local.ts#L727-L756)).
- <a id="ref-15"></a>[15] Gemini：允许目标的 ACL 与完整性标签 ([code](https://github.com/google-gemini/gemini-cli/blob/9c1b0a610534d6f8120964cf2672c07807d8fc90/packages/core/src/sandbox/windows/GeminiSandbox.cs#L445-L488)).

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
