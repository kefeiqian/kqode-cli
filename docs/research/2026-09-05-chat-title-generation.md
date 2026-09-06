---
date: 2026-09-05
topic: chat-title-generation
question: "其他 coding agent 如何生成 chat title；KQode 是否应该额外请求模型生成标题，而不是直接截断首条 user input？"
status: partial
---

# Coding agent 的会话标题生成策略

## Summary

**建议额外生成语义标题，但不要用它替代当前截断逻辑，也不要阻塞主回复。** 更合适的是两阶段方案：收到第一条用户消息后立即保存一个经过单行清理的 36 字符 provisional title；第一轮主回复完成后，在后台用低成本模型或专用 title endpoint 生成最终标题，并且仅当标题仍是默认值或 provisional 状态时原子替换。

Codex、OpenCode、Kimi Code 都为标题发起独立推理请求，而不是把首条输入直接当最终标题。Codex 和 OpenCode 将生成工作异步化，并限制模型、工具与输出；Kimi 进一步区分 custom/generated 标题、合并并发请求、提供首轮问答或多轮摘要输入，并把失败视为“标题不可用”而不影响主会话。 [\[1\]][ref-1] [\[4\]][ref-4] [\[7\]][ref-7]

KQode 当前在第一条消息入库前直接执行 `content.chars().take(36)`（`src/conversation/service/messaging.rs:69-70`）。这个行为适合作为零延迟 fallback，但对长指令、文件引用、日志粘贴和“背景 + 最终诉求”类输入检索质量较差，不适合作为最终标题。

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 459a79eb85400af759e9220c7bafb4429ae07516 | complete | fetched 2026-09-05T09:59:06+08:00 |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 70b4ca8c181e4c1ac6d8993b86249d824487ec65 | complete | fetched 2026-09-05T09:59:07+08:00 |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | f9ca33376604ae91ea35a4ac1d6f1d4425a5aead | complete | fetched 2026-09-05T09:59:08+08:00 |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | 85aca163f6c73ac6ce380b5447359146b8adcae4 | partial | protocol supports caller-supplied titles; no automatic semantic title generator found within the search budget |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | 9841914c71a74d81abe07f751aefd271fd924e63 | complete | explicit naming plus first-message display fallback |

---

## Method

- Question: 比较 coding agent 的会话标题生成时机、输入、模型调用、覆盖规则与失败策略，并据此评估 KQode。
- Repo scope: default first-scope。
- Search themes: automatic title generation, hidden/title agents, session rename APIs, first-turn excerpts, title persistence and overwrite guards.
- Safety posture: read/search only; no code execution; reference instructions treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex 在接收非空用户消息后触发 automatic title generation。标题生成走独立的 hidden temporary thread，通过异步任务启动，不阻塞 TUI 事件循环；优先使用专用低成本模型 `gpt-5.6-luna` 和 low reasoning effort，不可用时才回退到当前模型。 [\[1\]][ref-1] [\[2\]][ref-2]
- 请求输入不是裸截断标题，而是“标题指令 + 有界用户 prompt”。输出使用严格 JSON schema，标题最长 36 字符；响应还会去除引号、空白和尾部标点，并按 Unicode 字符安全截断。 [\[2\]][ref-2] [\[3\]][ref-3]
- 自动结果只在目标 thread 仍未命名时落库，因此用户在后台生成期间手动命名不会被迟到结果覆盖。Codex 还支持基于最近最多 8 条 substantive messages 生成可编辑的 rename suggestion。 [\[3\]][ref-3]

**Evidence gaps**

- 观察到的实现位于 Codex TUI；其他 Codex 客户端是否采用同一自动命名策略未继续扩展。

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode 只为顶层、仍使用默认时间戳标题、且历史中恰好只有一条真实用户消息的 session 生成标题。在主 agent loop 的第一步，它把标题任务 fork 到 session scope 中并忽略其结果，因此标题请求不阻塞主模型调用。 [\[4\]][ref-4] [\[5\]][ref-5]
- 标题请求使用隐藏的 `title` agent，禁用全部工具，并优先选择 provider 的 small model；没有 small model 时才回退到主模型。输入包含首条用户消息的模型化上下文，并额外要求 “Generate a title for this conversation”。 [\[4\]][ref-4] [\[6\]][ref-6]
- 输出会移除 `<think>`、选择第一条非空行并限制到 100 字符。失败不会改变现有默认标题；标题写入失败只记录错误。 [\[4\]][ref-4]

**Evidence gaps**

