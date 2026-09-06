---
date: 2026-09-06
topic: tool-loop-v1-2-reference-design
question: "其他 coding agent 如何实现 tool loop，以及这些实现对 KQode V1.2 有什么借鉴意义？"
status: complete
---

# Coding Agent Tool Loop 对 KQode V1.2 的启示

## Summary

六个参考实现都把 tool loop 建模为“模型步骤 -> 工具批次 -> 结果回填 -> 下一模型步骤”，而不是一次模型请求中的附属逻辑。未知工具、参数错误和普通执行错误通常会转换成与原调用关联的失败结果，让模型自我修正；取消、Provider 故障、调度器内部错误等基础设施问题才终止整次运行。[\[1\]][ref-1] [\[3\]][ref-3] [\[6\]][ref-6] [\[10\]][ref-10] [\[13\]][ref-13] [\[16\]][ref-16]

KQode V1.2 不需要立即复制成熟实现的并行调度器、权限系统或重复检测服务。第一版应优先建立可验证的顺序循环、严格 call ledger、统一取消信号、明确的终止原因和硬预算。达到工具轮数上限后，借鉴 OpenCode，额外发起一次真正不携带工具的文本收尾请求；如果该请求仍返回工具调用，则以 Provider 协议错误结束。[\[3\]][ref-3]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `6af345407d9c2a568da9d01b6c4b81a9e61495c0` | complete | Fetched 2026-09-06T14:01:03+08:00 |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `337fd144d2ba144743368f78d9579a99cce175bd` | complete | Fetched 2026-09-06T14:01:06+08:00 |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | complete | Fetched 2026-09-06T14:01:08+08:00 |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | complete | Fetched 2026-09-06T14:01:10+08:00 |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `9767ba275f3e9a5ee0f5c5342249b629ab1b2282` | complete | Fetched 2026-09-06T14:01:12+08:00 |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete | Fetched 2026-09-06T14:01:14+08:00 |

---

## Method

- Question: 其他 coding agent 如何实现 tool loop，以及这些实现对 KQode V1.2 有什么借鉴意义？
- Repo scope: default first-scope，六个仓库。
- Search themes: loop state、continuation、limits、cancellation、call ID、argument validation、unknown tools、parallelism、result ordering、terminal outcome。
- Safety posture: 仅 fetch、search 和 read；没有运行、构建、安装或测试参考仓库代码；参考仓库内的 instruction files 未作为活动指令读取。
- Citation format: 正文使用 `[\[1\]][ref-1]`；References 使用固定 commit 的源码链接。

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- `run_turn` 按模型步骤循环：构造上下文、请求模型、收集工具工作；只要产生工具工作或存在排队用户输入，就继续下一次模型调用。没有工具工作和排队输入时才结束当前 turn。[\[1\]][ref-1]
- 多个工具调用以独立 task 执行。支持并行的工具共享读锁，不支持并行的工具获取独占写锁；结果通过有序 future 集合写回，从而把“执行并发”与“历史顺序”分离。[\[2\]][ref-2]
- 未知工具和普通参数解析错误属于 `RespondToModel`，转换成失败 tool output 后继续；只有 `Fatal` 类错误才中断请求。取消使用 turn token 派生的 child token，未完成工具会形成 aborted result。[\[2\]][ref-2]

**Evidence gaps**

- 主循环中未发现明确的数值型最大 tool round。
- 未发现 live dispatch 对重复 call ID 的显式拒绝。

### OpenCode

**Status:** complete

**Observed behavior**

- 新 core runner 使用内外两层循环：内层处理模型/工具步骤，外层处理排队 prompt。任何本地工具调用都会标记 continuation，所有工具 settle 后才进入下一模型步骤。[\[3\]][ref-3]
- 可配置 `steps` 上限；最后一步会真正移除工具定义、设置 `toolChoice: "none"`，并追加要求纯文本收尾的提示。如果 Provider 仍返回工具调用，则失败而不是继续执行。[\[3\]][ref-3]
- 每个 call ID 都有严格状态迁移。重复调用、重复成功结果、名称变化、result-before-call 和越序状态被视为内部协议缺陷；普通未知工具、输入 schema 和输出 schema 错误则被转换成模型可见的失败结果。[\[4\]][ref-4] [\[5\]][ref-5]

**Evidence gaps**

