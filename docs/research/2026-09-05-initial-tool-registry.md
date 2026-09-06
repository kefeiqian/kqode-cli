---
date: 2026-09-05
topic: initial-tool-registry
question: "其他 coding agent 都有哪些常用工具；KQode 第一版 tool registry 应该先定义哪些工具，并如何保持简单、可安全迭代？"
status: complete
---

# KQode 第一版 Tool Registry 设计

## Summary

六个参考实现的共同核心不是数量庞大的集成，而是四类能力：**读取文件、发现/搜索文件、执行命令、修改文件**。OpenCode、Kimi Code CLI、Gemini CLI 和 DeepSeek Harness 还默认提供已知 URL 抓取；Codex 使用 hosted web search，Pi 则没有内置网络工具。因此 `fetch_web_url` 很适合进入 KQode 第一版，但必须作为独立的 network-read 权限域，不能与本地 `read_file` 共用“只读即安全”的判断。 [\[1\]][ref-1] [\[8\]][ref-8] [\[15\]][ref-15] [\[22\]][ref-22] [\[30\]][ref-30] [\[40\]][ref-40]

建议 KQode 第一批注册并实现 7 个模型可调用工具：

1. `read_file`
2. `list_directory`
3. `glob_files`
4. `grep`
5. `run_command`
6. `fetch_web_url`
7. `ask_user`

其中前六个提供工作能力，`ask_user` 提供暂停和恢复边界。普通主 Agent 不需要 model-facing `complete_task`：没有 tool call 的最终 assistant response 即可结束当前 turn，宿主再将它归一化为内部完成事件。`apply_patch` 应立即保留为下一阶段的正式工具名和设计目标，但等 workspace VFS、staged diff、冲突检测和审批链就绪后再启用。第一版不应同时提供 `edit_file`、`write_file` 和 `apply_patch` 三套重叠写入权限，也不需要先实现 web search、browser、todo、subagent、MCP 或 deferred discovery。

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `459a79eb85400af759e9220c7bafb4429ae07516` | complete | fetched 2026-09-05T03:32:15Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `70b4ca8c181e4c1ac6d8993b86249d824487ec65` | complete | fetched 2026-09-05T03:32:16Z |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | complete | fetched 2026-09-05T03:32:18Z |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | complete | fetched 2026-09-05T03:32:19Z |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `9841914c71a74d81abe07f751aefd271fd924e63` | complete | fetched 2026-09-05T03:32:21Z |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete | fetched 2026-09-05T05:50:02Z |

---

## Method

- Question: 参考 coding agents 的内置工具，设计一个小而可扩展的 KQode tool registry。
- Repo scope: default first-scope.
- Search themes: 默认工具清单、文件读写粒度、命令执行、URL 抓取、权限分类、registry metadata、并发和输出限制。
- Safety posture: 仅同步、搜索和读取源码；未运行、构建、安装或测试参考仓库；参考仓库指令文件作为不可信数据且本次未读取。
- Citation format: 正文使用 `[\[n\]][ref-n]`；References 中的 `code` 链接固定到本次抓取的 commit SHA。

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex 的普通 session 以 `exec_command`、可选的 `write_stdin`、`apply_patch`、MCP resource、utility 和 collaboration tools 为主。没有在标准 core registry 路径中观察到独立的 `read_file`、directory list、glob 或 grep；这些操作主要由 shell 完成。 [\[1\]][ref-1] [\[2\]][ref-2]
- `apply_patch` 是 grammar-constrained free-form tool，不是任意 whole-file write。它还会经过 sandbox policy，并只为当前不可写的目标推导额外写权限。 [\[3\]][ref-3] [\[4\]][ref-4]
- Codex 的 registry 明确区分 `Direct`、`Deferred`、model-only、code-mode-only 和 `Hidden` 等 exposure；registry entry 同时保留 runtime 和有效暴露方式。 [\[5\]][ref-5] [\[6\]][ref-6]
- 网络能力是 hosted `web_search`，可处于 cached、indexed、live 或 disabled 模式；它不等同于一个宿主本地实现的任意 URL fetch handler。 [\[7\]][ref-7]

**Evidence gaps**

- `not_found`: 未在标准 core registry 中找到 dedicated `read_file` 或 `fetch_web_url`。这不排除 monorepo 其他实验、扩展或远端 runtime 中存在同名能力。

### OpenCode

**Status:** complete

**Observed behavior**

