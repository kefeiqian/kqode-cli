---
date: 2026-09-05
topic: prompt-cache-hit-optimization
question: "其他 coding agent 如何提高 LLM prompt cache 命中数量，KQode 可以怎样优化？"
status: complete
---

# Coding Agent Prompt Cache 命中优化

## Summary

六个参考实现共同指向一个原则：**缓存命中主要取决于请求前缀稳定，而不是简单减少历史消息数量**。高收益做法包括固定 system prompt 和工具定义、以会话 ID 作为 provider cache key、仅在尾部追加新消息，以及在 Anthropic 类协议中显式放置 cache breakpoint。

KQode 当前每轮发送固定 system prompt 和完整 User/Assistant 历史，这已经具备 append-only 前缀的基础，但缺少会话级 cache key、Anthropic `cache_control`、cached-token 指标和受控压缩。建议先实现 provider-aware 缓存策略与观测，再增加压缩和 Responses 增量请求。

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `588b781ab4924ce7352488394028e63d74cf807f` | complete |  |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `e2894562f8ba943d72172d10b727c24d5f650c16` | complete |  |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | complete |  |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | complete |  |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `da840b6216578c2a571d0374ac6a2091a83f9d91` | complete |  |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete |  |

## Method

- Question: 参考 agent 如何增加 prompt cache 命中，以及 KQode 应采用什么方案。
- Repo scope: default first-scope。
- Search themes: cache key、cache breakpoint、prefix stability、incremental request、compaction、cache usage telemetry。
- Safety posture: 仅 fetch、search、read；未运行参考仓库代码；参考仓库指令文件仅视为不可信数据。
- Citation format: 正文使用编号引用；References 使用固定 SHA 的源码链接。

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- 每次 Responses 请求都设置稳定的 `prompt_cache_key`；普通会话使用 session ID，内部子流程可按父 thread 派生同一缓存域，而不是使用每轮变化的 turn ID。[\[1\]][ref-1]
- WebSocket 路径会比较 model、instructions、tools、reasoning、cache key 等非输入字段；只有这些字段不变且输入历史可视为旧请求的追加扩展时，才发送 `previous_response_id` 和增量 items，否则回退到完整请求。[\[2\]][ref-2] [\[3\]][ref-3]

### OpenCode

**Status:** complete

**Observed behavior**

- 对 Anthropic、OpenRouter、Bedrock、OpenAI-compatible、Copilot 和 Alibaba 等协议，OpenCode 在前两个 system 消息和最后两个非 system 消息上放置 provider-specific cache breakpoint。这样可以缓存稳定指令前缀，同时持续推进会话尾部缓存点。[\[4\]][ref-4]
- 对支持 cache key 的 SDK，OpenCode 使用稳定的 session ID 设置 `prompt_cache_key` 或 `promptCacheKey`；AI SDK Gateway 则显式启用自动 caching。[\[5\]][ref-5]

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Anthropic provider 将 `cache_control` 放在 system prompt、最后一条会话消息的最后一个可缓存 block，以及最后一个工具定义上，分别覆盖稳定指令、增长中的 transcript 和工具 schema。[\[6\]][ref-6] [\[7\]][ref-7]
- Kimi OpenAI-compatible provider允许通过 `generationKwargs.prompt_cache_key` 传入缓存键，并原样进入请求参数；当前证据没有显示 agent runtime 自动把 session ID 写入该字段。[\[8\]][ref-8]
- agent runtime 会在同一 turn 内快照 model、request params 和 system prompt，避免一次工具循环中配置漂移；同时记录 system prompt 与工具 schema 哈希，可用于检测缓存前缀变化。[\[9\]][ref-9]

### Gemini CLI

**Status:** complete

**Observed behavior**

