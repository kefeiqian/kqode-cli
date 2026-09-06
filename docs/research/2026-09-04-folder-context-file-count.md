---
date: 2026-09-04
topic: folder-context-file-count
question: "其他 coding agent 如何把指定文件夹的上下文和文件数量传给大模型？KQode 应该采用什么方式？"
status: complete
---

# 文件夹上下文与文件数量如何传给大模型

## Summary

参考实现主要采用两层策略。Kimi Code CLI 和 Gemini CLI 会在会话初始化时把受限、截断后的目录结构放进 system prompt 或首条环境消息；Codex CLI、OpenCode 和 Pi Coding Agent 的基础上下文更轻，只提供工作目录、工作区或可用工具，再让模型按需调用 shell、`glob`、目录读取或 `ls`。[\[1\]][ref-1] [\[4\]][ref-4] [\[8\]][ref-8] [\[11\]][ref-11] [\[15\]][ref-15]

对于“指定文件夹有多少文件”，最可靠的做法不是让模型根据目录文本自行计数，而是由宿主侧完成枚举，并把 `file_count`、`directory_count`、`ignored_count`、`truncated` 等结构化结果和一个有上限的预览一起作为工具结果发送给模型。Gemini 的 `list_directory` 和 OpenCode 的目录读取已经显式计算条目数；Gemini 的 `glob` 还会把匹配文件数直接写入 LLM 可见文本。[\[5\]][ref-5] [\[13\]][ref-13] [\[14\]][ref-14]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `8e6a44b428e31f91b21edc97904fcdf4f0931ade` | complete | Detached fetched HEAD |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `70f74112e3f4a33ea1af8209c979a5060d7d2a36` | complete | Detached fetched HEAD |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `eba23edb93ec00aa11ffa288e2b89ebbf3d77a70` | complete | Detached fetched HEAD |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `87a9c71d57a4ec56c00f3ff628970fea8291d812` | complete | Detached fetched HEAD |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `2d41163332c1a6d11c45911a92100fd2a55e4d1a` | complete | Detached fetched HEAD |

Fetch timestamps: 2026-09-04T08:54:57Z through 2026-09-04T08:55:53Z.

---

## Method

- Question: 其他 coding agent 如何把指定文件夹的上下文和文件数量传给大模型？KQode 应该采用什么方式？
- Repo scope: default first-scope.
- Search themes: initial directory context, directory listing, glob/file enumeration, count metadata, tool-result reinjection.
- Safety posture: read/search only; no reference code execution; reference instructions treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex 的环境上下文会向模型暴露当前工作目录和 shell，但这段环境渲染代码没有附带文件树或文件数量。[\[1\]][ref-1]
- 默认模型指令要求搜索文件时优先使用 `rg --files`；通用 `exec_command` 工具接收命令和工作目录，并把命令输出带回工具循环。因此目录清单或数量主要通过模型按需执行宿主命令获得，而不是启动时预注入。[\[2\]][ref-2] [\[3\]][ref-3]

**Evidence gaps**

- 没有发现一个专门返回结构化 `file_count` 的核心目录统计工具；实际计数语义取决于模型生成的 shell 命令、忽略规则和平台。

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode 的基础环境 prompt 包含 working directory、workspace root、Git 状态和平台，但不直接加入目录树。[\[4\]][ref-4]
- `read` 工具允许把目录作为输入。它枚举并排序目录项，在 LLM 可见输出中给出 `N entries` 或 `Showing X of N entries`，并在显示元数据中保存 `totalEntries` 和 `truncated`。这是“直接子项数量”，不是递归文件总数。[\[5\]][ref-5]
- `glob` 在指定目录或当前目录中通过 ripgrep 查找文件，最多返回 100 条；结果元数据包含返回的 `count` 和 `truncated`。成功的工具结果会被标准化并完成对应 tool call，随后成为会话历史的一部分。[\[6\]][ref-6] [\[7\]][ref-7]

