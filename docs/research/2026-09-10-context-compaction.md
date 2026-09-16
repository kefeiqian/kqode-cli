---
date: 2026-09-10
topic: context-compaction
question: "参考 coding agents 和相关研究如何做 context compaction：触发阈值、压缩规则、超长上下文恢复、模型差异，以及训练式 compaction 是否更优？"
status: complete
---

# Coding Agent Context Compaction 对比研究

## Summary

六个实现都把 compaction 当成“重写活跃模型上下文”，而不是删除持久历史，但触发策略差异很大：Codex 默认以模型窗口 90% 为基础并受 95% 有效硬上限约束；OpenCode 从模型输入/输出限制计算可用预算；Kimi 在 85% 或剩余不足 50,000 tokens 时触发；Gemini CLI 默认 legacy compressor 在 50% 就触发；Pi 为输出固定预留 16,384 tokens；DeepSeek Harness 默认在 80% 触发。不存在适用于所有 agent 或所有模型的单一百分比。[\[1\]][ref-1] [\[5\]][ref-5] [\[8\]][ref-8] [\[11\]][ref-11] [\[15\]][ref-15] [\[18\]][ref-18]

共同模式是：保留近期上下文或安全尾部，把较旧内容转成结构化 handoff/checkpoint，维持 tool-call/result 配对，并拒绝空摘要、截断摘要或压缩后反而更大的结果。超限后的恢复通常比主动压缩更激进，并且只允许有限次数重试，避免无限“压缩—重试”循环。[\[2\]][ref-2] [\[6\]][ref-6] [\[9\]][ref-9] [\[12\]][ref-12] [\[16\]][ref-16] [\[19\]][ref-19]

不同模型确实会有不同规则，但分为三类：按模型窗口自然缩放；按 model/profile/route 覆盖阈值、保留量或摘要模型；按 provider capability 选择完全不同的本地或远端压缩实现。KQode 不宜把 compaction 简化成一个全局 token 常量，而应把“模型容量、预留输出、触发政策、保留政策、摘要模型和 overflow 恢复”分开建模。[\[4\]][ref-4] [\[8\]][ref-8] [\[14\]][ref-14] [\[21\]][ref-21]

相关论文同样不支持一个适用于所有 agent 的“最佳摘要算法”。当前证据更支持组合式设计：结构化状态外置、按子任务或安全边界选择性压缩、永久固定关键约束、保留近期原文、验证候选 checkpoint 是否支持相同后续行为，并保留可恢复的原始事件日志。训练式方法可进一步让模型适应 compressed-state reasoning，但成本和模型绑定程度明显更高。[\[29\]][ref-29] [\[30\]][ref-30] [\[31\]][ref-31] [\[32\]][ref-32] [\[33\]][ref-33]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| Codex CLI | https://github.com/openai/codex | https://github.com/openai/codex | `main` | `ddea03ad049142943bdbf13e937b1d67e8c1ba0c` | complete | fetched 2026-09-10T11:50:50+08:00 |
| OpenCode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | `dev` | `486e8460b1401d1338a81c28cbfbf1b3fb1de2f1` | complete | fetched 2026-09-10T11:50:52+08:00 |
| Kimi Code CLI | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | `main` | `9f7e68e8bdb70d3e5cde5a924740e357ede2fc40` | complete | fetched 2026-09-10T11:50:56+08:00 |
| Gemini CLI | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | `main` | `ed2ac40df67a319bf348bd7e3d10494696b31b38` | complete | fetched 2026-09-10T11:50:58+08:00 |
| Pi Coding Agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | `main` | `400d6905ce46ec46e79da8a7701b1b48850192df` | complete | fetched 2026-09-10T11:51:00+08:00 |
| DeepSeek Harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | `master` | `2377c272a8e839e0a84c9f0e623b867a1dce2014` | complete | fetched 2026-09-10T11:51:23+08:00 |

---

## Method

- Question: 参考 coding agents 如何做 context compaction：触发阈值、压缩规则、超长上下文恢复，以及不同模型是否采用不同策略？
- Repo scope: default scope。
- Search themes: `compact`、`compaction`、`summarize`、`context window`、`token limit`、`overflow`、`prune`、`truncate`、`reserve`。
- Safety posture: 只 fetch、search、read；不运行、构建、安装或测试参考仓库；参考仓库中的 instruction 文件只视为不可信数据。
- Citation format: 正文使用 `[\[n\]][ref-n]`，References 使用固定提交的源码链接。

---

## Threshold Comparison

