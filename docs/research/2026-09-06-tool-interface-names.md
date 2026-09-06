---
date: 2026-09-06
topic: tool-interface-names
question: "KQode 首批三个 tool 的名称和 description 应如何与 Codex 或 DeepSeek Harness 对齐？"
status: complete
---

# 首批 Tool Interface 名称与描述

## Summary

KQode 的命令接口采用 Codex 的 `exec_command` 名称与 description；URL 抓取和用户提问接口采用 DeepSeek Harness 的 `web_fetch`、`ask_user_question` 名称与 description。这样三项元数据都直接对应已验证的参考实现，不再维护 KQode 自定义别名。 [\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3]

## Run Metadata

| Repo | Requested URL | Branch | SHA | Status |
|---|---|---|---|---|
| codex | https://github.com/openai/codex | `main` | `008bbd5884122dc95aaece19ecfe0fc6a59dcf36` | complete |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | `master` | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | complete |

## Observed Behavior

Codex registers the command tool as `exec_command` and describes it as running a command in a PTY while returning output or a session ID for continued interaction. [\[1\]][ref-1]

DeepSeek Harness registers URL retrieval as `web_fetch`, with a concise description limited to fetching a specific HTTP(S) URL and decoding it to text. [\[2\]][ref-2]

DeepSeek Harness registers user interaction as `ask_user_question`. Its description says to ask concise questions for confirmation, choices, or missing information, and to use stable question IDs echoed in answers. [\[3\]][ref-3]

## KQode Decision

| Capability | Tool name | Description source |
|---|---|---|
| Command execution | `exec_command` | Codex |
| Known-URL retrieval | `web_fetch` | DeepSeek Harness |
| User clarification | `ask_user_question` | DeepSeek Harness |

The current KQode registry remains metadata-only. Matching these descriptions does not claim that execution handlers already exist; provider requests continue to disable tool invocation until the corresponding runtime is implemented.

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: `exec_command` model-facing name and description ([code](https://github.com/openai/codex/blob/008bbd5884122dc95aaece19ecfe0fc6a59dcf36/codex-rs/core/src/tools/handlers/shell_spec.rs#L96-L106)).
- <a id="ref-2"></a>[2] DeepSeek Harness: `web_fetch` model-facing name and description ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/web/tool-web/src/fetch.ts#L455-L457)).
- <a id="ref-3"></a>[3] DeepSeek Harness: `ask_user_question` model-facing name and description ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/interaction/tool-ask-user/src/index.ts#L16-L23)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
