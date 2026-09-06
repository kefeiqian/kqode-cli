---
date: 2026-09-05
topic: agent-completion-semantics
question: "其他 coding agent 是否都有 complete_task 工具；没有该工具时如何结束任务，KQode 应如何设计？"
status: complete
---

# Coding Agent 如何判断任务结束

## Summary

六个参考实现中，**没有任何一个普通主 Agent 强制依赖 model-facing `complete_task` 工具**。Codex、OpenCode、Kimi Code、Gemini CLI 主对话、Pi 和 DeepSeek Harness 的共同模式是：模型返回最终 assistant 文本且不再请求工具时，当前 turn 自然结束；宿主随后产生 `TurnComplete`、`turn.ended`、`turn/end`、session idle 等生命周期状态。 [\[1\]][ref-1] [\[4\]][ref-4] [\[7\]][ref-7] [\[11\]][ref-11] [\[15\]][ref-15] [\[18\]][ref-18]

唯一明确的 `complete_task` 是 Gemini CLI 的 **local subagent 私有工具**。该 subagent 不允许用普通文本自行结束，必须调用 `complete_task` 提交结构化结果；如果停止却没有调用它，会得到专门的协议错误。Gemini 的普通主聊天仍然采用“没有 pending tool calls 就结束”的模式。 [\[9\]][ref-9] [\[10\]][ref-10] [\[11\]][ref-11]

因此 KQode 第一版主 Agent 不需要把 `complete_task` 放进工具列表。KQode 需要的是一个**宿主内部的 typed completion transition**：将最终 assistant response、停止原因、usage 和状态持久化为 `completed | partial | blocked | cancelled | budget_exceeded | failed`。未来实现 bounded subagent、workflow node 或严格结构化输出时，再为这些模式暴露 mandatory `complete_task` tool。

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `ddf04ad26789d040f9ef6a96736f76602e35a6cc` | complete | fetched 2026-09-05T05:50:03Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `e2894562f8ba943d72172d10b727c24d5f650c16` | complete | fetched 2026-09-05T05:50:03Z |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | complete | fetched 2026-09-05T05:50:03Z |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | complete | fetched 2026-09-05T05:50:02Z |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `9841914c71a74d81abe07f751aefd271fd924e63` | complete | fetched 2026-09-05T05:50:03Z |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete | fetched 2026-09-05T05:50:02Z |

---

## Method

- Question: 是否需要 model-facing `complete_task`，以及没有它时 agent loop 如何停止。
- Repo scope: default first-scope.
- Search themes: completion tools、provider finish reason、无 tool-call response、turn/session lifecycle、partial/blocked 状态、max-step safeguards。
- Safety posture: 仅搜索和读取源码；未运行、构建、安装或测试参考仓库；未读取参考仓库指令文件。
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries use commit-pinned source URLs.

---

## 先区分五个不同的“完成”

| 层级 | 含义 |
|---|---|
| Tool execution completion | 一次工具调用返回成功或错误，不代表任务结束。 |
| Model step completion | 一次 provider response 及其 tool calls 处理完毕。 |
| Turn completion | 当前用户消息不再自动触发下一次模型调用。 |
| Task completion | 系统判断用户目标已经完成、部分完成或阻塞。 |
| Session completion/idle | 当前 run 进入可持久化、可退出或等待下一条用户消息的状态。 |

没有 tool call 的最终 assistant response 能可靠表示 **turn completion**，但不能自动证明现实世界中的 **task success**。例如模型可能误以为修复完成、忘记运行测试，或者因为 token limit 被截断。宿主应记录停止原因与验证证据，而不是仅凭是否调用 `complete_task` 判断工作真的正确。

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- 没有 model-facing overall completion tool。协议中的历史 wire 名 `task_complete` 实际映射宿主生成的 `TurnComplete` lifecycle event，不是提供给模型调用的工具。 [\[1\]][ref-1]
- 模型输出中的 tool call 会设置 `needs_follow_up = true`；普通 assistant message 则保存为 `last_agent_message`。当没有 follow-up、没有 queued input 且 stop hook 不要求继续时，`run_turn` 结束。 [\[2\]][ref-2] [\[3\]][ref-3]
- 最终 assistant text 写入 `TurnCompleteEvent.last_agent_message`，宿主同时记录 timing 和 terminal error。 [\[1\]][ref-1]