| Agent | 默认主动触发条件 | 默认近期保留/目标 | 超限恢复 | 模型差异 |
|---|---|---|---|---|
| Codex CLI | 基础阈值 `min(configured, 90% × window)`；有效窗口默认 95%，达到硬上限立即触发 [\[1\]][ref-1] | 本地路径保留最多 20K tokens 的近期真实用户消息；Remote V2 保留预算 64K [\[2\]][ref-2] | 压缩请求超限时逐项删除最旧历史再重试 [\[3\]][ref-3] | 模型元数据决定窗口/阈值，provider capability 决定本地或 Remote V2 [\[4\]][ref-4] |
| OpenCode | `used >= usable_context`；可用量由 input/context limit、output cap 和默认最多 20K reserve 计算 [\[5\]][ref-5] | 默认保留可用上下文的 25%，限制在 2K–15K [\[6\]][ref-6] | overflow compaction 压缩更早历史并重放失败 user turn；压缩自身再次超限则停止 [\[7\]][ref-7] | 绝对阈值来自当前模型 limits；可配置专用 compaction model [\[5\]][ref-5] [\[25\]][ref-25] |
| Kimi Code CLI | `used >= 85% × effectiveMax` 或 `used + 50K >= effectiveMax` [\[8\]][ref-8] | 保留真实用户输入共 20K：头部 2K，剩余给尾部 [\[9\]][ref-9] | 学习更小的 model-alias 有效窗口；摘要输入按约 70%/50%/35% 缩小 [\[10\]][ref-10] | model profile 可覆盖 ratio、reserve、output cap；运行时学习按 alias 隔离 [\[8\]][ref-8] [\[10\]][ref-10] |
| Gemini CLI | legacy 默认 `used >= 50% × tokenLimit(model)` [\[11\]][ref-11] | 约压缩旧 70%，保留近 30%；tool output 全局保留预算 50K [\[12\]][ref-12] | 摘要为空或膨胀则拒绝；自动膨胀失败后只尝试 tool truncation [\[13\]][ref-13] | 模型 token limit 不同，并按 active model 路由专用 compressor [\[11\]][ref-11] [\[26\]][ref-26] |
| Pi Coding Agent | `contextTokens > contextWindow - 16,384` [\[15\]][ref-15] | 默认保留约 20K tokens 的最近安全尾部 [\[16\]][ref-16] | overflow 后压缩并最多重试一次；再次超限明确失败 [\[17\]][ref-17] | 阈值随模型窗口变化；provider-specific overflow detector 负责识别错误 [\[17\]][ref-17] |
| DeepSeek Harness | 默认 `used >= floor(80% × contextWindow)` [\[18\]][ref-18] | 默认保留 `16% × contextWindow`，可绝对值覆盖 [\[18\]][ref-18] | overflow 强制 `retainTokens=0`，仅在 surface 真正缩小时重试一次 [\[20\]][ref-20] | `(provider, model)` exact route 可覆盖阈值、保留量、摘要模型和重试数 [\[21\]][ref-21] |

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- 基础自动阈值是模型上下文窗口的 90%；模型元数据可给出更低的 `auto_compact_token_limit`。另有默认 95% 的有效窗口硬上限，token-budget fallback 只能调整软触发点，不能越过硬上限。pre-turn 会在采样前检查，mid-turn 只在仍需 follow-up 或存在排队输入时压缩并继续。模型切换导致 compatibility hash 改变，或切到更小窗口且历史已超标，也可触发压缩。[\[1\]][ref-1]
- 本地摘要路径用 checkpoint prompt 生成 handoff，最终只保留摘要和最多 20,000 tokens 的近期真实用户消息；边界用户消息可截断，旧 assistant/tool 原文不进入 replacement history。Remote Compaction V2 使用 64,000-token 保留预算，并把单条可保留 agent message 限制为 10,000 tokens。[\[2\]][ref-2]
- 如果压缩请求自身超出窗口，本地路径从最旧端每次删除一项并重试，直到只剩一项仍失败；其他可重试 provider 错误遵循 stream retry/backoff。普通模型请求直接超限时会返回错误，不会静默截断活跃历史。[\[3\]][ref-3]
- OpenAI/Azure Responses 与 Bedrock 可走 Remote Compaction V2，其余 provider 走本地摘要路径。手动 `/compact` 也按 capability 选路径；启用 TokenBudget feature 时则走独立的 context-window reset。[\[4\]][ref-4] [\[22\]][ref-22]

**Evidence gaps**

- Remote V2 的服务端摘要模板与算法不在该公开检出中；只能确认客户端请求、返回项校验和本地保留规则。
- `fallback_buffer_tokens` 没有适用于所有模型的固定默认正数，因此 Codex 的实际软触发点不能简单等同于 90%。

### OpenCode

**Status:** complete

**Observed behavior**

- 自动条件是 `used_tokens >= usable_context`。有 input limit 时，可用量是 `input_limit - reserved`；否则是 `context_limit - maxOutputTokens`。默认 reserve 是 `min(20,000, maxOutputTokens)`，并可配置覆盖；关闭 `compaction.auto` 或 context limit 为零时不触发。[\[5\]][ref-5]
- 默认原样保留近期历史的预算为 usable context 的 25%，但夹在 2,000–15,000 tokens 之间。它按完整 user turn 从新到旧选择尾部，必要时保留边界 turn 的可容纳后缀；摘要只看更早的 head，最近 tail 随后原样拼回。重复压缩时，最近成功摘要作为 prior summary 输入。[\[6\]][ref-6]
- 摘要序列化会保留 user、assistant reasoning/text 和 tool call/result，但单个 tool result 最多 2,000 字符。可选 pruning 默认关闭；启用后保护最近 40,000 tokens 的工具输出，只有预计能释放超过 20,000 tokens 才执行，并永不 prune `skill` 工具。[\[6\]][ref-6]
- 正常请求被 provider 判定超限时，OpenCode 会压缩更早历史并重放失败 user turn；媒体附件在重放中变为文本占位。如果压缩请求自身再次要求 compact，则不递归压缩，而是记录明确错误并停止。自动压缩关闭时，原 overflow 直接成为 assistant error。[\[7\]][ref-7]
- 可配置专用 compaction agent/model，且该 agent 禁用所有工具；否则沿用发起压缩的 user message model。TUI `/compact`、`/summarize`、HTTP summarize、GUI 和 ACP 最终进入同一会话压缩路径。[\[25\]][ref-25]

**Evidence gaps**

- 未发现按 provider 名称设置不同固定百分比的表；差异主要来自运行时模型 metadata 和 output cap。
- 未发现压缩失败后自动切换摘要模型/provider 的实现。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- 默认主动和阻塞比例都是 0.85；另设 50,000-token reserve，因此实际条件是达到 85% 或剩余不足 50K 任一成立。模型 profile 可覆盖 trigger ratio 和 reserve，允许 ratio 范围为 0.50–0.99；`effectiveMax` 优先使用 input limit，否则使用 context limit。[\[8\]][ref-8]
- 当前完整压缩路径会摘要整个上下文，并用“选中的真实用户消息 + 一条 user-role summary + 一条 continuation reminder”替换活跃历史。真实用户输入包括普通消息及用户调用的 skill/plugin 命令，不包括注入、shell、旧摘要、系统 trigger、task、cron、hook result 或 retry；assistant/tool 细节只能通过摘要存活。[\[9\]][ref-9]
- 真实用户输入的原样保留预算为 20,000 estimated tokens：旧端最多 2,000，剩余给最新端，边界可截断，中间省略部分带估算 token 提示。TODO 会附加到摘要；可用时还写入 journal 恢复范围，允许从持久记录追溯原始上下文。[\[9\]][ref-9]
- overflow 后会把当前 model alias 的观察窗口下调为 `floor(requestTokens × 0.85)`，但只在确实变小时生效。普通请求最多经历三次连续 overflow compaction；压缩请求本身超限时，摘要输入依次缩到约 70%、50%、35%，仍失败则传播原错误。截断或空摘要会删除最旧消息及孤立 tool result 后重试，最多五次。[\[10\]][ref-10]
- `/compact [instruction]` 支持用户追加摘要要求；手动压缩要求 history 非空、loop idle 且获得 conversation quiescence，替换前还会检查原 history 仍是当前 history 的精确前缀，防止覆盖并发变化。[\[23\]][ref-23]