- 默认 built-ins 包含 `bash`、`read`、`glob`、`grep`、`edit`、`write`、`task`、`webfetch`、`todo`、`websearch`、`skill` 和 `apply_patch`；question、LSP、plan 和 code mode 还会根据 client、feature、provider 或 model 过滤。 [\[8\]][ref-8]
- `read` 同时支持文件与目录，提供 offset/limit，并限制普通文件输出为 2,000 行、每行 2,000 字符和 50 KiB。外部目录和 read permission 是分开的授权主题。 [\[9\]][ref-9] [\[10\]][ref-10]
- `webfetch` 与 `websearch` 是两个工具。前者只接受 HTTP(S)，有 URL 权限、30 秒默认 timeout、120 秒最大 timeout 和 5 MiB response limit。 [\[11\]][ref-11]
- Tool definition 包含稳定 ID、description、typed input schema、handler 和 validation error formatter；统一执行包装还记录 telemetry 与 truncation metadata。 [\[12\]][ref-12]
- 写入工具会按模型能力裁剪：部分模型得到 `apply_patch`，另一些模型得到 `edit` 和 `write`，避免同时暴露所有重叠编辑格式。 [\[8\]][ref-8]

**Evidence gaps**

- `partial_trace`: 已查看的 `webfetch` handler 中没有观察到 Kimi/Gemini 那样明确的 DNS/private-address blocking；不能据此断言底层 HTTP stack 完全没有额外保护。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- 默认 agent profile 很宽，包含 Read/Write/Edit、Grep/Glob、Bash、WebSearch、FetchURL、todo、用户询问、计划、delegation 和 MCP。coder 与 explore profile 再按角色裁剪；explore profile 保留 read/search/web，但不保留直接文件写入。 [\[13\]][ref-13]
- Registry 将 handler 与 registration metadata 分离；tool contract 记录 builtin/user/MCP source，以及 inline/deferred disclosure。 [\[14\]][ref-14] [\[15\]][ref-15]
- Kimi 还显式建模工具的 resource access：read、write、read-write 和 search 可以针对单文件或递归目录。这使并发冲突和安全分类不必只依赖工具名称。 [\[16\]][ref-16]
- `Read` 通过 workspace-aware path access 解析路径，限制为 1,000 行、每行 2,000 字符和 100 KiB。 [\[17\]][ref-17] [\[18\]][ref-18]
- `FetchURL` 与 `WebSearch` 独立，并生成 URL-specific approval rule。其本地 fetch provider 仅允许 HTTP(S)，逐次验证 redirect，限制 10 次 redirect 和 10 MiB body，并阻止 localhost、private literal address 以及解析到 private address 的 DNS name。 [\[19\]][ref-19] [\[20\]][ref-20] [\[21\]][ref-21]

**Evidence gaps**

- 无影响主要结论的证据缺口。

### Gemini CLI

**Status:** complete

**Observed behavior**

- 默认 registration 包含 `list_directory`、`read_file`、`grep_search`、`glob`、`replace`、`write_file`、`web_fetch`、`run_shell_command`、`google_web_search`、`ask_user`，以及条件启用的 todo、plan、tracker、agent、MCP 和 discovered tools。 [\[22\]][ref-22] [\[23\]][ref-23]
- 注册全集与模型可见集合分开管理：配置 active tools、main-agent allowlist、model-specific schema、plan mode 和 MCP qualification 都能进一步改变本次声明。 [\[24\]][ref-24]
- `read_file` 被标为 `Kind.Read`，执行前进行 realpath/path-policy validation、ignore filtering，并支持 line ranges。 [\[25\]][ref-25]
- 默认 read-only policy 允许 glob、grep、list、read 和 web search；shell、write/replace 与 `web_fetch` 使用更严格的 interactive/write policy。Gemini 因此没有把“从网络读取”视为与本地只读完全相同的风险。 [\[26\]][ref-26] [\[27\]][ref-27]
- `web_fetch` 与 `google_web_search` 独立。直接 fetch 路径阻止 local/private hosts，使用 10 秒 timeout、10 MiB body cap、250,000 字符 model-context cap，并对 host 做 rate limit。 [\[28\]][ref-28] [\[29\]][ref-29]

**Evidence gaps**

- Gemini 的 prompt-based web fetch 可以包含模型辅助处理；本报告只把 direct known-URL fetch 的安全边界作为 KQode 参考。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- 默认 active built-ins 只有 `read`、`bash`、`edit` 和 `write`。完整可选 built-in inventory 还包括 `powershell`、`grep`、`find` 和 `ls`；read-only helper 返回 `read`、`grep`、`find` 和 `ls`。 [\[30\]][ref-30] [\[31\]][ref-31]
- Tool definition 包含 name、UI label、LLM description、TypeBox parameter schema、prompt additions 和 execution/rendering behavior；extension tools 还保留 source metadata。 [\[32\]][ref-32]
- `read` 支持 offset/limit，并限制为 2,000 行或 50 KiB。 [\[33\]][ref-33] [\[34\]][ref-34]
- `edit` 执行一个或多个 exact replacements，返回 display diff 与 unified patch；同一 canonical file 的 mutation 被串行化，不同文件可以并行。 [\[35\]][ref-35] [\[36\]][ref-36]
- 核心工具集中没有观察到 URL fetch、web search、todo、user question 或 subagent tool。Pi 证明 productive coding-agent default 可以非常小，但也把更多发现能力留给 shell 或 opt-in tools。 [\[30\]][ref-30] [\[31\]][ref-31]