- 新 core runner 中未发现 legacy runner 的相同调用连续重复检测。
- Provider 自己执行的工具没有在本次调查中完整追踪。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- v2 loop 从 step queue 取请求，组合 turn/step cancellation signal，完成模型步骤、工具批次和 hook，然后由 continuation service 决定是否再次请求模型。只有 finish reason 为 `tool_calls` 且没有工具要求停止时，才自动排入下一步。[\[6\]][ref-6]
- 工具批次先统一 preflight，再按资源访问冲突调度；互不冲突的访问可以并发，读写冲突会串行。工具还可以停止当前批次，使后续调用得到 skipped error result。[\[7\]][ref-7]
- 同一步内相同工具和规范化参数的重复调用只执行一次并复用结果；跨步骤连续重复在 3、5、8 次时逐级提醒，12 次时停止工具循环并安排无工具 handoff。call ID 会结合历史进行唯一化，冲突 ID 被稳定改写。[\[8\]][ref-8] [\[9\]][ref-9]

**Evidence gaps**

- v2 中未发现对交替多调用环或“语义相同但 JSON 不同”参数的检测。
- malformed JSON 会降级为 `{}` 再走 schema 校验；这可能使宽松 schema 意外接受调用。

### Gemini CLI

**Status:** complete

**Observed behavior**

- 一次迭代收集完整的 `ToolCallRequest` 批次，交给 scheduler，随后把所有 correlated `functionResponse` 作为下一次模型输入。工具执行后若模型返回空文本，loop 会注入一次系统提醒，要求解释工具结果。[\[10\]][ref-10]
- scheduler 将调用组织为连续 wave；编辑类工具、显式 `wait_for_previous` 和特殊控制工具会串行，其他调用可以并行。未知工具和非法参数会成为 errored call，再作为 correlated function response 返回模型。[\[11\]][ref-11]
- deterministic loop detector 对“工具名 + JSON 参数”计算签名，检测长度 1–5 的重复周期；首次检测允许一次带纠正反馈的恢复，第二次检测终止。另有 turn 上限与后期 LLM-based loop check。[\[12\]][ref-12]

**Evidence gaps**

- 未发现对 Provider 重复 call ID 的明确保护；scheduler 使用 call ID 作为状态 key，因此需要调用边界预先保证唯一性。
- 本次聚焦非交互 CLI 使用的 session/scheduler 路径，没有覆盖全部 SDK、A2A 和 subagent loop。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- 内层循环在存在工具调用或 steering message 时继续，外层循环处理 follow-up queue。Provider error 或 aborted 状态立即终止；普通无工具 assistant response 结束当前循环。[\[13\]][ref-13]
- 默认允许并行执行，但 preflight 按模型顺序进行；如果全局配置要求顺序执行，或批次中任一工具声明 sequential，则整个批次串行。并行执行完成后，tool result 仍按原始 assistant call 顺序写回。[\[14\]][ref-14]
- 未知工具、参数校验异常、hook block 和工具异常都被捕获为 error tool result，并通常返回模型继续。取消会阻止后续调用启动；批次只有在所有结果都声明 `terminate: true` 时才停止自动 continuation。[\[14\]][ref-14] [\[15\]][ref-15]

**Evidence gaps**

- core loop 未发现内建数值型最大 turn/step；宿主可通过 `shouldStopAfterTurn` 提供策略。
- 未发现重复 call ID 或重复调用检测。

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- Agent 使用明确的 turn 和 step 边界。每个 step 可以因普通完成、tool calls 或 max tokens 结束；turn 还具有 completed、blocked、aborted 和 structured error 等终态。turn stopping hook 可以在关闭前注入更多工作。[\[16\]][ref-16]
- 工具调用按 parallel-safe 与 exclusive 分组。并行组使用有上限的 rolling pool，默认最多 10 个；pre-execute 和结果 commit 保持模型顺序。取消后停止补充 pool、等待已启动工作 settle，并为未 dispatch 的调用写入 synthetic aborted result。[\[17\]][ref-17]
- 普通未知工具、非法参数和执行错误会成为结构化 `isError` tool result；调度器 invariant failure 则停止新 dispatch、drain 已启动调用并终止 turn。该实现明确区分“工具可恢复失败”和“基础设施失败”。[\[17\]][ref-17] [\[18\]][ref-18]

**Evidence gaps**