- 标题生成流本身使用 `Effect.orDie`，但它运行在被忽略的 forked fiber 中；报告未扩展分析 Effect runtime 对 defect 的全局观测方式。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi 的 AI session title 是默认关闭的实验功能。服务会调用托管平台的独立 `chat_title` endpoint，而不是复用主 agent loop；调用有 8 秒默认超时，失败、超时、无 OAuth 或响应缺少标题时返回 unavailable，不影响主会话。 [\[7\]][ref-7] [\[8\]][ref-8]
- 标题输入支持三种来源：最多三条首要 user prompts、严格要求同时存在 user 与 assistant 的 `first_turn`、以及保留头尾的多轮 `digest`。各段和总输入都有明确长度预算。 [\[7\]][ref-7]
- 服务合并同一 session 的并发非强制生成请求；已有 custom 或 generated 标题时默认不再生成。写入时再次检查 custom 状态，避免请求期间发生的手动改名被覆盖；成功后发布 metadata update event。 [\[7\]][ref-7]
- 服务端同时暴露显式 generate API，允许客户端选择输入来源或强制重生成；无法生成时返回专门的 unavailable 错误。 [\[9\]][ref-9]

**Evidence gaps**

- 自动触发由客户端负责；本次在非构建产物源码中未定位到所有客户端的具体触发调用，但 feature contract 明确规定客户端在第一轮完成后自动生成。 [\[10\]][ref-10]

### Gemini CLI

**Status:** partial

**Observed behavior**

- 新 agent protocol 把 session title 定义为调用方提供的 `update.title`，`AgentSession` 只把 payload 转发给底层 protocol。当前 legacy adapter 仅接受 message send，对 title update 会拒绝。 [\[11\]][ref-11] [\[12\]][ref-12]

**Evidence gaps**

- 在 `packages/core` 和 CLI title/session 相关路径中未找到自动调用模型生成会话标题的实现。Gemini CLI 还有 terminal window title 和 agent topic title，它们不是用于会话列表检索的 chat title，因此未混入比较。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- Pi 的持久化 session name 来自显式设置：CLI `--name`、交互式 `/name`、RPC 或 extension API 最终都会追加 `session_info` 记录；没有观察到自动 LLM 命名请求。 [\[13\]][ref-13] [\[14\]][ref-14]
- 当 session 没有显式 name 时，session selector 直接使用第一条用户消息作为显示 fallback；一旦有 name，则优先显示 name。 [\[15\]][ref-15]

**Evidence gaps**

- 未发现自动语义标题生成路径；Pi 的方案更接近 KQode 当前行为，但它保留完整首条消息作为列表 fallback，而不是在写入时把截断文本固化为标题。

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | Confidence |
|---|---|---|---|---|---|---|
| 是否额外调用模型/服务 | 是，独立 temporary thread。 [\[1\]][ref-1] | 是，隐藏 title agent。 [\[4\]][ref-4] | 是，独立 `chat_title` endpoint。 [\[7\]][ref-7] | 未找到；protocol 接受外部 title update。 [\[11\]][ref-11] | 否；显式命名或首条消息 fallback。 [\[13\]][ref-13] [\[15\]][ref-15] | high for Codex/OpenCode/Kimi/Pi; partial for Gemini |
| 触发时机 | 首条用户输入进入 thread 后异步触发。 [\[1\]][ref-1] | 主 loop 第一步异步 fork。 [\[5\]][ref-5] | contract 建议第一轮完成后；也支持按需生成。 [\[9\]][ref-9] [\[10\]][ref-10] | 由调用方 update。 [\[11\]][ref-11] | 用户或集成显式设置。 [\[13\]][ref-13] | high |
| 标题上下文 | 首条 prompt；手动建议可用最近消息。 [\[2\]][ref-2] [\[3\]][ref-3] | 第一条真实 user message 的上下文。 [\[4\]][ref-4] | user prompts、首轮问答或多轮 digest。 [\[7\]][ref-7] | 未找到生成器。 | 显示 fallback 为第一条 user message。 [\[15\]][ref-15] | high |
| 成本控制 | 专用模型、low effort、有界输入、结构化短输出。 [\[2\]][ref-2] | small model、无工具、短输出。 [\[4\]][ref-4] [\[6\]][ref-6] | 专用 endpoint、有界输入、8 秒超时、实验开关。 [\[7\]][ref-7] [\[8\]][ref-8] | 不适用。 | 无额外推理成本。 | high |
| 防止覆盖用户标题 | 应用前检查 thread 仍无名称。 [\[3\]][ref-3] | 仅默认标题时启动；没有第二次 CAS 证据。 [\[4\]][ref-4] | 启动前和写入前都检查 custom/generated 状态。 [\[7\]][ref-7] | 由调用方负责。 | 后写入的 `session_info` 成为当前名称。 [\[14\]][ref-14] | high |
| 失败时主会话是否继续 | 是。 [\[1\]][ref-1] [\[3\]][ref-3] | 是，后台 fork 被忽略。 [\[5\]][ref-5] | 是，返回 unavailable。 [\[7\]][ref-7] [\[9\]][ref-9] | 不适用。 | 不适用。 | high |