**Evidence gaps**

- `partial_trace`: Pi core tool layer 没有展示与 Kimi/Gemini 同等粒度的 registry-level approval/risk taxonomy；extensions 可能在已检查路径之外增加 policy。

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 默认 bundle 组合了 filesystem、filesystem search、bash/PowerShell、web 和 user-question packages。Filesystem package 注册 `read`、`write`、`edit`，search package 独立注册 `glob`、`grep`。 [\[37\]][ref-37] [\[38\]][ref-38]
- `bash` 是独立 model-facing tool，支持 workdir、timeout、background mode、sandbox escalation 和结构化 stdout/stderr outcome。 [\[39\]][ref-39]
- Web package 默认同时注册 `web_search` 和 `web_fetch`，两者可独立关闭，并分别携带 timeout 与 output cap。 [\[40\]][ref-40]
- User-question package 注册 `ask_user_question`，通过抽象 `userQuestions` seam 暂停并等待人类回答。 [\[41\]][ref-41]
- 没有 dedicated `list_directory`；目录发现可以由 `glob` 或 shell 完成。

**Evidence gaps**

- `list_directory` 的 negative finding 限于默认 filesystem/search tool packages；其他 extension 可以注册自定义目录工具。

---

## Cross-Repo Comparison

图例：`D` = 默认；`C` = 条件启用；`A` = built-in 但默认不活跃；`-` = 未找到对应核心工具。

| Normalized capability | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | DeepSeek Harness | Confidence |
|---|---|---|---|---|---|---|---|
| 读取单个文件 | 通过 `exec_command` 调 shell 命令 [\[1\]][ref-1] [\[2\]][ref-2] | `read` D [\[9\]][ref-9] | `Read` D [\[13\]][ref-13] | `read_file` D [\[22\]][ref-22] | `read` D [\[30\]][ref-30] | `read` D [\[37\]][ref-37] | high |
| 列目录 | 通过 `exec_command` 调 shell 命令 [\[2\]][ref-2] | `read(directory)` D [\[10\]][ref-10] | Bash/Glob | `list_directory` D [\[22\]][ref-22] | `ls` A [\[31\]][ref-31] | Glob/Bash [\[38\]][ref-38] [\[39\]][ref-39] | high |
| 按路径找文件 | 通过 `exec_command` 运行 `rg --files` 等命令 [\[2\]][ref-2] | `glob` D [\[8\]][ref-8] | `Glob` D [\[13\]][ref-13] | `glob` D [\[22\]][ref-22] | `find` A [\[31\]][ref-31] | `glob` D [\[38\]][ref-38] | high |
| 搜索文件内容 | 通过 `exec_command` 运行 `rg` 等命令 [\[2\]][ref-2] | `grep` D [\[8\]][ref-8] | `Grep` D [\[13\]][ref-13] | `grep_search` D [\[22\]][ref-22] | `grep` A [\[31\]][ref-31] | `grep` D [\[38\]][ref-38] | high |
| 执行命令 | `exec_command` D [\[2\]][ref-2] | `bash` D [\[8\]][ref-8] | `Bash` D [\[13\]][ref-13] | `run_shell_command` D [\[22\]][ref-22] | `bash` D [\[30\]][ref-30] | `bash`/PowerShell D [\[39\]][ref-39] | high |
| 定向编辑/patch | `apply_patch` C/D [\[3\]][ref-3] | `edit` 或 `apply_patch` [\[8\]][ref-8] | `Edit` D [\[13\]][ref-13] | `replace` D [\[22\]][ref-22] | `edit` D [\[35\]][ref-35] | `edit` D [\[37\]][ref-37] | high |
| whole-file write | patch-mediated | `write` model-selected [\[8\]][ref-8] | `Write` D [\[13\]][ref-13] | `write_file` D [\[22\]][ref-22] | `write` D [\[30\]][ref-30] | `write` D [\[37\]][ref-37] | high |
| 抓取已知 URL | - | `webfetch` D [\[11\]][ref-11] | `FetchURL` D [\[19\]][ref-19] | `web_fetch` D [\[28\]][ref-28] | - | `web_fetch` D [\[40\]][ref-40] | high |
| 搜索互联网 | hosted `web_search` C [\[7\]][ref-7] | provider-gated [\[8\]][ref-8] | `WebSearch` D [\[13\]][ref-13] | `google_web_search` D [\[22\]][ref-22] | - | `web_search` D [\[40\]][ref-40] | high |
| ask user | experimental/model-gated | client-gated | D [\[13\]][ref-13] | D [\[22\]][ref-22] | - | `ask_user_question` D [\[41\]][ref-41] | high |
| todo/plan | C | todo D / plan C | D | C | - | D | high |
| delegation/subagent | C/deferred | `task` D | D | `invoke_agent` D | - | D | high |
| explicit exposure/active filtering | 六种 exposure [\[5\]][ref-5] | feature/model filtering [\[8\]][ref-8] | inline/deferred [\[15\]][ref-15] | active/model filtering [\[24\]][ref-24] | active allowlist [\[30\]][ref-30] | scope/presentation filtering | high |