**Evidence gaps**

- `computeCompactCount()` 中存在保留近期消息的策略，但当前活动的 full-compaction service 未见调用；不能把该未接入策略描述成当前主路径行为。
- 未发现独立于 model profile 和运行时 overflow 学习的 provider 固定阈值。

### Gemini CLI

**Status:** complete

**Observed behavior**

- 默认关闭 experimental context management，使用 legacy compressor；自动条件为 `originalTokenCount >= compressionThreshold × tokenLimit(activeModel)`，默认 threshold 为 0.5。当前模型表中 Gemini/default/unknown 使用 1,048,576-token limit，Gemma 4 31B/26B-A4B 使用 256,000，因此默认触发点分别是 524,288 和 128,000 tokens。[\[11\]][ref-11]
- legacy 路径先按 50,000-token 总预算从新到旧保留 tool/function output；更旧的超预算响应会保存到外部并仅留下最后 30 行，保存失败则保留原文。随后在约“旧 70% / 新 30%”附近寻找不拆 function-response 边界的安全切点。[\[12\]][ref-12]
- 摘要生成 `<state_snapshot>`，若已有旧 snapshot 则合并仍相关信息，并通过第二次 verification call 补回遗漏的技术细节、路径、工具结果和用户约束。替换后历史是 user-role summary、短 assistant acknowledgement 和保留尾部；只有计算后的请求 tokens 不大于原历史才接受。[\[12\]][ref-12]
- 空摘要或膨胀摘要会保留原历史。自动模式一旦出现膨胀失败，后续自动尝试不再调用 summarizer，只做 tool-output truncation；仍不能降低时 NOOP。最终待发送请求若仍超过剩余窗口，客户端发出 `ContextWindowWillOverflow` 并不调用模型。[\[13\]][ref-13]
- 可选 ContextManager 模式采用显式分层：generalist profile 保留 65K、硬最大 150K、coalescing hysteresis 5K；单个 tool string 超过 8K 可 masking，节点超过 15K 可立即 distill。越过 150K 时同步执行最多 4K 的 emergency snapshot，但当前 renderer 没有展示处理后仍超限时的最终硬失败。[\[14\]][ref-14]
- 摘要模型按 active chat model 路由到专用 compressor alias，未知模型回退到默认 compressor。手动 `/compress`、`/summarize`、`/compact` 强制 legacy compression，不受自动阈值限制。[\[26\]][ref-26] [\[24\]][ref-24]

**Evidence gaps**

- optional ContextManager 的 emergency processing 后若仍超过 150K，后续 provider/API 行为没有在本次有界取证中建立。
- 手动 legacy compressor 与已启用 context graph 的完整交互未建立。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- 自动压缩默认开启，`reserveTokens=16,384`、`keepRecentTokens=20,000`；精确触发条件是 `contextTokens > contextWindow - reserveTokens`，严格使用 `>`。预请求检查使用模型自己的 context window；缺失或非正窗口会跳过。[\[15\]][ref-15]
- Pi 从最新消息向旧端累计，保留约 20K tokens 的安全尾部，cut point 不能落在 tool result 上。若边界在 turn 内部，则分别摘要更旧历史和该 turn 被丢弃的前缀，再与近期后缀合成 checkpoint；摘要明确要求目标、进度、决定、下一步、路径、函数名和错误。[\[16\]][ref-16]
- 活跃上下文会用一个 compaction-summary 和 retained boundary 后的原始 entries 替代旧历史，但旧事件仍保留在持久 session tree 中。摘要输出上限是 `min(0.8 × reserveTokens, model.maxTokens)`；默认最多 13,107 tokens，split-turn prefix summary 默认最多 8,192。[\[16\]][ref-16]
- Pi 通过 provider-specific 文本、成功响应 token 超窗、以及输入占窗口至少 99% 且零输出的 length stop 识别 overflow。错误或截断响应从 live state 移除，压缩后只重试一次；第二次 overflow 发出 recovery-failed。摘要出现 provider error、length stop 或 tool call 时拒绝持久化。[\[17\]][ref-17]
- `/compact` 支持可选自定义摘要要求；自动压缩可关闭。阈值的绝对值随模型窗口变化，但 reserve/keep-recent 是全局设置；provider 差异主要体现在 overflow detector。[\[27\]][ref-27] [\[17\]][ref-17]

**Evidence gaps**

- 未发现不同 provider 的主动阈值表。
- 自定义 provider 的未知错误文本可能无法识别；Ollama 的静默截断在源码中也明确标为不可可靠检测。

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 默认 `thresholdRatio=0.8`、`retainRatio=0.16`、summary cap 8,192、pressure extra retry 1、overflow retry 1。精确主动条件是 measurement 不再 `< floor(contextWindow × ratio)`，即达到或超过 80% 时触发。[\[18\]][ref-18]
- 它先尝试无需模型的 tool-result pruning，重新测量后仍超阈值才摘要。范围选择从新到旧满足 retention budget，保留 leading system message 和完整 tool-call/result 配对；旧 balanced range 被一个 user checkpoint 替代，原事件继续存在于 durable log 并标为 shadowed/source。[\[19\]][ref-19]
- 摘要调用保留原 system message、最近 routed request 的 tool schemas、旧 conversation region 和 compaction directive，以利 provider KV-cache reuse。摘要必须严格小于被替换区域，否则拒绝。prior checkpoint 中仍有效事实被保留，过时事实应删除。[\[19\]][ref-19]
- provider-confirmed overflow 会跳过普通阈值，执行 pruning，并用 `retainTokens=0` 选择最大可压缩 balanced range；只有 session surface 确实缩小时才重试，默认最多一次。如果一个不可拆单元本身过大，compaction 返回 null，不授权重试。[\[20\]][ref-20]
- `(provider, model)` exact route 可分别覆盖 threshold ratio、retention ratio/absolute tokens、summary provider/model、summary output cap、pressure retry 和 overflow retry。摘要模型依次选择显式配置、最后 routed request、agent default；都不存在则失败。[\[21\]][ref-21]
- `/compact` 仅在 agent idle 时运行，忽略自动阈值并用零 retention 选择一个安全范围；`auto:false` 可关闭 listener 而保留显式能力。[\[28\]][ref-28]