- core loop 没有发现数值型 step/turn 上限；重复调用由可选 reminder plugin 处理。
- 未发现 model call ID 的显式重复拒绝。

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | DeepSeek Harness | Confidence |
|---|---|---|---|---|---|---|---|
| Continuation | 有工具工作或排队输入即继续 [\[1\]][ref-1] | 本地工具 settle 后继续 [\[3\]][ref-3] | continuation service 显式排下一 step [\[6\]][ref-6] | function responses 成为下一模型输入 [\[10\]][ref-10] | 工具或 steering 驱动继续 [\[13\]][ref-13] | step/turn 状态机显式决定 [\[16\]][ref-16] | high |
| Hard limit | 未发现 core 数值上限 | 可配置 steps，最终 text-only [\[3\]][ref-3] | 可配置，部分模式默认不限制 [\[6\]][ref-6] | session limit 加底层 emergency cap [\[10\]][ref-10] | 由宿主 stop callback 控制 | core 未发现数值上限 | partial |
| Repeat handling | 未发现 | legacy 有相同调用检测；core 未发现 | 阶梯提醒、去重、最终 handoff [\[8\]][ref-8] | 周期检测、一次恢复后终止 [\[12\]][ref-12] | 未发现 | 可选 reminder plugin | partial |
| Call ID | 原 ID 贯穿 result；未见重复检查 | 严格 call ledger [\[4\]][ref-4] | 历史感知唯一化 [\[9\]][ref-9] | 补齐/加前缀，未见 collision check | 原 ID 贯穿 result | 原 ID 加内部 correlation token | high |
| Ordinary tool error | 返回模型 [\[2\]][ref-2] | 返回模型 [\[5\]][ref-5] | 返回模型 [\[7\]][ref-7] | 返回模型 [\[11\]][ref-11] | 返回模型 [\[15\]][ref-15] | 返回模型 [\[18\]][ref-18] | high |
| Cancellation | child token，形成 aborted result [\[2\]][ref-2] | interrupt fibers 并 settle pending state [\[3\]][ref-3] | turn/step signal，带 abort grace [\[6\]][ref-6] | model 与 scheduler 共用 signal [\[10\]][ref-10] | signal 贯穿 preflight/tool [\[14\]][ref-14] | drain started + synthetic skipped result [\[17\]][ref-17] | high |
| Parallelism | shared/exclusive lock [\[2\]][ref-2] | tool fibers 并发 [\[3\]][ref-3] | 资源访问冲突调度 [\[7\]][ref-7] | wave + 显式 barrier [\[11\]][ref-11] | parallel/sequential 二态 [\[14\]][ref-14] | bounded pool + exclusive barrier [\[17\]][ref-17] | high |
| Result order | 提交顺序稳定 [\[2\]][ref-2] | publication 串行化 | 可按完成顺序产生 | scheduler 形成 correlated responses | 模型顺序写回 [\[14\]][ref-14] | 模型顺序 commit [\[17\]][ref-17] | partial |

---

## KQode Lessons

### Product behavior

- **达到工具预算后提供一次 text-only 收尾机会。** 建议 `max_tool_rounds = 8`，完成第八批工具结果后再发出一次不包含 `tools` 且 `tool_choice = none` 的最终请求。这样既有硬上限，也更可能给用户留下可读结论。若最终请求仍返回 tool call，则作为 Provider 协议错误结束。OpenCode 已证明“提示模型不要调用”不够，必须同时从请求中移除工具。[\[3\]][ref-3]
- **普通工具错误应允许模型修正。** `unknown_tool`、`invalid_arguments`、policy denial 和普通 execution failure 应产生 correlated `ToolResult`；取消、Provider 失败、调度器 invariant 和持久化失败才终止 run。六个实现均支持这一大方向。[\[2\]][ref-2] [\[5\]][ref-5] [\[7\]][ref-7] [\[11\]][ref-11] [\[15\]][ref-15] [\[18\]][ref-18]
- **重复调用先提醒，再强制收尾。** V1.2 可以先实现简单的规范化签名 `tool_name + canonical_json(arguments)`：连续第三次返回 warning context，第五次切换到 text-only finalization；不要在第一处重复时直接终止。Kimi 和 Gemini 都采用分阶段干预。[\[8\]][ref-8] [\[12\]][ref-12]
- **工具后空响应需要一次 nudge。** 如果工具成功执行后，模型既没有继续调用工具也没有可见文本，应允许一次无工具提醒请求，避免任务以空白结果结束。[\[10\]][ref-10]

### Architecture implications