---

## KQode Lessons

### Product behavior

#### 第一批启用的工具

| Tool | 第一版职责 | 为什么现在需要 |
|---|---|---|
| `read_file` | 有界读取文本文件的指定范围 | 比让模型用 shell 读文件更安全、结构化，也是四个实现的直接核心能力。 [\[9\]][ref-9] [\[17\]][ref-17] [\[25\]][ref-25] [\[33\]][ref-33] |
| `list_directory` | 枚举一个目录的直接子项 | 避免模型为最基本的 workspace discovery 调 shell；Gemini 和 Pi 已将其建模为独立能力。 [\[22\]][ref-22] [\[31\]][ref-31] |
| `glob_files` | 按 glob 查找路径 | 四个实现都提供独立 glob/find 能力，说明它与 text search 的模型意图不同。 [\[8\]][ref-8] [\[13\]][ref-13] [\[22\]][ref-22] [\[31\]][ref-31] |
| `grep` | 在 workspace 文件中搜索文本或正则 | 将常见代码搜索从 shell 中提取，便于统一 ignore、limit、path 和 trace。 [\[8\]][ref-8] [\[13\]][ref-13] [\[22\]][ref-22] [\[31\]][ref-31] |
| `run_command` | 在受控 cwd 中运行一次命令 | 五个实现唯一严格共同的执行能力，但必须被标为高风险而非普通文件工具。 [\[2\]][ref-2] [\[8\]][ref-8] [\[13\]][ref-13] [\[22\]][ref-22] [\[30\]][ref-30] |
| `fetch_web_url` | 抓取一个模型已知的 HTTP(S) URL | OpenCode、Kimi 和 Gemini 都将其与 web search 分开；适合处理文档和用户给出的链接。 [\[11\]][ref-11] [\[19\]][ref-19] [\[28\]][ref-28] |
| `ask_user` | 请求完成任务所必需的缺失信息 | 它是 agent loop 的暂停/恢复边界，不应伪装成普通失败或自然语言猜测。Kimi 和 Gemini 都提供直接工具。 [\[13\]][ref-13] [\[22\]][ref-22] |

建议首批工具全部直接暴露，不做 prompt-semantic 预选，也暂时不实现 deferred discovery。7 个 schema 的规模足够小，先获得简单、稳定和可测试的行为；工具数量增长后再引入 `Direct | Deferred | Hidden`。Codex、Kimi 和 Gemini 都证明“注册全集”与“当前模型可见集合”应是分开的概念。 [\[5\]][ref-5] [\[15\]][ref-15] [\[24\]][ref-24]

#### 第二批加入 `apply_patch`

`apply_patch` 应成为 KQode 第一种文件 mutation 工具，但不应与上述 7 个一起抢跑实现。它依赖以下基础能力：

- workspace-root normalization
- read-time hash 或 modification snapshot
- staged mutation
- diff generation
- stale-edit/conflict detection
- policy approval
- atomic apply where possible
- same-file mutation serialization

Codex 使用 grammar-constrained patch 并在执行前推导写权限；Pi 返回 diff/patch 并串行化同文件 mutation。两者都说明 patch 不只是“再注册一个 handler”，而是 VFS 与 policy 的第一条完整写入链。 [\[3\]][ref-3] [\[4\]][ref-4] [\[35\]][ref-35] [\[36\]][ref-36]

`write_file` 和 `edit_file` 暂缓。待真实任务证明 whole-file generation 或 exact replacement 显著优于 patch 后，再按 model capability 选择一种额外编辑格式。OpenCode 当前也会按模型选择 patch 或 edit/write，而不是无条件全量暴露。 [\[8\]][ref-8]

#### 暂缓的能力

