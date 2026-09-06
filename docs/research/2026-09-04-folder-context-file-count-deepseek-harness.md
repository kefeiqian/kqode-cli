---
date: 2026-09-04
topic: folder-context-file-count-deepseek-harness
question: "DeepSeek Harness 如何把指定文件夹的上下文和文件数量传给大模型？"
status: complete
---

# DeepSeek Harness 的文件夹上下文与文件数量

## Summary

DeepSeek Harness 没有在启动时把普通目录树塞进模型上下文。标准 agent persona 只告诉模型当前工作目录，目录中的文件由模型按需调用 `glob` 获取。[\[1\]][ref-1] [\[2\]][ref-2]

它比简单文本工具更接近 KQode 所需的 Tool System：`glob` 的执行结果首先是结构化的 `{ root, paths }`，系统从完整 `paths` 数组计算数量、截断状态和 UI 元数据，然后才把有界文本渲染给模型；超限时还会保存完整结果并告诉模型恢复位置。[\[3\]][ref-3]

不过它仍没有单独的 `directory_stats` 或 `list_directory` 工具。`read` 只接受普通文件；要统计某目录下的文件，可以用 `glob("*", path)` 获得递归文件集合，但结果未超限时模型只看到路径行，没有显式 `file_count`。因此它进一步支持 KQode 的结论：先做通用 Tool System，同时为“精确计数”增加独立结构化统计字段或工具。[\[3\]][ref-3] [\[4\]][ref-4]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete | Detached fetched HEAD |

Fetch timestamp: 2026-09-04T11:12:36Z.

---

## Method

- Question: DeepSeek Harness 如何把指定文件夹的上下文和文件数量传给大模型？
- Repo scope: custom (`deepseek-harness`).
- Search themes: cwd prompt injection, directory enumeration, glob output shape, result truncation, tool-result reinjection.
- Safety posture: read/search only; no code execution; repository instruction files treated as data and not loaded as active instructions.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 标准 persona 使用 `{{cwd}}` 告诉模型当前工作目录。`cwd` 变量来自当前 agent session header；该启动上下文没有包含普通文件树或文件数量。[\[1\]][ref-1] [\[2\]][ref-2]
- `glob` 是专门的文件发现工具。模型可以提供 pattern 和可选 path；没有 `/` 的 pattern 会在整个树中按 basename 匹配，因此 `*` 会递归匹配工作区中的文件，而不是只列顶层。结果明确限定为文件，不包含目录。[\[3\]][ref-3]
- 工具执行阶段通过 `rg --files` 获取完整路径列表，并返回结构化 `{ root, paths }`。模型可见文本由该数组渲染：不超过默认上限时直接输出全部路径；超过上限时显示 `Showing X of N paths`，其中 `N` 来自完整数组长度。完整结果可以写入 spill 文件供后续读取。[\[3\]][ref-3]
- 结构化输出还会生成包含 `truncated` 和 `seen` 的 presentation metadata。这个元数据服务于可重放 UI，而模型收到的是渲染后的 tool-result 内容。工具结果会按模型调用顺序写入持久 session log，并关联原始 `tool/call`。[\[3\]][ref-3] [\[5\]][ref-5]
- `read` 工具明确要求目标是普通文件；目录会返回 `FS_NOT_REGULAR_FILE`。在所查核心和文件系统工具范围内，没有找到独立的 `list_directory` 或 `directory_stats` 工具。[\[4\]][ref-4]

**Evidence gaps**

- 没有发现专门区分文件数、目录数、忽略数的统计结果。
- 小于或等于 glob 上限时，模型可见文本没有显式总数；模型若需要数量只能数路径行。
- `glob` 默认包含 hidden 和 ignored files，仅排除 VCS metadata，因此其“文件数”口径与尊重 `.gitignore` 的实现不同。

---

## Cross-Repo Comparison