- 重试时的纠偏提示被追加到 conversation contents 尾部，而不是修改 `systemInstruction`；源码明确说明这是为了保留 prefix cache。[\[10\]][ref-10]
- 历史达到默认 50% context threshold 后触发压缩，保留最近约 30% 历史；压缩成功后用摘要、固定确认消息和保留尾部建立新的历史。该策略会在压缩点重建一次前缀，但之后可继续稳定追加。[\[11\]][ref-11]
- Gemini CLI 读取并累计 provider 返回的 `cachedContentTokenCount`，因此缓存效果可进入 UI/telemetry，而不是只能从费用侧猜测。[\[12\]][ref-12]

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- Pi 把 cache retention 抽象为 provider-neutral 选项，默认 short，可选择 long/none；OpenAI Responses 会根据能力发送稳定 session-based `prompt_cache_key`、retention 或显式 cache options。[\[13\]][ref-13]
- Anthropic 请求同时标记 system prompt、最后一条 user history block 和最后一个工具定义；工具 schema 可独立于持续增长的 transcript 被复用。[\[14\]][ref-14]
- OpenAI-compatible Chat Completions 兼容层同样支持 session cache key，并可为 Anthropic-style endpoint 在 system、最后工具和最后会话文本放置 breakpoint。[\[15\]][ref-15]

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 每个 step 从 session event log 派生完整消息边界，system、tools 和模型配置形成 canonical request header；请求携带稳定 session ID。只要前序事件不被改写，后续请求自然是旧请求的追加扩展。[\[16\]][ref-16]
- DeepSeek adapter 将 `prompt_cache_hit_tokens` 映射为独立的 `cacheReadTokens`，并从普通 input token 中扣除，提供可比较的真实命中指标。[\[17\]][ref-17]
- 仓库包含真实 API 缓存测试：长稳定 system prompt + append-only 工具循环后，要求首个请求之后的每个请求都有 cache read；测试有 key gate，因此属于可执行设计证据而非本次运行结果。[\[18\]][ref-18]

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Agent | DeepSeek Harness | Confidence |
|---|---|---|---|---|---|---|---|
| Stable session cache key | 原生 session key [\[1\]][ref-1] | 多 provider session key [\[5\]][ref-5] | 可配置，未见自动绑定 [\[8\]][ref-8] | 未发现 | provider-neutral session ID [\[13\]][ref-13] | session ID 传入 adapter [\[16\]][ref-16] | high |
| Explicit breakpoints | 不适用 Responses key | system + tail [\[4\]][ref-4] | system + tail + tools [\[6\]][ref-6] | 未发现 | system + tail + tools [\[14\]][ref-14] | 依赖 provider 自动 prefix cache | high |
| Prefix stability | `previous_response_id` 严格匹配 [\[2\]][ref-2] | 尾部推进 breakpoint | turn config 快照 [\[9\]][ref-9] | 尾部追加 retry nudge [\[10\]][ref-10] | session-scoped append-only context | canonical header + event log [\[16\]][ref-16] | high |
| Compaction | 支持 compact 后重建请求 | 存在会话压缩，未纳入本次细查 | 摘要替换旧历史 | 50% 触发、保留 30% [\[11\]][ref-11] | 支持 compaction | session projection 可重建 | partial |
| Cache telemetry | cached input tokens | provider usage | cache probe/usage | cached content tokens [\[12\]][ref-12] | cache read/write | cache read tokens [\[17\]][ref-17] | high |

## KQode Lessons

### Product behavior

- **P0：保持 append-only transcript。** 已发送的 User/Assistant 内容、顺序和序列化不能在后续轮次中被清洗或重写；动态提醒、retry nudge 和临时上下文应追加到尾部，而不是改 system prompt。Codex、Gemini CLI 和 DeepSeek Harness 都把前缀稳定作为复用前提。[\[2\]][ref-2] [\[10\]][ref-10] [\[16\]][ref-16]
- **P0：为每个 conversation 建立稳定 cache affinity key。** key 应在同一 provider/model/config epoch 内保持不变，不包含 turn ID；切换 provider、model、system prompt schema 或工具 schema 时再轮换。参考实现普遍使用 session ID。[\[1\]][ref-1] [\[5\]][ref-5] [\[13\]][ref-13]
- **P1：压缩应成为明确的 cache epoch 边界。** 达到阈值后一次性生成稳定摘要，再在新前缀上继续 append；不要每轮微调摘要，否则每轮都会使缓存失效。Gemini CLI 和 Kimi Code 都采用“摘要 + 保留近期尾部”的结构。[\[11\]][ref-11] [\[9\]][ref-9]