- **建立严格 call ledger。** 每个调用状态至少为 `received -> validated -> running -> succeeded|failed|cancelled|skipped`。同一 run 内重复 ID、名称变化、result-before-call 和重复 settlement 都应成为 typed protocol error。OpenCode 的状态检查最适合直接借鉴。[\[4\]][ref-4]
- **保留 malformed arguments 的 call ID。** 当前 KQode 在 OpenAI arguments 不是合法 JSON 时直接结束解析。V1.2 更适合把它归一化为带原始 call ID 的 `invalid_arguments` result，让模型修正；不要像 Kimi 那样无条件降级为 `{}`，也不要产生无法关联的空 ID corrective output。[\[2\]][ref-2] [\[7\]][ref-7]
- **取消必须达到 quiescence。** 一个 run-owned token 应贯穿 Provider、审批、调度器和 handler。取消后停止新 dispatch，等待已启动调用退出或达到短 grace timeout，为已接受但未启动的调用在本地 trace 中记录 `cancelled_before_dispatch`，但不要再发起下一次模型请求。[\[6\]][ref-6] [\[10\]][ref-10] [\[14\]][ref-14] [\[17\]][ref-17]
- **V1.2 先串行执行，接口预留 execution mode。** 成熟实现都为并行加入了资源冲突、独占 barrier、结果排序和取消 settle 规则。KQode 首版只有三个工具，串行执行更容易保证 replay；接口可以预留 `Sequential` 与未来的 `ParallelSafe`，但不要在 V1.2 实现复杂 scheduler。[\[2\]][ref-2] [\[7\]][ref-7] [\[11\]][ref-11] [\[17\]][ref-17]
- **终止结果与工具结果分层。** 建议 run 终态使用 `completed | cancelled | failed | limit_reached`，另带 machine-readable stop reason；不要通过最后一个 ToolResult 的 `success` 推断整个任务是否完成。Kimi、Gemini 和 DeepSeek 都明确区分 turn/run outcome。[\[6\]][ref-6] [\[10\]][ref-10] [\[16\]][ref-16]

### Recommended V1.2 state

```text
ToolLoopState
  model_requests
  tool_rounds
  total_tool_calls
  seen_call_ids
  repeated_call_signature
  repeated_call_count
  cancellation

Loop
  request_model
    -> final_text
    -> tool_calls
       -> enforce_budget
       -> register_call_ids
       -> validate_and_execute_serially
       -> append_correlated_results
       -> request_model
    -> text_only_finalization
    -> completed | cancelled | failed | limit_reached
```

建议的 V1.2 默认预算：

| Budget | Default | Rule |
|---|---:|---|
| Tool rounds | 8 | 第八批结果后只允许一次 text-only finalization |
| Calls per round | 8 | 超限时整批不执行 |
| Total tool calls | 32 | 超限时进入 text-only finalization |
| Model requests | 10 | 初始请求 + 8 个工具 continuation + 1 个 finalization |
| Consecutive identical signature | warning at 3; finalize at 5 | 使用 canonical JSON，不以 call ID 参与签名 |

### Evaluation ideas

- 单调用、多调用和混合成功/失败批次都必须为每个 accepted call 产生恰好一个 correlated result。
- 同一响应内、跨轮次、resume 后以及 Provider retry 后的重复 call ID。
- malformed JSON、未知工具、缺少 required 字段、额外字段、错误类型和越界数值。
- 第八个工具 round 后验证下一请求没有任何工具定义；Provider 仍返回 tool call 时必须失败。
- 在 Provider streaming、参数校验、工具执行和结果提交四个阶段分别取消。
- 工具忽略取消直到 grace timeout；最终状态仍必须可终止且 trace 中没有 pending call。
- 相同调用连续重复、A/B 交替循环、JSON 属性顺序不同但语义相同的调用。
- 工具结果完成顺序与调用顺序相反时，history 仍保持确定性。

### Risks and tradeoffs

- **过早并行会扩大状态空间。** 一旦允许并行，就必须同时定义权限顺序、资源冲突、取消、部分完成和结果排序；V1.2 的收益不足以覆盖复杂度。[\[7\]][ref-7] [\[17\]][ref-17]
- **只依靠轮数上限会让简单重复浪费预算。** 需要轻量 exact-signature detector，但语义相似检测和 LLM-based loop detection可以后移。[\[8\]][ref-8] [\[12\]][ref-12]
- **自动重写重复 call ID 有兼容性收益，但隐藏 Provider 缺陷。** V1.2 更适合严格拒绝重复 ID并记录原始 payload；未来若确实需要兼容弱 Provider，再在 adapter 层加入可追踪的 deterministic rewrite。[\[4\]][ref-4] [\[9\]][ref-9]
- **取消时把 synthetic result 发回模型会重新启动已取消的任务。** synthetic cancellation result 应写入本地 session/trace 以保持 replay 完整，但取消后不再调用模型。DeepSeek 的成对记录方式值得借鉴，KQode 需要额外保持用户取消的终止语义。[\[17\]][ref-17]