**Evidence gaps**

- 未穷举所有 LLM adapter 的 provider-specific overflow 映射。
- 未发现可处理“单个不可拆请求单元本身就超过窗口”的 fallback。

---

## Cross-Repo Comparison

### 1. 触发阈值不是单一百分比

阈值大致分为三种设计：

1. **窗口比例型**：Codex 90%/95%、Gemini legacy 50%、DeepSeek Harness 80%。[\[1\]][ref-1] [\[11\]][ref-11] [\[18\]][ref-18]
2. **输出预留型**：Pi 固定预留 16,384；OpenCode 从 input/context limit 扣除 output reserve；Kimi 同时使用 85% 和 50K reserve。[\[5\]][ref-5] [\[8\]][ref-8] [\[15\]][ref-15]
3. **分层压力型**：Gemini experimental ContextManager 区分 retained、normalized、max 和 emergency tiers，而不是一个触发点。[\[14\]][ref-14]

单用 `context_window × ratio` 会忽略最大输出、工具 schema、system prompt、provider envelope 和模型实际可用输入窗口。OpenCode、Kimi 和 DeepSeek Harness 都把这些因素中的至少一部分纳入预算或测量。[\[5\]][ref-5] [\[8\]][ref-8] [\[19\]][ref-19]

### 2. “保留近期原文 + 摘要旧历史”是主流，但保留对象不同

Pi 和 DeepSeek Harness 保留安全的近期消息尾部并维护 tool-call/result 原子性；OpenCode 按 user turn 选择 retained tail；Gemini legacy 约保留后 30%；Codex 与 Kimi 更偏向保留真实用户输入，而把 assistant/tool 事实交给摘要承载。[\[2\]][ref-2] [\[6\]][ref-6] [\[9\]][ref-9] [\[12\]][ref-12] [\[16\]][ref-16] [\[19\]][ref-19]

这意味着“近期保留”不能只用 message count 表示。合理的 cut planner 至少需要理解 turn、tool pair、system prefix、用户原始输入、媒体和不可拆节点。[\[6\]][ref-6] [\[12\]][ref-12] [\[16\]][ref-16] [\[19\]][ref-19]

### 3. 工具输出通常先做低成本缩减

Gemini legacy 在摘要前对旧 tool responses 做预算化截断；DeepSeek Harness 可先运行 durable tool-result pruner；OpenCode 有可选 pruning，但用 40K protected/20K reclaim 两个门槛避免频繁小修剪。[\[6\]][ref-6] [\[12\]][ref-12] [\[19\]][ref-19]

相较于立即调用摘要模型，先处理巨大工具输出可以减少成本、延迟和摘要失败概率，但必须保留 provenance，并避免拆散调用与结果。[\[16\]][ref-16] [\[19\]][ref-19]

### 4. Overflow recovery 比 proactive compaction 更激进

Codex 缩短摘要输入；Kimi 学习更小的 alias-specific window 并逐级缩短输入；OpenCode 尝试重放失败 user turn；Pi 删除失败 assistant event 后只重试一次；DeepSeek Harness 把 retention 降到零并要求 surface 实际缩小；Gemini legacy 若最终请求仍过大则拒绝发送。[\[3\]][ref-3] [\[7\]][ref-7] [\[10\]][ref-10] [\[13\]][ref-13] [\[17\]][ref-17] [\[20\]][ref-20]

六者都避免无限恢复：通过一次或少量次数上限、压缩结果必须变小、或压缩请求再次超限即终止。[\[3\]][ref-3] [\[7\]][ref-7] [\[10\]][ref-10] [\[13\]][ref-13] [\[17\]][ref-17] [\[20\]][ref-20]

### 5. 模型差异是第一等配置，而 provider 差异通常体现在能力和错误识别

Codex 根据 provider capability 选择远端或本地实现；Gemini 为不同 active model 选择不同 compressor；DeepSeek Harness 支持 `(provider, model)` 精确 route policy；Kimi 按 model alias 学习有效窗口。OpenCode 和 Pi 的主动政策较统一，但绝对阈值仍由模型窗口决定。[\[4\]][ref-4] [\[5\]][ref-5] [\[10\]][ref-10] [\[17\]][ref-17] [\[21\]][ref-21] [\[26\]][ref-26]

---

## KQode Lessons

### Product behavior

- 提供自动 compaction 和显式 `/compact`，但手动命令应允许附加用户摘要要求，并明确展示触发原因、压缩前后 token、保留范围和是否发生 overflow recovery。Pi、Kimi 和多个 CLI 都暴露了手动入口。[\[22\]][ref-22] [\[23\]][ref-23] [\[24\]][ref-24] [\[27\]][ref-27] [\[28\]][ref-28]
- UI 不应只显示“上下文百分比”。至少应同时显示有效输入容量、输出预留、当前估算、主动阈值和硬上限，因为这些值在 Codex、OpenCode、Kimi 和 DeepSeek Harness 中是不同概念。[\[1\]][ref-1] [\[5\]][ref-5] [\[8\]][ref-8] [\[18\]][ref-18]

### Architecture implications