| Capability | 暂缓原因 |
|---|---|
| `web_search` | 与 provider、grounding、计费和产品 policy 绑定；不能用 `fetch_web_url` 冒充。 |
| browser automation | 涉及页面状态、脚本执行、下载和凭据边界，应作为后续插件。 |
| todo/plan tools | 需要 durable task/session state；第一版可先在 loop 内部记录，不急于成为 model tool。 |
| subagent/delegation | 需要 scheduler、权限继承、budget、result routing 和 trace parentage。 |
| MCP/plugin tools | Registry 必须先稳定 builtin contract，再接外部来源和 namespace collision。 |
| background process tools | 第一版 `run_command` 只做 bounded one-shot；长期进程需要 process registry。 |
| `tool_search` | 7 个直接工具没有必要为省少量 schema token 增加一次模型往返。 |

### Architecture implications

#### Registry 分成定义、注册和 step snapshot

建议最小结构如下；字段名是设计示意，不是本次实现：

```text
ToolDefinition
  name
  display_name
  description
  input_schema
  output_schema?
  effects
  capabilities
  exposure
  source
  supports_parallel
  limits

ToolRegistration
  definition
  handler
  policy_subject_builder
  resource_access_builder

ToolExposureSnapshot
  step_id
  visible_definitions
  handlers_by_name
  schema_hash
```

- `ToolDefinition` 是可序列化、可展示、可 trace 的模型契约。
- `ToolRegistration` 是进程内执行绑定，不进入 provider payload。
- `ToolExposureSnapshot` 在每个 model step 开始时固定，确保模型看到的 schema、tool-call validation 和 handler routing 使用同一版本。

Codex 的 runtime/exposure registry、Kimi 的 handler/registration metadata 分离以及 Gemini 的 registration/active/model filtering 都支持这种三层边界。 [\[5\]][ref-5] [\[6\]][ref-6] [\[14\]][ref-14] [\[24\]][ref-24]

#### 第一版 metadata 不要过度设计

第一版建议只要求这些字段：

| Field | Purpose |
|---|---|
| `name` | 稳定、唯一、snake_case 的模型工具名 |
| `display_name` | TUI 中的用户可读名称 |
| `description` | 简短说明用途和不要使用的场景 |
| `input_schema` | provider-neutral JSON Schema |
| `effects` | `read_workspace`, `search_workspace`, `execute_process`, `read_network`, `interact_user`, `control_loop` |
| `exposure` | 第一版固定支持 `direct`、`hidden`；保留未来 `deferred` enum variant |
| `supports_parallel` | 是否允许 loop 并行执行多个 call |
| `limits` | timeout、max bytes、max lines、max matches 等 |
| `source` | 第一版只有 `builtin`；保留未来 `plugin`、`mcp` |
| `handler` | typed async executor |

不需要第一版就实现复杂 alias、版本协商、provider-specific description、动态 schema rewrite 或多级 namespace。Kimi 的完整 resource conflict 模型值得保留方向，但第一版可以先按 effect class 做保守并发：所有只读工具可并行；`run_command` 默认与其他 side-effecting call 冲突；未来 `apply_patch` 对同一 canonical file 串行。 [\[16\]][ref-16] [\[36\]][ref-36]

#### 统一 ToolResult

所有工具都返回同一个 envelope：

```text
success
should_continue
summary
content
error_kind?
display?
metadata?
```

建议 `metadata` 至少能记录：

- `truncated`
- `returned_bytes`
- `duration_ms`
- `canonical_paths`
- `policy_decision_id`
- `next_offset` 或 continuation cursor

Tool failure 通常应保持 `should_continue: true`，让模型可以修正路径、缩小查询或选择其他工具。`ask_user`、cancel、budget exhaustion、unrecoverable core error，以及宿主从无 tool-call 的最终 assistant response 推导出的内部完成动作会改变 loop control。

#### 推荐 canonical names

使用完整、动词优先、snake_case 名称：

```text
read_file
list_directory
glob_files
grep
run_command
fetch_web_url
ask_user
apply_patch       # 第二批
```

不要把 `read_file` 简化为 `read`，因为未来还会有 directory、attachment、session 或 artifact reads；不要把 `run_command` 命名为 `bash`，因为 KQode 必须在 Windows PowerShell、POSIX shell 和未来 sandbox backend 之间保持 provider-neutral contract；不要把 `fetch_web_url` 命名为 `web`，因为 URL fetch、web search 和 browser automation 是三种权限和执行模型。

### Suggested tool contracts

#### `read_file`

```text
input:
  path: string
  offset_line?: integer = 1
  limit_lines?: integer

content:
  path
  start_line
  end_line
  text
  total_lines?
  truncated
  next_offset_line?
```

边界：

- 相对 workspace root 解析。
- authorization 前 canonicalize/realpath。
- 阻止 traversal 和 symlink escape。
- 第一版仅文本；binary 返回 typed `unsupported_content`。
- 建议默认上限 2,000 行、50 KiB；这与 OpenCode 和 Pi 的成熟默认接近。 [\[9\]][ref-9] [\[33\]][ref-33] [\[34\]][ref-34]