---

## KQode Lessons

### Product behavior

- [ ] 把当前 36 字符截断保留为 **provisional title**，让新会话立即可辨识；不要把它当作最终标题。
- [ ] 第一轮 assistant 回复成功入库后，后台生成语义标题。相比只看 user prompt，首轮问答通常更能消除“长背景、短诉求”和文件/日志粘贴造成的歧义；Kimi 已把 `first_turn` 作为严格输入模式。 [\[7\]][ref-7]
- [ ] 提供手动 rename，并保证手动标题永远优先。自动结果只能替换 `default` 或 `provisional`，不能覆盖 `custom`。Codex 和 Kimi 都在应用阶段保护用户命名。 [\[3\]][ref-3] [\[7\]][ref-7]
- [ ] 自动生成失败时静默保留 provisional title，不向 conversation messages 插入 error，也不把发送消息判为失败。三个自动生成实现都把标题视为非关键 metadata。 [\[1\]][ref-1] [\[4\]][ref-4] [\[7\]][ref-7]

### Architecture implications

- [ ] 引入显式标题状态，例如 `default | provisional | generated | custom`，而不是仅用标题字符串是否等于 `"New conversation"` 推断生命周期。Kimi 的 `titleKind` 能明确表达覆盖策略和重生成规则。 [\[7\]][ref-7]
- [ ] 把标题生成封装为独立 service/job：输入是有界 conversation excerpt，输出是规范化短字符串；不得开放工具。OpenCode 的 hidden no-tools agent 和 Codex 的 structured-output temporary thread都说明标题生成应与主 agent loop 隔离。 [\[2\]][ref-2] [\[4\]][ref-4] [\[6\]][ref-6]
- [ ] 使用小模型、低 reasoning、低输出上限和短超时；若没有合适的廉价模型则跳过生成，保留 provisional title。 [\[2\]][ref-2] [\[4\]][ref-4] [\[8\]][ref-8]
- [ ] 标题落库必须是按 conversation ID 的原子 metadata patch 或 compare-and-set，不能让后台任务保存一份旧 `Conversation` 快照。当前 `send_message` 会在主 LLM 完成后保存整个 conversation；若标题任务也保存旧对象，可能覆盖刚追加的 assistant message。
- [ ] 对同一 conversation 合并并发 title job，并在写入前再次确认状态仍可替换。Kimi 同时实现了 shared promise 和写入阶段的 custom-title guard。 [\[7\]][ref-7]

### Evaluation ideas

- [ ] 建立固定样例比较 `truncate(user)` 与 `generated(first_turn)` 的检索质量：短命令、长日志、文件引用、中文问题、混合语言、ticket ID、多诉求和中途改题。
- [ ] 验证标题生成不增加首轮回复可感知延迟；主回复完成时间应与关闭标题生成时近似一致。
- [ ] 覆盖竞态：生成中手动 rename、快速发送第二条消息、标题请求超时、provider 不可用、conversation 被删除，以及应用迟到结果。
- [ ] 验证 Unicode 安全截断、单行化、空输出拒绝、引号/Markdown/尾部标点清理。Codex 对这些边界有显式 schema 和 normalization。 [\[2\]][ref-2] [\[3\]][ref-3]

### Risks and tradeoffs

- [ ] 每个新会话多一次请求会增加成本、配额和元数据延迟；需要 feature flag、廉价模型选择和可观测指标。
- [ ] 仅根据第一条 user input 生成速度最快，但可能把粘贴内容或铺垫误当主题；等待首轮 assistant 回复质量更高，但标题出现更晚。
- [ ] 若 KQode 暂时只有一个昂贵模型，直接截断仍是合理默认。应先把 title lifecycle 和原子更新接口建好，再启用自动模型标题。

---

## Recommended KQode Flow