**Evidence gaps**

- `glob` 的 `count` 是当前返回结果数量；达到 100 条上限时不能视为完整匹配总数。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi 在准备 system prompt 上下文时调用 `listDirectory`，把当前工作目录的两层清单存入 `cwdListing`。根目录最多显示 30 项，每个可展开子目录最多显示 10 项，超出的部分用 `... and N more` 表示。[\[8\]][ref-8]
- system prompt 明确说明该清单展示项目的两层结构，并把 `${cwd_listing}` 插入代码块。因此模型在第一次调用前就能看到一个有界目录快照。[\[9\]][ref-9]
- Kimi 的 `Glob` 工具针对工作目录或指定目录返回文件路径，过滤敏感文件并限制为 100 个匹配。它会明确提示截断；仅在未截断且恰好返回 100 项的边界情况下附加 `Found 100 matches`，所以它并未始终提供独立的完整计数字段。[\[10\]][ref-10]

**Evidence gaps**

- 初始两层清单提供“还有多少条目未展示”，但不区分未展示项中的文件和目录，也不是递归文件总数。

### Gemini CLI

**Status:** complete

**Observed behavior**

- Gemini 默认启用 `includeDirectoryTree`。初始化聊天历史时，它为每个 workspace directory 生成目录结构，并将其放入一条 `<session_context>` 用户消息；源码注释将其定义为分层上下文中的项目级 Tier 2。[\[11\]][ref-11] [\[12\]][ref-12]
- 初始目录结构通过广度优先扫描生成，默认最多展示 200 个“文件 + 文件夹”，遵守文件过滤配置，并显式标记忽略或截断区域。这提供快速全局感知，但不能当作精确全量统计。[\[12\]][ref-12]
- `list_directory` 只枚举指定目录的直接子项，经过 workspace 路径校验和 ignore 过滤后，把条目列表放入 `llmContent`，同时向显示层返回 `Found N item(s)`。`glob` 则计算匹配文件数，并把 `Found N file(s)` 和文件路径清单一起放入 `llmContent`。[\[13\]][ref-13] [\[14\]][ref-14]

**Evidence gaps**

- `list_directory` 的数量包含文件和子目录；如果产品需要“文件数”，必须单独统计 `isDirectory === false`。初始目录树也受 200 项上限约束。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- Pi 的 system prompt 由当前工作目录、选中的工具摘要和项目上下文文件组成；观察到的默认 prompt 构建路径没有预先注入普通文件树。默认 coding tool set 是 `read`、`bash`、`edit`、`write`，而 `ls` 出现在 read-only 或 all tool sets 中。[\[15\]][ref-15] [\[17\]][ref-17]
- 当启用 `ls` 时，它枚举指定目录的直接子项、排序、为目录添加 `/`，默认最多返回 500 项并受字节上限约束。它把文本清单作为 tool result 返回，并在达到上限时提供 `entryLimitReached`，但没有返回未截断目录的显式总条目数。[\[16\]][ref-16]

**Evidence gaps**