**Evidence gaps**

- 主循环中未发现统一 hard max-step；可选 rollout budget、取消和错误可终止运行。

### OpenCode

**Status:** complete

**Observed behavior**

- 没有找到 built-in overall completion tool。普通 loop 在最新 assistant message 已有非 `tool-calls` finish reason、没有 unresolved tool calls 且对应最新 user message时退出。 [\[4\]][ref-4]
- provider 的 `step-finish` 会持久化 finish reason、usage、snapshot 和 patch。最终用户结果是最新 assistant message，session 另行回到 `idle`。 [\[5\]][ref-5] [\[6\]][ref-6]
- `agent.steps` 达到阈值时主要注入要求模型给出最终纯文本答复的 prompt；已检查路径没有证明它是不可绕过的 hard abort。 [\[20\]][ref-20]

**Evidence gaps**

- max-step 行为是 soft/model-enforced 还是存在外围 hard enforcement，已检查主循环之外未完全追踪。

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- 没有 overall completion tool。只有 provider finish reason 为 `tool_calls` 时才自动 enqueue 下一 step；如果 queue 为空，loop 返回 `completed`。 [\[7\]][ref-7]
- Kimi 将结果状态分层持久化：`turn.ended` 支持 `completed | cancelled | failed | blocked`，prompt 层还有 `prompt.completed` 和 `prompt.aborted`。最终 assistant text 保留在 conversation stream，状态事件不要求模型重复提交 summary。 [\[8\]][ref-8]
- `maxStepsPerTurn` 可形成 hard loop check；达到上限时抛出 max-steps error。 [\[21\]][ref-21]

**Evidence gaps**

- `maxStepsPerTurn` 可不配置；零或未设置不会产生有效上限。

### Gemini CLI

**Status:** complete

**Observed behavior**

- 普通 main chat 不要求 `complete_task`。streamed text 形成 content events，function calls 形成 pending tool requests；没有 pending tools 且 next-speaker check 不要求继续时，turn 返回。 [\[11\]][ref-11]
- Gemini 的 local subagent 则拥有 mandatory `complete_task`。工具接收 result 或 caller-provided schema，返回 `taskCompleted: true`；local executor 无条件把它注册到 subagent 私有 registry。 [\[9\]][ref-9]
- subagent 如果没有 function call，或停止时没有调用 `complete_task`，属于协议错误；成功调用后 submitted output 成为结构化 result，并记录 terminate reason、turn count 和 duration。 [\[10\]][ref-10] [\[12\]][ref-12]
- 主聊天有 100-turn cap 和 loop detection；local subagent 默认 30 turns、10 分钟，并允许最后一次 recovery prompt 提交 best-effort `complete_task`。 [\[13\]][ref-13]

**Evidence gaps**

- `complete_task` 结论仅适用于 local/subagent executor，不能推广到 Gemini CLI 主对话。

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- 没有 overall completion tool。assistant response 含 tool calls 时执行工具；否则在没有 steering/follow-up queue 时发出 `turn_end` 和 `agent_end`。 [\[14\]][ref-14]
- Print mode 直接输出最后一条 assistant message 的文本；error/aborted 写 stderr 并使用非零退出码。 [\[15\]][ref-15]
- Loop 提供 abort signal 和 `shouldStopAfterTurn` callback，但已检查主循环没有内建 hard max-turn count。 [\[16\]][ref-16]

**Evidence gaps**