---

## Evidence Gaps

- Codex、Pi 和 DeepSeek core loop 未发现统一的数值型 hard step limit；这不能证明其更上层宿主没有预算控制。
- Codex、Gemini、Pi 和 DeepSeek 未找到明确的 live duplicate-call-ID conformance test，因此重复 ID 建议主要由 OpenCode 的严格 ledger 和 Kimi 的 ID normalizer 支撑。
- Kimi 的结果产生顺序与完整 transcript commit 顺序没有在本次预算内继续追踪。
- Gemini 调查集中在非交互 CLI 使用的 legacy agent session；其他 SDK/A2A 路径可能采用不同 loop。
- 参考代码没有运行；结论来自固定提交的静态源码证据。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: turn loop continues for tool work or queued input and otherwise finishes ([code](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/core/src/session/turn.rs#L333-L562)).
- <a id="ref-2"></a>[2] Codex CLI: parallel/exclusive execution, cancellation, and model-facing tool failures ([code](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/core/src/tools/parallel.rs#L73-L242)).
- <a id="ref-3"></a>[3] OpenCode: core loop, tool continuation, interruption, and final text-only maximum step ([code](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/core/src/session/runner/llm.ts#L202-L322)).
- <a id="ref-4"></a>[4] OpenCode: strict call lifecycle and duplicate/out-of-order settlement checks ([code](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/core/src/session/runner/publish-llm-event.ts#L313-L400)).
- <a id="ref-5"></a>[5] OpenCode: unknown tools and schema failures become tool failures ([code](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/core/src/tool/registry.ts#L50-L75)).
- <a id="ref-6"></a>[6] Kimi Code CLI: v2 loop step budget, cancellation, and terminal outcome ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/loop/loopService.ts#L677-L823)).
- <a id="ref-7"></a>[7] Kimi Code CLI: preflight, resource-aware scheduling, skipped calls, and tool errors ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/toolExecutor/toolExecutorService.ts#L178-L550)).
- <a id="ref-8"></a>[8] Kimi Code CLI: duplicate-call reuse and staged repeat intervention ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/toolDedupe/toolDedupeService.ts#L340-L555)).
- <a id="ref-9"></a>[9] Kimi Code CLI: history-aware call ID normalization ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/llmRequester/toolCallIdNormalizer.ts#L3-L76)).
- <a id="ref-10"></a>[10] Gemini CLI: session loop, cancellation, result continuation, and empty-response nudge ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agent/legacy-agent-session.ts#L174-L342)).
- <a id="ref-11"></a>[11] Gemini CLI: scheduler waves, validation, unknown tools, and execution ordering ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/scheduler/scheduler.ts#L303-L579)).
- <a id="ref-12"></a>[12] Gemini CLI: deterministic repeated-call and repeated-content detection ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/services/loopDetectionService.ts#L185-L337)).
- <a id="ref-13"></a>[13] Pi Coding Agent: nested agent loop and continuation conditions ([code](https://github.com/earendil-works/pi/blob/9767ba275f3e9a5ee0f5c5342249b629ab1b2282/packages/agent/src/agent-loop.ts#L160-L269)).
- <a id="ref-14"></a>[14] Pi Coding Agent: sequential/parallel batch execution, cancellation, ordering, and termination ([code](https://github.com/earendil-works/pi/blob/9767ba275f3e9a5ee0f5c5342249b629ab1b2282/packages/agent/src/agent-loop.ts#L413-L590)).
- <a id="ref-15"></a>[15] Pi Coding Agent: unknown tools, argument validation, hooks, and execution failures become results ([code](https://github.com/earendil-works/pi/blob/9767ba275f3e9a5ee0f5c5342249b629ab1b2282/packages/agent/src/agent-loop.ts#L593-L712)).
- <a id="ref-16"></a>[16] DeepSeek Harness: explicit step/turn state and structured turn endings ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/agent.ts#L275-L340)).
- <a id="ref-17"></a>[17] DeepSeek Harness: bounded ordered scheduler and cancellation recovery results ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/tool-calls.ts#L120-L260)).
- <a id="ref-18"></a>[18] DeepSeek Harness: tool runtime converts expected tool failures into structured results ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/index.ts#L483-L503)).

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