- 在 `kqode-core` 中把 compaction 拆为独立策略对象：`PressurePolicy`、`CutPlanner`、`ToolOutputReducer`、`Summarizer`、`ReplacementValidator`、`OverflowRecoveryPolicy`。不要让 provider adapter 或桌面 service 自己拼接摘要历史。该拆分对应各实现中已经明显分离的测量、选区、摘要、替换和恢复阶段。[\[6\]][ref-6] [\[9\]][ref-9] [\[16\]][ref-16] [\[19\]][ref-19]
- `ModelInfo` 应包含 context/input/output limit、可靠性来源和 capability；policy 则按 route 覆盖 ratio、absolute reserve、retain budget、summary model 和 retry limits。DeepSeek Harness 的 exact-route policy 与 Kimi 的 profile/alias learning提供了最完整的参考。[\[8\]][ref-8] [\[10\]][ref-10] [\[21\]][ref-21]
- 活跃上下文替换必须是持久日志之上的 projection，而不是删除历史。Pi、DeepSeek Harness 和 Kimi 的 journal/recovery 设计都支持审计、恢复和重放。[\[9\]][ref-9] [\[16\]][ref-16] [\[19\]][ref-19]
- replacement commit 前应校验 source snapshot 未发生不兼容变化，并保证每个 assistant tool call 与 tool result 原子保留或一起被摘要。Kimi 的 prefix check 和 Pi/DeepSeek 的 balanced cut 都是必要并发与一致性保护。[\[9\]][ref-9] [\[16\]][ref-16] [\[19\]][ref-19]

### Evaluation ideas

- 建立阈值矩阵：不同 context/input/output metadata、ratio、absolute reserve、缺失窗口、模型切换和 route override 下，验证精确边界上的 `<`、`>=` 或 `>` 行为。各参考实现的边界比较并不一致。[\[1\]][ref-1] [\[5\]][ref-5] [\[8\]][ref-8] [\[15\]][ref-15] [\[18\]][ref-18]
- 建立 compaction invariant 测试：结果必须更小；system/developer prefix 不丢；tool pair 不拆；最近用户意图和未完成任务仍存在；旧历史仍可通过 trace/journal 恢复。[\[9\]][ref-9] [\[12\]][ref-12] [\[16\]][ref-16] [\[19\]][ref-19]
- 建立 overflow fault-injection：普通请求超限、摘要请求超限、摘要为空、length stop、摘要带 tool call、provider 413、未知错误文本、单个不可拆节点超限。期望结果应是有界恢复或显式失败，绝不能无限递归。[\[3\]][ref-3] [\[7\]][ref-7] [\[10\]][ref-10] [\[13\]][ref-13] [\[17\]][ref-17] [\[20\]][ref-20]

### Risks and tradeoffs

- 固定比例过早会增加成本并降低上下文保真度；过晚则可能连摘要请求本身都装不下。Gemini legacy 的 50% 很保守，而 Codex/Kimi/DeepSeek 更靠近窗口末端；KQode 应通过模型 metadata 和评测校准，而不是直接照搬某一数值。[\[1\]][ref-1] [\[8\]][ref-8] [\[11\]][ref-11] [\[18\]][ref-18]
- 只保留用户消息可最大化意图保真，但会让 assistant 推理、tool result 和代码状态完全依赖摘要；保留完整 recent turns 更可靠，但占用更多 token。Codex/Kimi 与 Pi/DeepSeek 展示了这两种取舍。[\[2\]][ref-2] [\[9\]][ref-9] [\[16\]][ref-16] [\[19\]][ref-19]
- provider 错误字符串识别天然脆弱。KQode 应优先依赖 typed provider errors 和实际 request token accounting，文本匹配只能作为兼容层，并记录 classifier provenance。Pi、OpenCode 和 DeepSeek Harness 都需要兼容 provider-specific overflow 表达。[\[7\]][ref-7] [\[17\]][ref-17] [\[20\]][ref-20]

---

## Research Literature

### Evidence status

直接研究 agent compaction 的论文主要集中在 2025–2026 年，其中多篇仍是 arXiv 预印本或会议投稿；不同论文使用 web search、SWE-bench、Terminal-Bench、AppWorld 等不同环境，结果不能直接横向排名。较成熟的 LLMLingua 系列主要验证静态长文档和 RAG prompt compression，不能直接证明 token-level pruning 适合保存 coding-agent 状态。[\[34\]][ref-34]

| Work | Strategy | Main evidence | Relevance to KQode |
|---|---|---|---|
| ACON | 从完整上下文成功、压缩后失败的成对轨迹中分析遗漏，并优化 natural-language guideline | 中等压力下压缩在性能和 token 成本之间较好 [\[29\]][ref-29] | 用 KQode 失败轨迹持续改进 checkpoint schema |
| Slipstream | 异步生成 compaction；用原上下文上的后续 continuation 验证候选摘要 | 最高提升 8.8 个百分点，端到端延迟最高降低 39.7% [\[30\]][ref-30] | soft threshold 异步生成，hard threshold 前验证 |
| TRACE | 从相同环境状态比较完整与压缩上下文的 closed-loop continuation | 递归 compaction 会削弱近期信息并导致重复探索；boundary-local verification 可改善 [\[31\]][ref-31] | 不只评价摘要文本，还比较下一步行为 |
| Governance Decay | 测试 compaction 后安全和政策约束是否继续影响行为 | 完整上下文违规率为 0%，压缩后平均升至 30%；constraint pinning 后恢复到 0% [\[32\]][ref-32] | policy、approval 和用户硬约束永久 pin |
| CORVUS | 用与工作区同步的当前文件 registry 替代重复和过期文件快照 | 平均输入 token 减少 9%–50%，pass rate 基本相当 [\[33\]][ref-33] | 文件状态从 VFS/workspace 重建 |
| Context Folding | agent 主动 `branch` 子任务，完成后 `return` outcome summary | 活跃上下文最多缩小约 10 倍，同时匹配或超过完整上下文基线 [\[35\]][ref-35] | 按子任务语义边界折叠 |
| ReSum / ReSum-GRPO | 周期性生成 restartable reasoning state；训练 agent 从 summary 继续 | 无训练 ReSum 相对 ReAct 提升约 4.5%；训练后再提升最高约 8.2% [\[36\]][ref-36] | 最容易接入线性 agent loop |
| CompactionRL | 把 execution 和 summary tokens 放入同一 RL rollout | SWE-bench Verified 上两个模型分别提升 7.0 和 5.5 点 [\[37\]][ref-37] | 直接面向 coding-agent 的联合训练 |

### What appears to work best