- higher-level wrapper 或 extension 可能施加额外 deadline，但不属于已观察 core loop。

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 没有 dedicated overall completion tool。assistant message 没有 tool calls 时，step 返回 `completed`；tool batch 中如果某个内部 result 设置 `concludesTurn`，也可以结束 turn。后者是 handler-to-host 控制位，不是专门提供给模型的完成工具。 [\[17\]][ref-17] [\[18\]][ref-18]
- Durable `turn/end` 将 outcome 区分为 `completed`、`aborted`、`blocked`、`error`、`max-tokens` 和 crash-repair `interrupted`；SDK 的 `finalResponse` 来自最后一条 assistant message 文本。 [\[19\]][ref-19]

**Evidence gaps**

- core loop 中未找到通用 max-step cap；外部取消、provider max tokens、错误和 concluding tool result 是主要边界。

---

## Cross-Repo Comparison

| Repo | 主 Agent 有 `complete_task` tool | 正常结束条件 | 用户看到的最终结果 | 单独 lifecycle 状态 |
|---|---|---|---|---|
| Codex | 否 | 没有 follow-up/tool work 和 queued input [\[2\]][ref-2] [\[3\]][ref-3] | last assistant text | `TurnComplete` / `TurnAborted` [\[1\]][ref-1] |
| OpenCode | 否 | 非 tool-call finish reason 且无 unresolved calls [\[4\]][ref-4] | latest assistant message | session `idle` / errors [\[6\]][ref-6] |
| Kimi Code | 否 | 只有 `tool_calls` 才 enqueue continuation；queue empty 即结束 [\[7\]][ref-7] | conversation assistant output | typed turn/prompt outcomes [\[8\]][ref-8] |
| Gemini CLI | 主 Agent 否；subagent 是 | 主 Agent 无 pending tools；subagent 必须调用 tool [\[10\]][ref-10] [\[11\]][ref-11] | main text / subagent submitted result | main Finished / subagent OutputObject |
| Pi | 否 | 无 tool calls 和 queued messages [\[14\]][ref-14] | last assistant text [\[15\]][ref-15] | `turn_end` / `agent_end` |
| DeepSeek Harness | 否 | 无 tool calls，或 tool result `concludesTurn` [\[17\]][ref-17] [\[18\]][ref-18] | last assistant text | durable `turn/end` [\[19\]][ref-19] |

---

## KQode Lessons

### Product behavior

#### 普通主 Agent：不需要 `complete_task` tool

建议正常流程如下：

```text
user message
  -> model response
     -> 有 tool calls：执行并继续下一 step
     -> 无 tool calls：将 assistant text 作为最终回复并结束 turn
```

这与六个实现的 main-agent 主流行为一致。它有三个直接优点：

1. 普通问答无需额外调用一个“完成工具”。
2. 用户能流式看到最终答复，不需要等待第二层 result submission。
3. 模型忘记调用 `complete_task` 时，不会把本来完整的答案误判为协议错误。

#### 宿主仍必须有内部完成状态

不用 model-facing tool 不等于没有完成状态。建议 KQode 内部状态机包含：

```text
TurnOutcome
  Completed
  Partial
  Blocked
  Cancelled
  BudgetExceeded
  Failed
```

结束 turn 时记录：

```text
final_assistant_message
provider_finish_reason
tool_calls_completed
validation/check evidence
usage
duration
outcome
error?
```

Kimi 和 DeepSeek 表明，最终文本与 durable lifecycle outcome 应分开存储；Codex 也将 last assistant message 放进宿主生成的 completion event。 [\[1\]][ref-1] [\[8\]][ref-8] [\[19\]][ref-19]

#### Subagent/structured mode：以后再加入 mandatory `complete_task`

当 KQode 增加 subagent 时，`complete_task` 会变得有价值，因为 parent 不只需要一段聊天文本，还需要机器可验证的返回值：

```text
complete_task {
  outcome: completed | partial | blocked,
  result: ...,
  evidence: ...,
  remaining_work: ...
}
```

这时可以像 Gemini local executor 一样：