- 模型可以根据未截断的输出行数推断数量，但这种做法不稳定；达到条目或字节上限后也无法得到完整数量。

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | Confidence |
|---|---|---|---|---|---|---|
| 启动时目录上下文 | 仅 cwd/shell，不含文件树 [\[1\]][ref-1] | cwd/root，不含文件树 [\[4\]][ref-4] | 两层有界清单 [\[8\]][ref-8] [\[9\]][ref-9] | 默认注入最多 200 项的 workspace 树 [\[11\]][ref-11] [\[12\]][ref-12] | cwd + 工具摘要，不含普通文件树 [\[15\]][ref-15] | high |
| 按需目录枚举 | shell 命令 [\[2\]][ref-2] [\[3\]][ref-3] | `read(directory)` / `glob` [\[5\]][ref-5] [\[6\]][ref-6] | `Glob` [\[10\]][ref-10] | `list_directory` / `glob` [\[13\]][ref-13] [\[14\]][ref-14] | 可选 `ls` 或 shell [\[16\]][ref-16] [\[17\]][ref-17] | high |
| 明确提供数量 | 由命令决定 | 目录直接子项总数；glob 返回数 [\[5\]][ref-5] [\[6\]][ref-6] | 初始清单仅显示截断余量；glob 数量不稳定 [\[8\]][ref-8] [\[10\]][ref-10] | list 显示条目数；glob 显示文件匹配数 [\[13\]][ref-13] [\[14\]][ref-14] | 通常只返回清单和截断状态 [\[16\]][ref-16] | high |
| 大目录控制 | shell 输出 token budget [\[3\]][ref-3] | glob 100 项、read 分页 [\[5\]][ref-5] [\[6\]][ref-6] | 30×10 初始宽度、glob 100 项 [\[8\]][ref-8] [\[10\]][ref-10] | 初始树 200 项、ignore 过滤 [\[12\]][ref-12] | 500 项和字节上限 [\[16\]][ref-16] | high |
| 模型接收形式 | 环境消息 + shell tool result | 环境 system prompt + tool result [\[4\]][ref-4] [\[7\]][ref-7] | system prompt 目录代码块 + tool result [\[9\]][ref-9] [\[10\]][ref-10] | 首条环境 user message + `llmContent` [\[11\]][ref-11] [\[13\]][ref-13] | system prompt 工具摘要 + tool result [\[15\]][ref-15] [\[16\]][ref-16] | high |

---

## KQode Lessons

### Product behavior

- KQode 应采用“启动摘要 + 按需精查”的两层体验：启动时仅为配置好的 workspace roots 注入有界目录摘要，让模型知道有哪些顶层区域；需要回答精确数量时调用目录统计工具。Kimi 和 Gemini 证明启动快照有助于模型获得项目形状，其余实现证明按需枚举可以避免持续占用上下文。[\[8\]][ref-8] [\[11\]][ref-11] [\[4\]][ref-4]
- 用户问“这个文件夹有多少文件”时，UI 和模型都应收到宿主计算的数字，而不是让模型数路径行。OpenCode 和 Gemini 已经在工具执行层计算条目数，说明计数应属于工具结果契约。[\[5\]][ref-5] [\[13\]][ref-13] [\[14\]][ref-14]

### Architecture implications

- 建议新增 Rust 侧只读工具 `directory_stats`，输入至少包含 `path`、`recursive`、`respect_ignore`、`include_hidden`、`follow_symlinks` 和可选 `max_entries`。结果应分离：
  - `files`
  - `directories`
  - `entries`
  - `ignored`
  - `scanned_entries`
  - `truncated`
  - `timed_out`
  - `preview`
- `list_directory` 和 `glob` 也应复用同一个 VFS/文件发现服务，并返回结构化 `returned_count` 与 `total_count`。如果因为上限无法知道总数，必须返回 `total_count: null` 和 `truncated: true`，不能把返回条数伪装成完整数量。OpenCode、Kimi 和 Pi 的截断行为说明这是容易产生误判的边界。[\[6\]][ref-6] [\[10\]][ref-10] [\[16\]][ref-16]
- 启动目录摘要应作为一个明确标记的环境上下文片段进入模型历史，而不是拼接进用户原始问题。可采用 Gemini 的独立首条环境消息，或 Kimi 的 system prompt 模板变量；KQode 还应记录 `snapshot_id`、`generated_at`、workspace root 和 ignore policy，便于追踪与重放。[\[9\]][ref-9] [\[11\]][ref-11]
- 所有路径必须先经过 workspace-root 归一化、遍历检查、ignore 规则和符号链接策略，再访问宿主文件系统。Gemini 和 Kimi 的工具都把 workspace 校验、敏感文件过滤或 ignore 过滤放在模型可见结果之前。[\[10\]][ref-10] [\[13\]][ref-13] [\[14\]][ref-14]