没有论文证明固定的 50%、80% 或 90% threshold 在所有模型和任务上最佳。ACON 只支持“中等压力下开始压缩通常比过早或临近硬上限更好”，而 Slipstream 表明 compaction 可以在 soft threshold 后异步运行，避免在 hard threshold 阻塞主 loop。对 KQode，合理的初始工程假设是使用 soft/hard 双阈值，再通过 golden tasks 校准，而不是把某个百分比写死为研究结论。[\[29\]][ref-29] [\[30\]][ref-30]

当前最有力的无训练组合是：

```text
Pinned constraints
+ Structured working state
+ Recent verbatim tail
+ Selectively compacted old history
+ Durable raw event log
+ Boundary-local validator
```

Governance Decay 支持把安全和政策约束移出有损摘要；CORVUS 支持从真实工作区重建文件状态；TRACE 支持验证 compaction boundary；Slipstream 支持异步生成和 continuation-based validation。[\[30\]][ref-30] [\[31\]][ref-31] [\[32\]][ref-32] [\[33\]][ref-33]

LLMLingua/LongLLMLingua 类 token-level compression 更适合网页、检索结果、日志和大型 tool output。coding trajectory 中的精确路径、错误、tool-call ID、调用/result 关系和未完成状态具有结构语义，不应只通过 token importance 决定是否删除。[\[34\]][ref-34]

---

## Training-Based Compaction

### LoRA's role

LoRA 是参数高效微调机制，不是 compaction 策略。它冻结基础模型权重，只训练低秩增量：

```text
W' = W + A × B
```

因此可以为同一个基础模型维护独立的 KQode compaction adapter，训练它生成结构化 checkpoint、从 checkpoint 恢复执行、选择 branch/fold 时机或保留 coding 状态。参数高效 RLHF 研究表明 LoRA 可用于 reward-model 和 RL 阶段并减少训练资源，但这不等于已经证明 LoRA 能无损复现下面三种方法的全部效果。[\[38\]][ref-38]

### Context Folding and FoldGRPO

Context Folding 不等待全局窗口达到阈值，而是让 agent 主动使用：

```text
branch(subtask)
...
return(outcome_summary)
```

branch 内部可执行搜索、文件读取、调试和失败探索；`return` 后主线程只保留子任务目标、结论、证据、产物和下一步，原始 branch trajectory 留在外部记录中。它按子任务完成边界压缩，比在 token 中点切割更符合任务语义。[\[35\]][ref-35]

FoldGRPO 在最终任务 reward 之外加入过程奖励，使模型学习何时 branch、何时 return，以及如何限制 branch scope。公开实现描述的奖励包括主线程过度膨胀惩罚、branch 偏离声明子任务的 out-of-scope penalty 和 branch/tool failure penalty。其主要训练难点不是摘要文本本身，而是同时改变任务分解、工具调用位置和上下文生命周期。[\[35\]][ref-35]

Context Folding 最适合可分解为调查、实现、验证等清晰子任务的 research/SWE 任务，以及已经支持树状子轨迹的 runtime。错误 branch boundary、过早 return 或不完整 outcome summary 仍会丢失细节，因此必须保留 durable child trace 和 re-open/retrieve 能力。

### ReSum and ReSum-GRPO

ReSum 把长 trajectory 切成多个可重启 segment：

```text
Segment 1 → Summary 1
Summary 1 + Segment 2 → Summary 2
Summary 2 + Segment 3 → Final Answer
```

无训练 ReSum 已可作为 plug-and-play runtime；ReSum-GRPO 进一步训练 agent 适应 `summary + recent history` 而不是完整 conversation 的输入分布。[\[36\]][ref-36]

ReSum-GRPO 将完整任务的 trajectory-level advantage 广播到所有 segment：

```text
Final task reward
→ trajectory-level advantage
→ Segment 1, Segment 2, Segment 3
```

这样早期 segment 也能获得整条探索路线最终成功或失败的信号。其 credit assignment 仍较粗：同一 rollout 中好的和坏的 segment 可能获得相同 advantage，summary-of-summary 漂移也仍需 runtime validation。[\[36\]][ref-36]

它最适合作为 KQode 第一种训练式 compaction：保持线性 agent loop，可先用无训练 summary，再逐步加入 LoRA/SFT 和 GRPO，不要求 branch/tree runtime。

### CompactionRL

CompactionRL 把 compaction 视为 RL rollout 中的 policy action，而不是外部 preprocessing：

```text
Execution Segment 1
→ Compaction Segment 1
→ Execution Segment 2
→ Compaction Segment 2
→ Final task reward
```

执行 token 和 summary token 由同一个 policy 联合优化。摘要不再主要优化文本相似度，而是通过后续 coding task 是否成功获得训练信号：遗漏关键错误、路径或状态会降低最终 reward；短但足以支持修复的 checkpoint 会得到正向信号。[\[37\]][ref-37]

它处理两个训练问题：

1. **Token-level loss normalization**：按 trainable token 归一化，避免长 execution segment 淹没 summary token，或 compaction 次数更多的 rollout 获得不合理权重。
2. **Cross-trajectory GAE**：让 advantage 跨过 compaction boundary，从最终 reward 回传到早期 execution 和 summary segment。

其优势是直接针对 coding/terminal agent，并联合训练“怎么做事”和“怎么保存以后仍需的信息”。代价是需要长 rollout、sandbox、可验证 reward、actor/critic 或等效估值机制、跨 segment batch construction 和较高算力；目前跨模型、跨 runtime 泛化证据仍有限。[\[37\]][ref-37]

### Comparison

| Dimension | Context Folding / FoldGRPO | ReSum-GRPO | CompactionRL |
|---|---|---|---|
| Compaction unit | 完整子任务 branch | 周期/长度 segment | RL rollout segment |
| Trigger | agent 主动 `branch`/`return` | runtime 周期或阈值 | runtime 边界，policy 生成 summary |
| Main objective | 学会任务分解和 fold 时机 | 学会从 summary 继续推理 | 联合学习执行和 summary |
| Credit assignment | terminal reward + process penalties | trajectory advantage 广播 | token normalization + cross-trajectory GAE |
| Runtime change | 最大，需要子轨迹树 | 最小，保持线性 loop | 中等，需要训练期 compaction rollout |
| Training cost | 高 | 中 | 最高 |
| Best fit | research、可分解 SWE | 搜索、浏览、首版训练路线 | coding、terminal agent |