- 私有注册到 subagent registry；
- 不允许 subagent 仅输出 prose 后静默结束；
- schema validation；
- 达到 timeout/max turns 后给予一次 final recovery submission；
- 如果仍未调用，返回 `missing_completion_submission`。

Gemini 的证据表明，这种严格协议适合 bounded worker，不适合普通主聊天。 [\[9\]][ref-9] [\[10\]][ref-10] [\[12\]][ref-12] [\[13\]][ref-13]

### 没有 model-facing `complete_task` 会失去什么

会失去：

- 模型亲自声明 `completed | partial | blocked` 的明确边界；
- 对最终返回值执行 JSON Schema validation；
- 区分“模型认为做完了”和“模型只是停止调用工具”；
- parent/subagent 间稳定的 typed return contract；
- budget 到达后要求提交 best-effort partial result 的统一入口；
- 更直接的 task-success telemetry。

不会失去：

- 停止当前 agent turn；
- 展示最终 assistant 回复；
- 记录 session completed/idle event；
- 区分 cancel、timeout、budget 和 runtime error；
- 设置 max steps、token、cost 和 wall-clock budgets；
- 根据测试、diff 或用户确认评估任务是否真正成功。

### 如果完全没有内部完成状态会怎样

真正危险的不是缺少 `complete_task` tool，而是宿主只有一个模糊的“循环停了”：

- 无法区分模型正常回答、provider 截断、用户取消和预算耗尽。
- TUI 不知道显示“完成”“部分完成”还是“失败”。
- Headless mode 无法给出可靠 exit status。
- Resume/replay 无法知道该 turn 是否完整落盘。
- Eval 会把“模型不再调用工具”错误地当作任务成功。
- Parent agent 无法判断 child 是完成、阻塞还是意外停止。

因此必须实现 typed host lifecycle，即使第一版不暴露 `complete_task`。

### Architecture implications

推荐将 provider response 归一化为：

```text
AgentAction
  AssistantMessage { content, finish_reason }
  ToolCalls { calls }
  AskUser { request }
```

主循环规则：

```text
if tool_calls:
    execute and continue
elif queued_input or continuation_hook:
    continue
else:
    end turn with final assistant message
```

宿主结束动作：

```text
complete_turn(
    outcome,
    final_message,
    stop_reason,
    usage,
    evidence
)
```

不要把内部 action 也命名为 `ToolResult.should_continue = false`。一个工具完成、一个 step 完成和整个 task 完成是不同状态；DeepSeek 的 `concludesTurn` 很有用，但也说明这应是 scheduler contract，而不是把所有终止语义塞进普通 tool success boolean。 [\[17\]][ref-17]

### Evaluation ideas

- 模型返回纯文本且无 tool calls：turn 正常结束，文本成为 final response。
- 模型返回 tool calls：执行后必须再次调用模型，除非 cancellation/error/concluding control 明确终止。
- provider `max_tokens`：不得标为 successful task completion。
- tool failure：默认允许模型恢复，不自动结束 task。
- 用户取消：记录 `Cancelled`，即使已有 assistant partial text。
- max steps/cost/time：记录 `BudgetExceeded` 并保留 best-effort partial response。
- 主 Agent 没有 `complete_task` schema：仍可正常结束和持久化。
- Subagent 模式启用 `complete_task`：普通 prose-only stop 返回 `missing_completion_submission`。
- Subagent `complete_task` result 不符合 schema：拒绝完成并允许有限重试。
- 最终 assistant text 与 lifecycle event 必须引用同一 turn/step ID。

---

## Evidence Gaps