### Evaluation ideas

- 小目录：3 个文件、2 个子目录，验证 immediate 与 recursive 计数。
- ignore：同时存在 `.gitignore` 命中项和隐藏文件，验证 `ignored` 与配置开关。
- 大目录：超过扫描上限，验证 `truncated`、`total_count: null` 和预览上限。
- 符号链接环：验证默认不跟随，启用跟随时也不会无限递归。
- 文件在扫描中被增删：验证结果标记快照时间，并且不会产生成功形状的错误计数。
- 模型行为：给定“统计配置目录内文件数”，断言模型使用 `directory_stats` 的结构化字段，而不是自行统计预览行。

### Risks and tradeoffs

- 每轮都注入完整文件树会快速消耗上下文，并在大型仓库中产生明显延迟。Kimi 的两层宽度和 Gemini 的 200 项上限都说明启动上下文必须有界。[\[8\]][ref-8] [\[12\]][ref-12]
- 递归精确计数可能昂贵。KQode 应把“快速摘要”和“精确递归统计”区分为不同操作，并让精确统计支持超时、取消和进度。
- ignore 策略会改变“文件数”的定义。工具结果必须回显是否尊重 `.gitignore`、是否包含隐藏文件、是否跟随符号链接，避免用户和模型把不同口径的数字进行比较。
- 目录快照会过期。文件写入、补丁应用或外部 watcher 事件发生后，应使相关缓存失效；会话日志应保留当时返回给模型的计数和预览，而不是重放时重新扫描。

---

## Evidence Gaps