### Architecture implications

- 在 provider layer 增加 `PromptCachePolicy`，至少包含 `cache_key`、`retention`、`breakpoint_format` 和 capability flags。OpenAI、Anthropic 与兼容端点不能共用一套硬编码字段。[\[4\]][ref-4] [\[13\]][ref-13] [\[15\]][ref-15]
- Anthropic 请求应至少标记 system prompt 和最新会话 block；未来工具注册上线后，再标记最后一个稳定工具定义。这样工具 schema 与 transcript 可以分别形成可复用前缀。[\[6\]][ref-6] [\[14\]][ref-14]
- 对 OpenAI Responses 增加可选的 `previous_response_id` 增量路径，但必须先验证 model、instructions、tools、reasoning 和 cache key 未变化；任何不一致都应安全回退到完整请求。[\[2\]][ref-2] [\[3\]][ref-3]
- 将动态 workspace 信息、时间、随机 ID、临时状态放到 transcript 尾部或工具结果中。system prompt 和工具 schema 内的非确定性数据会破坏最长公共前缀。

### Evaluation ideas

- 为序列化后的 provider request 增加 golden test：第二轮请求在新增 user message 之前的字节必须与第一轮一致。
- 记录 `input_tokens`、`cache_read_tokens`、`cache_write_tokens`、命中率和估算节省金额；按 provider/model/conversation 聚合。Gemini CLI、Pi 和 DeepSeek Harness 都把缓存 token 作为一等 usage 数据。[\[12\]][ref-12] [\[17\]][ref-17]
- 增加受环境变量保护的真实 API 测试：首轮允许 0 cache read，工具循环第二 step 和下一 turn 必须出现 cache read；DeepSeek Harness 已采用这一模式。[\[18\]][ref-18]
- 增加扰动测试，分别修改 system prompt、工具顺序、model 和历史中间消息，确认 cache epoch 会轮换或增量路径会回退。

### Risks and tradeoffs

- `cache_control`、retention 和 cache key 字段并非所有 OpenAI-compatible 服务都接受，必须通过 provider capability 显式开启，不能无条件发送。[\[4\]][ref-4] [\[15\]][ref-15]
- 压缩会主动打断旧前缀缓存；触发过早会增加摘要调用和 cache write，触发过晚则增加上下文成本。应同时以 context ratio、绝对 token 和近期 cache-read 比例决策。
- cache key 只提供 affinity，不能替代前缀一致性；同一个 key 下频繁改变 system prompt 或工具 schema仍会降低命中。

## Recommended KQode Implementation Order

1. 扩展 usage 类型并解析各 provider 的 cached token 字段，先建立基线。
2. 为 conversation 生成稳定 cache key，并在 OpenAI/Kimi/DeepSeek/Custom capability 允许时发送。
3. 为 Anthropic 增加 system、最新消息和未来最后工具定义的 `cache_control`。
4. 增加请求 prefix fingerprint 与开发态日志，定位 system/tool/history 哪一段发生变化。
5. 实现 turn-boundary compaction，并把每次压缩视为新的 cache epoch。
6. 最后实现 OpenAI Responses `previous_response_id` 增量请求和安全回退。

## Evidence Gaps