---

## Recommended KQode Roadmap

### Phase 1: Reliable training-free runtime

先实现 provider-neutral 的 deterministic compaction pipeline：

```text
Measure
→ Select safe region
→ Reduce oversized tool output
→ Generate structured checkpoint
→ Validate invariants
→ Atomically install replacement
→ Recalculate pressure
```

必须具备 pinned constraints、tool-call/result 原子性、durable raw events、checkpoint provenance、replacement 必须变小、source snapshot 并发校验和有界 overflow retry。训练不应被用来弥补错误的 runtime 状态机。[\[30\]][ref-30] [\[31\]][ref-31] [\[32\]][ref-32]

### Phase 2: LoRA supervised fine-tuning

从 KQode golden tasks 和允许使用的真实轨迹构造：

```text
Input:
  previous checkpoint
  newly aged-out events
  structured workspace state

Target:
  next structured checkpoint
```

建议先分开训练 Compactor adapter 和 Resume adapter，分别验证 checkpoint 生成和恢复执行，再尝试联合 adapter。

### Phase 3: ReSum-GRPO

把长任务切为多个 segment，用最终测试/verifier reward 对所有 segment 做 advantage broadcasting，验证模型是否真正适应 compressed-state reasoning。[\[36\]][ref-36]

### Phase 4: CompactionRL

当 KQode 已具备稳定 sandbox、可验证 reward、长程 SWE/Terminal 数据、可靠 tool ledger 和可恢复 trace 后，再联合训练 execution 和 compaction tokens，并实现跨 boundary advantage。[\[37\]][ref-37]

### Phase 5: Context Folding

在共享 headless runtime、subtask ledger 和 trace projection 成熟后，引入 `branch`/`return`，让 agent 在语义任务边界主动折叠已完成工作。该阶段需要树状子轨迹和更复杂的 policy/safety 边界。[\[35\]][ref-35]

推荐顺序：

```text
Training-free validated compaction
→ LoRA SFT compactor/resumer
→ ReSum-GRPO
→ CompactionRL
→ Context Folding / FoldGRPO
```

最低成本验证训练价值时优先 LoRA + ReSum-GRPO；长期提升 coding-agent 任务成功率时重点研究 CompactionRL；支持数百轮、多分支任务时最终方向是 Context Folding。

---

## Evidence Gaps

- ACON、Slipstream、TRACE、Governance Decay、CORVUS 和 CompactionRL 等直接 agent-compaction 研究较新，多数尚缺少跨 runtime、跨 provider 的长期复现。
- Context Folding、ReSum-GRPO 和 CompactionRL 的 benchmark、训练模型和 reward 不同，不能只按论文报告的绝对提升比较优劣。
- LoRA 能降低训练参数和资源，但尚无证据证明它在三种训练式 compaction 上都与全参数训练等价。