- Negative findings are based on targeted completion-name searches plus inspection of default tool registration and main-loop code; absolute absence across every experimental package cannot be proven.
- Codex: no universal hard max-step limit was established in the ordinary turn loop.
- OpenCode: configured step threshold clearly injects a final-response instruction, but hard enforcement was not established.
- Kimi Code: hard max-step behavior only applies when a positive limit is configured.
- Pi and DeepSeek Harness: higher-level wrappers may impose deadlines not present in the inspected core loops.
- Gemini CLI: `complete_task` applies to local/subagent execution and must not be generalized to main chat.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: host-generated `TurnComplete` and historical `task_complete` wire name ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/protocol/src/protocol.rs#L1407-L1415)).
- <a id="ref-2"></a>[2] Codex CLI: tool calls set follow-up while assistant text becomes the last agent message ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/stream_events_utils.rs#L263-L390)).
- <a id="ref-3"></a>[3] Codex CLI: turn loop exits when no follow-up or pending input remains ([code](https://github.com/openai/codex/blob/ddf04ad26789d040f9ef6a96736f76602e35a6cc/codex-rs/core/src/session/turn.rs#L438-L550)).
- <a id="ref-4"></a>[4] OpenCode: normal completion requires a non-tool finish reason and no unresolved tool calls ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/opencode/src/session/prompt.ts#L1090-L1132)).
- <a id="ref-5"></a>[5] OpenCode: provider step finish persists reason, usage, snapshot, and patch ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/opencode/src/session/processor.ts#L435-L493)).
- <a id="ref-6"></a>[6] OpenCode: loop returns the latest assistant message and session returns to idle ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/opencode/src/session/prompt.ts#L1336-L1350)).
- <a id="ref-7"></a>[7] Kimi Code CLI: only tool-call finish reasons enqueue continuation; empty request queue completes the loop ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/loop/loopContinuationService.ts#L10-L25)).
- <a id="ref-8"></a>[8] Kimi Code CLI: durable turn outcomes distinguish completed, cancelled, failed, and blocked ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/loop/turnOps.ts#L89-L128)).
- <a id="ref-9"></a>[9] Gemini CLI: subagent-only `complete_task` definition and registration ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/tools/complete-task.ts#L18-L105)).
- <a id="ref-10"></a>[10] Gemini CLI: local subagent requires `complete_task` and treats prose-only stopping as an error ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agents/local-executor.ts#L350-L470)).
- <a id="ref-11"></a>[11] Gemini CLI: main chat returns when no pending tool calls or continuation remains ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/core/client.ts#L850-L906)).
- <a id="ref-12"></a>[12] Gemini CLI: subagent result includes submitted output and termination metadata ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agents/local-executor.ts#L795-L825)).
- <a id="ref-13"></a>[13] Gemini CLI: main and subagent turn/time safeguards ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/agents/types.ts#L45-L60)).
- <a id="ref-14"></a>[14] Pi Agent: no tool calls or queued messages ends the loop and emits terminal events ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/agent/src/agent-loop.ts#L165-L273)).
- <a id="ref-15"></a>[15] Pi Coding Agent: print mode outputs the final assistant message directly ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/modes/print-mode.ts#L126-L155)).
- <a id="ref-16"></a>[16] Pi Agent: abort and `shouldStopAfterTurn` loop controls ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/agent/src/types.ts#L207-L235)).
- <a id="ref-17"></a>[17] DeepSeek Harness: tool results may internally conclude a turn ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/tool-calls.ts#L28-L45)).
- <a id="ref-18"></a>[18] DeepSeek Harness: no tool calls or a concluding result completes the step ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/agent.ts#L420-L475)).
- <a id="ref-19"></a>[19] DeepSeek Harness: durable turn outcomes and final assistant response are stored separately ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/session/src/types.ts#L188-L219)).
- <a id="ref-20"></a>[20] OpenCode: max-step threshold injects a final text-only response instruction ([code](https://github.com/anomalyco/opencode/blob/e2894562f8ba943d72172d10b727c24d5f650c16/packages/core/src/session/runner/max-steps.ts#L1-L16)).
- <a id="ref-21"></a>[21] Kimi Code CLI: configured max steps are enforced in the turn loop ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/agent/loop/loopService.ts#L692-L714)).

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