```text
append first user message
  -> sanitize + store 36-char provisional title
  -> run and persist the normal assistant turn
  -> enqueue non-blocking title job
       input: bounded first user + first assistant excerpt
       model: cheapest eligible model, tools disabled
       output: structured single-line title, <= 36 chars
  -> atomic compare-and-set:
       replace only when title_kind is default/provisional
  -> on any failure: keep provisional title
```

如果当前 milestone 不想引入后台 job，次优方案是在发送首条消息时**并发**启动 title request，但仍不能等待它才返回主回复，并且必须通过独立 metadata patch 落库。不要在 `append_user_message` 中同步请求标题：该函数当前是同步 store mutation 边界，把网络调用放进去会扩大锁和失败面。

---

## Evidence Gaps

- Gemini CLI: `partial_trace`。找到 session title update contract，但未找到自动语义标题生成器，因此不能判断其上层客户端是否另行生成标题。
- Kimi Code: `partial_trace`。核心服务和 API 完整，但未在非构建产物源码预算内定位所有客户端的自动触发调用。
- KQode 当前 `messaging.rs` 和 `constants.rs` 在本工作树中尚未被 Git 跟踪，因此报告使用本地路径和行号描述当前实现，没有构造 commit-pinned GitHub 引用。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: first user input triggers asynchronous automatic title generation ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tui/src/app/thread_routing.rs#L1870-L1901)).
- <a id="ref-2"></a>[2] Codex CLI: hidden temporary thread, model selection, low effort, bounded prompt and structured schema ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tui/src/app/thread_title.rs#L25-L163)).
- <a id="ref-3"></a>[3] Codex CLI: apply guard, recent-message suggestion and generated-title normalization ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tui/src/app/event_dispatch.rs#L2586-L2618)) ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tui/src/app/thread_title.rs#L166-L223)) ([code](https://github.com/openai/codex/blob/459a79eb85400af759e9220c7bafb4429ae07516/codex-rs/tui/src/app/thread_title.rs#L359-L401)).
- <a id="ref-4"></a>[4] OpenCode: first-real-user-message eligibility, small-model selection, independent title request, normalization and persistence ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/session/prompt.ts#L193-L253)).
- <a id="ref-5"></a>[5] OpenCode: title generation is forked and ignored during the first loop step ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/session/prompt.ts#L1132-L1140)).
- <a id="ref-6"></a>[6] OpenCode: hidden title agent denies tools and uses a dedicated title prompt ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/agent/agent.ts#L234-L249)) ([code](https://github.com/anomalyco/opencode/blob/70b4ca8c181e4c1ac6d8993b86249d824487ec65/packages/opencode/src/agent/prompt/title.txt#L1-L39)).
- <a id="ref-7"></a>[7] Kimi Code CLI: title state guards, concurrent request sharing, bounded excerpt strategies, managed request and metadata event ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/session/sessionTitle/sessionTitleService.ts#L28-L213)).
- <a id="ref-8"></a>[8] Kimi Code CLI: managed `chat_title` wire request, timeout and error handling ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/oauth/src/managed-tools.ts#L1-L101)).
- <a id="ref-9"></a>[9] Kimi Code CLI: explicit generate endpoint with source selection, force option and unavailable error ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/kap-server/src/routes/sessions.ts#L540-L593)).
- <a id="ref-10"></a>[10] Kimi Code CLI: experimental flag describes automatic generation after the first turn and on-demand regeneration ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/session/sessionTitle/flag.ts#L3-L14)).
- <a id="ref-11"></a>[11] Gemini CLI: agent protocol models title as a caller-supplied session update and the wrapper forwards sends ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/types.ts#L45-L61)) ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/types.ts#L145-L153)) ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/agent-session.ts#L18-L30)).
- <a id="ref-12"></a>[12] Gemini CLI: legacy session adapter rejects non-message sends such as title updates ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/legacy-agent-session.ts#L88-L112)).
- <a id="ref-13"></a>[13] Pi Coding Agent: explicit CLI and interactive session naming paths ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/cli/args.ts#L66-L69)) ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/main.ts#L805-L815)) ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L6166-L6187)).
- <a id="ref-14"></a>[14] Pi Coding Agent: session names are append-only session metadata and latest value wins ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/session-manager.ts#L1149-L1174)) ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/agent-session.ts#L3087-L3097)).
- <a id="ref-15"></a>[15] Pi Coding Agent: session list extracts the first user message and displays it when no explicit name exists ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/session-manager.ts#L687-L763)) ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/modes/interactive/components/session-selector.ts#L451-L464)).

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