- Codex Remote Compaction V2 的服务端摘要规则不可从公开客户端源码观察。
- Gemini experimental ContextManager 在 emergency processing 后仍超 150K 时的最终下游行为未建立。
- Kimi 的另一套 `computeCompactCount()` 策略未确认接入当前 full-compaction 主路径。
- OpenCode、Pi 和 DeepSeek Harness 的所有 provider adapter/error wording 未逐一穷举。
- 没有实现展示对“单个不可拆请求单元本身超过模型窗口”的通用恢复；该场景应在 KQode 中 fail closed。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: model-derived auto-compaction limits, effective window, turn checks, and model-switch triggers ([code](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/session/context_window.rs#L58-L109), [turn](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/session/turn.rs#L518-L590), [model](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/protocol/src/openai_models.rs#L445-L525)).
- <a id="ref-2"></a>[2] Codex CLI: local and Remote V2 retained-history construction ([local](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/compact.rs#L570-L735), [remote](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/compact_remote_v2.rs#L488-L650)).
- <a id="ref-3"></a>[3] Codex CLI: compaction overflow/retry and normal request overflow handling ([compact](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/compact.rs#L273-L346), [turn](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/session/turn.rs#L1555-L1585)).
- <a id="ref-4"></a>[4] Codex CLI: provider compaction capability and path selection ([provider](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/model-provider/src/provider.rs#L347-L368), [selection](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/session/turn.rs#L1380-L1425)).
- <a id="ref-5"></a>[5] OpenCode: usable-context calculation and overflow threshold ([code](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/session/overflow.ts#L8-L35)).
- <a id="ref-6"></a>[6] OpenCode: retained-tail selection, summary input, tool serialization, and optional pruning ([code](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/session/compaction.ts#L27-L315), [install](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/session/message-v2.ts#L521-L580)).
- <a id="ref-7"></a>[7] OpenCode: overflow replay and recursive-compaction failure handling ([code](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/session/compaction.ts#L340-L535), [processor](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/session/processor.ts#L621-L695)).
- <a id="ref-8"></a>[8] Kimi Code CLI: model-profile threshold, reserve, and effective-window policy ([code](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/strategy.ts#L6-L136), [profile](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/profile/profileService.ts#L447-L459)).
- <a id="ref-9"></a>[9] Kimi Code CLI: replacement handoff, retained user inputs, TODO and journal recovery ([handoff](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/contextMemory/compactionHandoff.ts#L6-L285), [service](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts#L728-L817)).
- <a id="ref-10"></a>[10] Kimi Code CLI: alias-specific effective-window learning and bounded overflow recovery ([code](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts#L255-L333), [retry](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts#L660-L725), [overflow](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts#L874-L918)).
- <a id="ref-11"></a>[11] Gemini CLI: legacy threshold and model token limits ([compressor](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/chatCompressionService.ts#L245-L287), [limits](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/core/tokenLimits.ts#L15-L38)).
- <a id="ref-12"></a>[12] Gemini CLI: legacy tool truncation, safe split, summary verification, and replacement validation ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/chatCompressionService.ts#L43-L236), [summary](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/chatCompressionService.ts#L325-L479)).
- <a id="ref-13"></a>[13] Gemini CLI: failed-compression fallback and final overflow refusal ([service](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/chatCompressionService.ts#L289-L323), [client](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/core/client.ts#L697-L717), [apply](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/core/client.ts#L1196-L1250)).
- <a id="ref-14"></a>[14] Gemini CLI: optional ContextManager profiles and emergency pressure barrier ([profiles](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/config/profiles.ts#L70-L152), [render](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/graph/render.ts#L95-L260)).
- <a id="ref-15"></a>[15] Pi Coding Agent: reserve/retention defaults and exact proactive trigger ([config](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/compaction/compaction.ts#L126-L238), [session](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/agent-session.ts#L536-L556)).
- <a id="ref-16"></a>[16] Pi Coding Agent: cut planning, split-turn summaries, output cap, and active-context projection ([planner](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/compaction/compaction.ts#L243-L346), [summary](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/compaction/compaction.ts#L655-L986), [projection](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/session-manager.ts#L411-L470)).
- <a id="ref-17"></a>[17] Pi Coding Agent: provider-specific overflow detection and one-retry recovery ([detector](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/ai/src/utils/overflow.ts#L3-L173), [recovery](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/agent-session.ts#L2179-L2449)).
- <a id="ref-18"></a>[18] DeepSeek Harness: default ratios, route-derived thresholds, and pressure trigger ([config](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/config.ts#L15-L167), [trigger](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/index.ts#L291-L334)).
- <a id="ref-19"></a>[19] DeepSeek Harness: route-aware pressure measurement, balanced region selection, summary validation, and durable replacement ([meter](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/llm/token-meter/src/index.ts#L110-L177), [region](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/region.ts#L92-L154), [replace](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/region.ts#L384-L545)).
- <a id="ref-20"></a>[20] DeepSeek Harness: canonical overflow compaction and retry authorization ([code](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/index.ts#L176-L293), [contract](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction/src/index.ts#L101-L117)).
- <a id="ref-21"></a>[21] DeepSeek Harness: exact provider/model route policy and summary-model selection ([types](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/types.ts#L8-L39), [config](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/config.ts#L94-L125), [summarizer](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/summarizer.ts#L120-L145)).
- <a id="ref-22"></a>[22] Codex CLI: manual `/compact` command and task path ([command](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/tui/src/slash_command.rs#L84-L100), [task](https://github.com/openai/codex/blob/ddea03ad049142943bdbf13e937b1d67e8c1ba0c/codex-rs/core/src/tasks/compact.rs#L19-L72)).
- <a id="ref-23"></a>[23] Kimi Code CLI: manual command, custom instruction, and quiescence checks ([command](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/apps/kimi-code/src/tui/commands/config.ts#L132-L140), [service](https://github.com/moonshotai/kimi-code/blob/9f7e68e8bdb70d3e5cde5a924740e357ede2fc40/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts#L335-L390)).
- <a id="ref-24"></a>[24] Gemini CLI: manual compression aliases and forced path ([code](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/cli/src/ui/commands/compressCommand.ts#L8-L80)).
- <a id="ref-25"></a>[25] OpenCode: dedicated compaction agent and manual/API entry points ([agent](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/agent/agent.ts#L217-L231), [tui](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/tui/src/routes/session/index.tsx#L558-L580), [api](https://github.com/anomalyco/opencode/blob/486e8460b1401d1338a81c28cbfbf1b3fb1de2f1/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts#L273-L291)).
- <a id="ref-26"></a>[26] Gemini CLI: compressor model routing ([service](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/context/chatCompressionService.ts#L98-L122), [models](https://github.com/google-gemini/gemini-cli/blob/ed2ac40df67a319bf348bd7e3d10494696b31b38/packages/core/src/config/defaultModelConfigs.ts#L273-L307)).
- <a id="ref-27"></a>[27] Pi Coding Agent: manual compaction and auto-compaction control ([command](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/slash-commands.ts#L29-L43), [session](https://github.com/earendil-works/pi/blob/400d6905ce46ec46e79da8a7701b1b48850192df/packages/coding-agent/src/core/agent-session.ts#L1952-L2044)).
- <a id="ref-28"></a>[28] DeepSeek Harness: manual compaction and automatic-listener control ([command](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/command-compact/src/index.ts#L10-L77), [manual](https://github.com/deepseek-ai/deepseek-harness/blob/2377c272a8e839e0a84c9f0e623b867a1dce2014/packages/compaction/compaction-basic/src/index.ts#L352-L393)).
- <a id="ref-29"></a>[29] ACON: failure-driven optimization of agent context-compression guidelines and threshold tradeoffs ([paper](https://arxiv.org/abs/2510.00615v1)).
- <a id="ref-30"></a>[30] Slipstream: asynchronous compaction with continuation-based validation for coding and browsing agents ([paper](https://arxiv.org/abs/2605.08580)).
- <a id="ref-31"></a>[31] TRACE: closed-loop evaluation and verifier-guided optimization at compaction boundaries ([paper](https://arxiv.org/abs/2608.06503)).
- <a id="ref-32"></a>[32] Governance Decay: empirical safety-constraint loss after compaction and constraint-pinning mitigation ([paper](https://arxiv.org/abs/2606.22528v2)).
- <a id="ref-33"></a>[33] CORVUS: workspace-synchronized file-state compression for coding agents ([paper](https://arxiv.org/abs/2607.22711)).
- <a id="ref-34"></a>[34] LongLLMLingua: question-aware prompt compression for long-context tasks ([paper](https://aclanthology.org/2024.acl-long.91/)).
- <a id="ref-35"></a>[35] Context Folding and FoldGRPO: agent-initiated subtask branching and outcome folding ([paper](https://arxiv.org/abs/2510.11967), [code](https://github.com/MiaoLu3/Context_Folding)).
- <a id="ref-36"></a>[36] ReSum and ReSum-GRPO: periodic reasoning-state summaries and segmented-trajectory reinforcement learning ([paper](https://arxiv.org/abs/2509.13313v3)).
- <a id="ref-37"></a>[37] CompactionRL: joint reinforcement learning of execution and compaction across context boundaries ([paper](https://arxiv.org/abs/2607.05378v1)).
- <a id="ref-38"></a>[38] Parameter-Efficient Reinforcement Learning from Human Feedback: LoRA-based parameter-efficient reward and policy optimization ([paper](https://arxiv.org/abs/2403.10704)).

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