#### `list_directory`

```text
input:
  path: string
  offset?: integer = 0
  limit?: integer

content:
  path
  entries[]:
    name
    relative_path
    kind: file | directory | symlink | other
  returned_count
  total_count?
  truncated
  next_offset?
```

第一版只枚举直接子项，不递归。精确递归统计和 tree preview 应另做后续能力，避免 `list_directory` 成为无界 repo dump。

#### `glob_files`

```text
input:
  pattern: string
  path?: string = "."
  limit?: integer

content:
  matches[]
  returned_count
  truncated
```

遵守 workspace roots 与统一 ignore service。结果使用 normalized relative paths，并设置明确的 match count/output-byte 上限。

#### `grep`

```text
input:
  query: string
  path?: string = "."
  glob?: string
  regex?: boolean = false
  case_sensitive?: boolean = false
  context_lines?: integer = 0
  limit?: integer

content:
  matches[]:
    path
    line
    column?
    preview
  returned_count
  truncated
```

不要在第一版加入过多 ripgrep flags。模型需要的是稳定搜索语义，不是另一个 shell command string。

#### `run_command`

```text
input:
  command: string
  cwd?: string = "."
  timeout_ms?: integer

content:
  exit_code?
  stdout
  stderr
  timed_out
  truncated
```

边界：

- selected workspace cwd。
- 明确 default timeout 和 hard maximum。
- environment scrubbing。
- stdout/stderr 分离并限制模型可见字节。
- 支持 cancellation。
- 第一版只做 one-shot non-interactive process。
- network/destructive command 由 policy classifier 决定 allow/ask/deny。
- 默认视为可能修改任意 workspace resource，不与其他 side-effecting tools 并行。

Codex、OpenCode、Kimi 和 Gemini 都提供比“直接调用系统 shell”更明确的 timeout、cwd、permission 或 output control；Pi 的无默认 timeout 是不建议复制的 outlier。 [\[2\]][ref-2] [\[8\]][ref-8] [\[13\]][ref-13] [\[22\]][ref-22]

#### `fetch_web_url`

```text
input:
  url: string
  format?: text | markdown = markdown
  max_bytes?: integer

content:
  final_url
  status
  content_type
  text
  truncated
  redirects
```

边界：

- 只允许 HTTP(S)。
- 使用 URL/host 作为独立 approval subject。
- DNS resolution 后阻止 loopback、private、link-local 和其他受限地址。
- 每次 redirect 重新校验 scheme、host 和 resolved address。
- 限制 redirect hops、connect/read timeout、streaming body bytes 和 model-context chars。
- 不携带宿主 credentials、cookies 或任意环境 proxy secrets。
- unsupported MIME type 返回 typed error。
- 不执行 JavaScript，不做 browser session，不接受自然语言 search query。

Kimi 提供最完整的 redirect、DNS 和 private-address baseline；Gemini 还展示 host rate limit 与 model-context 独立截断。 [\[20\]][ref-20] [\[21\]][ref-21] [\[29\]][ref-29]

#### `ask_user`

```text
input:
  question: string
  choices?: string[]
  allow_free_text?: boolean = true

content:
  answer
  selected_choice?
```

调用后当前 loop 暂停，`should_continue: false` 表示当前执行步结束，而不是任务失败。用户回复后生成新的 session event 并恢复下一 model step。

#### 内部完成动作（不是普通主 Agent tool）

普通对话中，当 provider response 没有 tool call、没有待处理输入且没有 continuation hook 时，KQode 应结束当前 turn，并把最后的 assistant text 包装为内部 `AgentAction::CompleteTask` 或等价状态转换。

内部结果至少区分：

```text
completed
partial
blocked
cancelled
budget_exceeded
failed
```

未来 bounded subagent 或严格 structured-output 模式可以额外暴露 model-facing `complete_task`，用于 schema-valid result submission；主 Agent 第一版不要求该工具。

### Risks and tradeoffs

- 将 glob、search 和 list 全部交给 shell 可以让 registry 更小，但会丢失统一 ignore、path policy、result limit 和结构化 trace。Codex 与 Pi 证明极小 surface 可行，OpenCode、Kimi 和 Gemini 则说明 dedicated discovery tools 是更常见、更安全的模型接口。 [\[1\]][ref-1] [\[8\]][ref-8] [\[13\]][ref-13] [\[22\]][ref-22] [\[31\]][ref-31]
- `fetch_web_url` 是 read-only effect，但不是低风险操作。SSRF、redirect、DNS rebinding、large body 和 secret-bearing request 都要求它拥有独立 policy 和 network implementation。 [\[20\]][ref-20] [\[21\]][ref-21] [\[29\]][ref-29]
- 同时暴露 `write_file`、`edit_file` 和 `apply_patch` 会增加 schema token、工具选择歧义和写权限面。第一批 mutation 只选 `apply_patch`，再通过真实 eval 决定是否补 whole-file write。
- 过早实现 deferred discovery 会让“为什么工具没出现”更难调试。等 builtin + plugin + MCP 的直接 schema 明显超过预算后，再加入 `deferred` 和 `tool_search`。