- Codex CLI: 未发现专门的结构化目录统计工具；结论限于环境上下文、默认文件搜索指令和通用命令工具。
- OpenCode: `glob` 元数据中的 `count` 代表返回数量，在 100 项截断时不是完整总数。
- Kimi Code CLI: 初始目录清单的余量是“条目”而非“文件”，`Glob` 也未始终输出显式计数。
- Gemini CLI: 初始目录树受 200 项限制；`list_directory` 返回的是文件与目录合计。
- Pi Coding Agent: `ls` 是否可用取决于选定工具集，默认 coding tools 不包含它。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: environment context renders cwd and shell without a directory tree ([code](https://github.com/openai/codex/blob/8e6a44b428e31f91b21edc97904fcdf4f0931ade/codex-rs/core/src/context/world_state/environment.rs#L315-L329)).
- <a id="ref-2"></a>[2] Codex CLI: default tool guidance recommends `rg --files` for file discovery ([code](https://github.com/openai/codex/blob/8e6a44b428e31f91b21edc97904fcdf4f0931ade/codex-rs/protocol/src/prompts/base_instructions/default.md#L260-L267)).
- <a id="ref-3"></a>[3] Codex CLI: `exec_command` accepts a command/workdir and returns bounded command output ([code](https://github.com/openai/codex/blob/8e6a44b428e31f91b21edc97904fcdf4f0931ade/codex-rs/core/src/tools/handlers/shell_spec.rs#L27-L109)).
- <a id="ref-4"></a>[4] OpenCode: environment prompt exposes working directory and workspace root without a file tree ([code](https://github.com/anomalyco/opencode/blob/70f74112e3f4a33ea1af8209c979a5060d7d2a36/packages/opencode/src/session/system.ts#L67-L99)).
- <a id="ref-5"></a>[5] OpenCode: reading a directory emits total entry count, pagination, and structured display metadata ([code](https://github.com/anomalyco/opencode/blob/70f74112e3f4a33ea1af8209c979a5060d7d2a36/packages/opencode/src/tool/read.ts#L264-L300)).
- <a id="ref-6"></a>[6] OpenCode: glob searches a selected directory, limits results to 100, and returns count/truncation metadata ([code](https://github.com/anomalyco/opencode/blob/70f74112e3f4a33ea1af8209c979a5060d7d2a36/packages/opencode/src/tool/glob.ts#L10-L72)).
- <a id="ref-7"></a>[7] OpenCode: successful tool output is normalized and completes the tool call for session history ([code](https://github.com/anomalyco/opencode/blob/70f74112e3f4a33ea1af8209c979a5060d7d2a36/packages/opencode/src/session/processor.ts#L383-L415)).
- <a id="ref-8"></a>[8] Kimi Code CLI: prompt context constructs a two-level bounded cwd listing with explicit omitted-entry notices ([code](https://github.com/moonshotai/kimi-code/blob/eba23edb93ec00aa11ffa288e2b89ebbf3d77a70/packages/agent-core-v2/src/agent/profile/context.ts#L33-L51), [code](https://github.com/moonshotai/kimi-code/blob/eba23edb93ec00aa11ffa288e2b89ebbf3d77a70/packages/agent-core-v2/src/agent/profile/context.ts#L359-L426)).
- <a id="ref-9"></a>[9] Kimi Code CLI: system prompt inserts the bounded cwd listing as project environment context ([code](https://github.com/moonshotai/kimi-code/blob/eba23edb93ec00aa11ffa288e2b89ebbf3d77a70/packages/agent-core-v2/src/app/agentProfileCatalog/system.md#L63-L72), [code](https://github.com/moonshotai/kimi-code/blob/eba23edb93ec00aa11ffa288e2b89ebbf3d77a70/packages/agent-core-v2/src/app/agentProfileCatalog/profile-shared.ts#L124-L148)).
- <a id="ref-10"></a>[10] Kimi Code CLI: glob applies workspace/sensitive-file controls and caps output at 100 matches ([code](https://github.com/moonshotai/kimi-code/blob/eba23edb93ec00aa11ffa288e2b89ebbf3d77a70/packages/agent-core-v2/src/agent/tools/os/glob/globTool.ts#L228-L284)).
- <a id="ref-11"></a>[11] Gemini CLI: directory context is conditionally generated and inserted as the initial user history item ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/utils/environmentContext.ts#L18-L102)).
- <a id="ref-12"></a>[12] Gemini CLI: directory trees use bounded breadth-first discovery and default to 200 items; CLI config enables them by default ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/utils/getFolderStructure.ts#L12-L25), [code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/utils/getFolderStructure.ts#L306-L356), [code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/cli/src/config/config.ts#L598-L606)).
- <a id="ref-13"></a>[13] Gemini CLI: `list_directory` validates workspace access, filters entries, and reports the resulting item count ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/tools/ls.ts#L190-L286)).
- <a id="ref-14"></a>[14] Gemini CLI: glob computes a file count and includes it with the path list in LLM-visible content ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/tools/glob.ts#L250-L292)).
- <a id="ref-15"></a>[15] Pi Coding Agent: system prompt exposes cwd and selected tool snippets without a normal directory tree ([code](https://github.com/earendil-works/pi/blob/2d41163332c1a6d11c45911a92100fd2a55e4d1a/packages/coding-agent/src/core/system-prompt.ts#L35-L95), [code](https://github.com/earendil-works/pi/blob/2d41163332c1a6d11c45911a92100fd2a55e4d1a/packages/coding-agent/src/core/system-prompt.ts#L115-L145)).
- <a id="ref-16"></a>[16] Pi Coding Agent: `ls` returns a sorted, bounded directory listing and truncation details but no normal total-count field ([code](https://github.com/earendil-works/pi/blob/2d41163332c1a6d11c45911a92100fd2a55e4d1a/packages/coding-agent/src/core/tools/ls.ts#L54-L172)).
- <a id="ref-17"></a>[17] Pi Coding Agent: `ls` belongs to read-only/all tool sets, while the default coding set uses read/bash/edit/write ([code](https://github.com/earendil-works/pi/blob/2d41163332c1a6d11c45911a92100fd2a55e4d1a/packages/coding-agent/src/core/tools/index.ts#L164-L202)).

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