- Provider 服务端缓存 TTL、最小可缓存 token 数和路由细节不完全存在于客户端仓库，需要结合各 provider 官方 API 文档和真实请求指标校准。
- OpenCode 的 message-level/content-level marker 最终序列化和 Pi 的大规模 capability catalog 未逐模型验证。
- Kimi native provider 自动设置 session cache key 的证据不足；当前仅确认配置字段可透传。
- Gemini CLI 未发现普通 chat path 主动创建显式 cached-content resource，因此其结论主要覆盖 prefix stability、compression 和 telemetry。
- DeepSeek Harness 的真实 API 测试受 key gate 保护，本次按安全规则未执行。

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: session-scoped prompt cache key derivation and request field ([code](https://github.com/openai/codex/blob/588b781ab4924ce7352488394028e63d74cf807f/codex-rs/core/src/client.rs#L540-L558)).
- <a id="ref-2"></a>[2] Codex CLI: non-input request properties must match before incremental reuse ([code](https://github.com/openai/codex/blob/588b781ab4924ce7352488394028e63d74cf807f/codex-rs/core/src/client.rs#L350-L413)).
- <a id="ref-3"></a>[3] Codex CLI: WebSocket follow-up uses `previous_response_id` and incremental items, with full-request fallback ([code](https://github.com/openai/codex/blob/588b781ab4924ce7352488394028e63d74cf807f/codex-rs/core/src/client.rs#L1869-L1925)).
- <a id="ref-4"></a>[4] OpenCode: provider-specific cache markers on system and conversation tail messages ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/opencode/src/provider/transform.ts#L358-L417)).
- <a id="ref-5"></a>[5] OpenCode: session ID cache keys and gateway automatic caching ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/opencode/src/provider/transform.ts#L1308-L1371)).
- <a id="ref-6"></a>[6] Kimi Code CLI: Anthropic system and last-message cache markers ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/kosong/src/providers/anthropic.ts#L329-L361)).
- <a id="ref-7"></a>[7] Kimi Code CLI: last tool definition receives an Anthropic cache marker ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/kosong/src/providers/anthropic.ts#L1069-L1085)).
- <a id="ref-8"></a>[8] Kimi Code CLI: `prompt_cache_key` is accepted through generation kwargs and serialized into the request ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/kosong/src/providers/kimi.ts#L57-L74), [code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/kosong/src/providers/kimi.ts#L488-L535)).
- <a id="ref-9"></a>[9] Kimi Code CLI: stable turn configuration snapshot and request fingerprints ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts#L650-L767)).
- <a id="ref-10"></a>[10] Gemini CLI: retry nudge is appended to contents to preserve prefix cache ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/core/geminiChat.ts#L947-L977)).
- <a id="ref-11"></a>[11] Gemini CLI: threshold-based compression and summary-plus-tail replacement ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/context/chatCompressionService.ts#L34-L49), [code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/context/chatCompressionService.ts#L321-L349), [code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/context/chatCompressionService.ts#L430-L479)).
- <a id="ref-12"></a>[12] Gemini CLI: provider cached-token metadata is normalized into usage telemetry ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/event-translator.ts#L462-L472)).
- <a id="ref-13"></a>[13] Pi Coding Agent: cache retention policy and session-based OpenAI Responses cache fields ([code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/openai-responses.ts#L58-L99), [code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/openai-responses.ts#L301-L311)).
- <a id="ref-14"></a>[14] Pi Coding Agent: Anthropic system, transcript-tail, and last-tool cache breakpoints ([code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/anthropic-messages.ts#L1026-L1089), [code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/anthropic-messages.ts#L1373-L1395), [code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/anthropic-messages.ts#L1450-L1461)).
- <a id="ref-15"></a>[15] Pi Coding Agent: OpenAI-compatible cache key, retention, and Anthropic-style marker compatibility ([code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/openai-completions.ts#L797-L818), [code](https://github.com/earendil-works/pi/blob/da840b6216578c2a571d0374ac6a2091a83f9d91/packages/ai/src/api/openai-completions.ts#L1064-L1174)).
- <a id="ref-16"></a>[16] DeepSeek Harness: log-derived append-only boundary, canonical request header, and stable session ID ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/agent.ts#L350-L366), [code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/agent.ts#L493-L585)).
- <a id="ref-17"></a>[17] DeepSeek Harness: cache-hit usage normalization ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-deepseek/src/translate.ts#L47-L70)).
- <a id="ref-18"></a>[18] DeepSeek Harness: key-gated real API test for cache hits after the first append-only request ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/tests/request-cache.e2e.ts#L1-L91)).

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