### Evaluation ideas

- Registry golden: 固定 7 个 enabled tools，断言名称顺序、input schema 和 schema hash。
- Visibility: hidden tool 不进入 provider payload，也不能被 tool-call router 执行。
- Duplicate name: builtin 重名注册必须失败；未来 plugin/MCP 必须使用 namespace 或明确 collision policy。
- Read containment: `..`、absolute external path 和 symlink escape 被拒绝。
- Read truncation: 超过行数和字节上限时返回 continuation metadata。
- Search limits: 大量 matches 必须返回 `truncated: true`，不能把 returned count 当 total count。
- Command timeout: 超时、cancel、非零 exit code 和 output truncation 都产生不同 typed result。
- Network safety: literal private IP、localhost、DNS-to-private 和 redirect-to-private 全部被拒绝。
- Loop control: `ask_user` 暂停并可恢复；无 tool-call 的最终 assistant response 结束 turn，并产生内部完成事件。
- Step consistency: 同一 step 中 provider schema、validation 和 routing 使用相同 snapshot；下一 step 才接受 registry 更新。
- Patch readiness gate: 在 VFS/diff/conflict/approval tests 完成前，`apply_patch` 保持 hidden 或未注册。

---

## Evidence Gaps

- Codex CLI: 未找到 standard core `read_file` 或 arbitrary URL fetch；观察结果限于 pinned commit 的普通 core registry。
- OpenCode: `webfetch` 的 lower-level HTTP protections 未完全追踪，因此不把其已观察边界单独作为 KQode SSRF baseline。
- Gemini CLI: prompt-based web fetch 与 direct URL fetch 共存；KQode 第一版只采用 direct known-URL 语义。
- Pi Coding Agent: core registry 没有与 Kimi/Gemini 同等明确的 risk/effect metadata，permission 行为可能由 extension 或外围 runtime 补充。
- 所有实现的工具集合都可能受 provider、model、feature、plugin、MCP 或用户配置影响；“默认”指 pinned commit 中观察到的正常 registration/activation path。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: normal sessions register shell, MCP-resource, utility, and collaboration sources ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/spec_plan.rs#L974-L1037)).
- <a id="ref-2"></a>[2] Codex CLI: `exec_command` and `write_stdin` schemas include cwd, timing, PTY, approval, and output limits ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/handlers/shell_spec.rs#L24-L163)).
- <a id="ref-3"></a>[3] Codex CLI: grammar-constrained `apply_patch` specification ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/handlers/apply_patch_spec.rs#L1-L27)).
- <a id="ref-4"></a>[4] Codex CLI: apply-patch sandbox verification and narrowly scoped write permissions ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/handlers/apply_patch.rs#L238-L277)).
- <a id="ref-5"></a>[5] Codex CLI: direct, deferred, model-only, code-mode-only, and hidden exposure states ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tools/src/tool_executor.rs#L49-L88)).
- <a id="ref-6"></a>[6] Codex CLI: typed runtime metadata and registry registration structure ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/registry.rs#L49-L87)).
- <a id="ref-7"></a>[7] Codex CLI: hosted web-search modes and external access semantics ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/core/src/tools/hosted_spec.rs#L8-L45)).
- <a id="ref-8"></a>[8] OpenCode: built-in registry and model/provider/feature filtering ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/tool/registry.ts#L209-L329)).
- <a id="ref-9"></a>[9] OpenCode: `read` input schema and line/byte limits ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/tool/read.ts#L13-L37)).
- <a id="ref-10"></a>[10] OpenCode: read path resolution, external-directory authorization, and directory pagination ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/tool/read.ts#L231-L347)).
- <a id="ref-11"></a>[11] OpenCode: `webfetch` scheme, permission, timeout, response-size, and format behavior ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/tool/webfetch.ts#L8-L126)).
- <a id="ref-12"></a>[12] OpenCode: tool definition, schema validation, handler, result envelope, telemetry, and truncation metadata ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/tool/tool.ts#L33-L151)).
- <a id="ref-13"></a>[13] Kimi Code CLI: default, coder, and explore profile tool inventories ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/session/agentLifecycle/profile/profiles.ts#L10-L114)).
- <a id="ref-14"></a>[14] Kimi Code CLI: registry contract with registration options and name resolution ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/toolRegistry/toolRegistry.ts#L1-L29)).
- <a id="ref-15"></a>[15] Kimi Code CLI: result envelope, execution contract, approval, source, and disclosure metadata ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/tool/toolContract.ts#L6-L108)).
- <a id="ref-16"></a>[16] Kimi Code CLI: explicit resource-access and conflict model ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/tool/toolContract.ts#L125-L185)).
- <a id="ref-17"></a>[17] Kimi Code CLI: read limits and path input schema ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/os/read/read.ts#L1-L43)).
- <a id="ref-18"></a>[18] Kimi Code CLI: workspace-aware read resolution and declared read access ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/os/read/readTool.ts#L229-L267)).
- <a id="ref-19"></a>[19] Kimi Code CLI: `FetchURL` schema, URL approval rule, and registration ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/tools/fetch-url/fetchUrlTool.ts#L1-L79)).
- <a id="ref-20"></a>[20] Kimi Code CLI: URL body/redirect limits and redirect validation ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/app/web/providers/local-fetch-url.ts#L20-L145)).
- <a id="ref-21"></a>[21] Kimi Code CLI: HTTP(S)-only and private/localhost/DNS-address blocking ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/app/web/providers/local-fetch-url.ts#L235-L280)).
- <a id="ref-22"></a>[22] Gemini CLI: default-enabled registration of filesystem, shell, web, interaction, planning, and agent tools ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/config/config.ts#L3938-L4085)).
- <a id="ref-23"></a>[23] Gemini CLI: canonical model-facing tool names ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/definitions/base-declarations.ts#L20-L85)).
- <a id="ref-24"></a>[24] Gemini CLI: active/main-agent/model filtering and plan-mode schema adaptation ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/tool-registry.ts#L641-L735)).
- <a id="ref-25"></a>[25] Gemini CLI: `read_file` realpath/path-policy validation, ignore filtering, and ranges ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/read-file.ts#L230-L327)).
- <a id="ref-26"></a>[26] Gemini CLI: default read-only allowlist ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/policy/policies/read-only.toml#L30-L57)).
- <a id="ref-27"></a>[27] Gemini CLI: write, shell, and web-fetch permission rules ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/policy/policies/write.toml#L30-L105)).
- <a id="ref-28"></a>[28] Gemini CLI: direct versus prompt-based `web_fetch` schema and validation ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/web-fetch.ts#L895-L988)).
- <a id="ref-29"></a>[29] Gemini CLI: fetch timeout, body/context limits, host rate limit, and private-host blocking ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/web-fetch.ts#L270-L375)).
- <a id="ref-30"></a>[30] Pi Coding Agent: default four tools and allowlist/denylist behavior ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/sdk.ts#L55-L76)).
- <a id="ref-31"></a>[31] Pi Coding Agent: complete built-in inventory, coding set, and read-only set ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/index.ts#L76-L223)).
- <a id="ref-32"></a>[32] Pi Coding Agent: tool-definition metadata and extension source metadata ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/extensions/types.ts#L448-L466)).
- <a id="ref-33"></a>[33] Pi Coding Agent: read schema, path resolution, and truncation behavior ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/read.ts#L1-L175)).
- <a id="ref-34"></a>[34] Pi Coding Agent: shared 2,000-line/50-KiB output limits ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/truncate.ts#L9-L82)).
- <a id="ref-35"></a>[35] Pi Coding Agent: exact multi-replacement edit and diff/patch result ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/edit.ts#L18-L226)).
- <a id="ref-36"></a>[36] Pi Coding Agent: per-file mutation serialization with cross-file concurrency ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L1-L52)).
- <a id="ref-37"></a>[37] DeepSeek Harness: filesystem package registers model-facing read, write, edit, and conditional image-read tools ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/fs/tool-fs/src/index.ts#L1-L73)).
- <a id="ref-38"></a>[38] DeepSeek Harness: filesystem-search package registers bounded glob and grep tools backed by packaged ripgrep ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/fs/tool-fs-search/src/index.ts#L1-L122)).
- <a id="ref-39"></a>[39] DeepSeek Harness: bash tool exposes workdir, timeout, background, sandbox, and structured process outcomes ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/shell/tool-bash/src/index.ts#L1-L80)).
- <a id="ref-40"></a>[40] DeepSeek Harness: web package registers independently configurable `web_search` and `web_fetch` tools with limits ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/web/tool-web/src/index.ts#L1-L96)).
- <a id="ref-41"></a>[41] DeepSeek Harness: model-facing `ask_user_question` pauses on the user-question capability and returns structured answers ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/interaction/tool-ask-user/src/index.ts#L1-L92)).

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