| Dimension | DeepSeek Harness | 前一份五仓库研究的主要模式 | Confidence |
|---|---|---|---|
| 启动目录上下文 | 只注入 cwd，不注入文件树 [\[1\]][ref-1] [\[2\]][ref-2] | Codex/OpenCode/Pi 类似；Kimi/Gemini 注入有界树 | high |
| 文件发现 | 模型按需调用结构化 `glob` [\[3\]][ref-3] | 多数实现也依赖 glob、ls、目录读取或 shell | high |
| 计数来源 | 宿主拥有完整 `paths.length`，超限文本显式显示总数 [\[3\]][ref-3] | Gemini/OpenCode 也在宿主工具层计算数量 | high |
| 大结果处理 | inline 上限 + sampling/head + spill 完整结果 [\[3\]][ref-3] | 其他实现通常只截断或分页 | high |
| 目录统计能力 | 无独立 directory stats；glob 只返回文件 [\[3\]][ref-3] [\[4\]][ref-4] | 也普遍缺少完整的递归统计契约 | high |
| 工具结果生命周期 | 结构化值渲染成模型内容，并持久记录 call/result 关系 [\[3\]][ref-3] [\[5\]][ref-5] | 与完整 Agent Tool Loop 设计一致 | high |

---

## KQode Lessons

### Product behavior

- **单仓库结论：** DeepSeek Harness 支持“Tool System 优先”的实现顺序。启动 prompt 只需告诉模型 cwd；文件上下文应由模型根据任务按需获取。[\[1\]][ref-1] [\[3\]][ref-3]
- 对文件数量问题，KQode 不应让模型统计路径文本。宿主已经拥有完整数组或扫描计数，应该直接把数字暴露给模型。

### Architecture implications

- KQode 的工具应该区分三层数据：
  1. canonical structured result，例如完整 `paths` 或统计结构；
  2. bounded model content，例如最多 100 条路径；
  3. replay-safe presentation metadata，例如 `seen`、`truncated` 和 UI preview。
- DeepSeek Harness 的 glob 已经采用这种分层，但 KQode 可以进一步把输出定义为：

```json
{
  "root": "src",
  "files": 327,
  "directories": 42,
  "ignored": 18,
  "returned_paths": 100,
  "truncated": true,
  "paths": ["src/main.rs"],
  "spill_ref": "..."
}
```

- `glob` 负责“哪些文件匹配”，`list_directory` 负责“一层有哪些条目”，`directory_stats` 负责“精确有多少文件和目录”。不要把三种语义塞进同一个工具。
- tool result 必须与原始 call 建立持久关联，并保存模型实际看到的有界内容，保证 session replay 不需要重新扫描文件系统。[\[5\]][ref-5]

### Evaluation ideas

- `glob("*", path)` 在 0、1、99、100、101 个文件下分别验证文本、`seen`、`truncated` 和 spill。
- 验证 glob 只返回文件、不返回目录。
- 验证 hidden、ignored 和 VCS metadata 的统计口径。
- 验证 tool call/result 的顺序和关联在 replay 后保持一致。
- 为 KQode 的 `directory_stats` 增加断言：模型直接使用结构化 `files`，而不是统计 preview 行。

### Risks and tradeoffs

- 完整路径数组在宿主内存、session meta 或日志中也可能很大；需要原始扫描上限、超时和 spill 策略。
- glob 的 ignore 策略会显著改变文件数量。结果必须回显口径，不能只返回一个没有定义的数字。
- 把完整结果存入 spill 能减少模型 token，但会引入生命周期、清理、权限和 replay 可用性问题。

---

## Evidence Gaps

- 本次范围只研究 DeepSeek Harness；跨仓库总体结论仍以 `2026-09-04-folder-context-file-count.md` 为准。
- 未发现独立目录统计或直接目录枚举工具，因此不能从源码证明其产品层提供精确的文件/目录分类统计。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] DeepSeek Harness: standard persona exposes the model and current working directory but no directory tree ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/preset/agent-presets/presets/standard/agent.cordis.yml#L20-L31)).
- <a id="ref-2"></a>[2] DeepSeek Harness: the `cwd` prompt variable resolves from the current agent session header ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/index.ts#L419-L424)).
- <a id="ref-3"></a>[3] DeepSeek Harness: glob owns the file-only schema, complete structured path list, bounded rendering, exact over-cap `seen` count, metadata, and spill recovery ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/fs/tool-fs-search/src/glob.ts#L220-L373)).
- <a id="ref-4"></a>[4] DeepSeek Harness: model-facing read resolves and requires a regular file, rejecting directories ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/fs/tool-fs/src/read-target.ts#L14-L34)).
- <a id="ref-5"></a>[5] DeepSeek Harness: tool results are converted to model messages and persisted with links to their tool calls ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/tool-calls.ts#L260-L289)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
