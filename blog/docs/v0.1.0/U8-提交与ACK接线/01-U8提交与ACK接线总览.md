---
sidebar_position: 1
title: 1. U8 提交与 ACK 接线总览
---

U8 对应 tag [`U8`](https://github.com/kefeiqian/KQode/tree/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef)，实现 commit 是 [`bcc8130e137f37b8dc0884918768f3b1fc5fc1ef`](https://github.com/kefeiqian/KQode/commit/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef)，主题是 `feat(tui): wire App submit state and ACK output`。它把首页 composer 的提交动作、U7 已经接好的 `BackendClient`、Rust 后端返回的 `ACK`，以及 transcript 正文显示连成第一条真正端到端路径。

![U8 提交到 ACK 的端到端路径](../../images/u8-submit-ack-wiring/submit-to-ack-overview.png)

这次提交只做一个目标：证明“用户在 Ink 里输入文字，TypeScript 发送到 Rust，Rust 确认收到，TUI 把结果显示回来”。计划文档里对应 [`U8. Wire App submit state and ACK output`](https://github.com/kefeiqian/KQode/blob/17b51456a479ab5de20af403bf1668788099d076/docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md#u8-wire-app-submit-state-and-ack-output)。它要求 prompt 立即显示、连续提交按顺序排队、ACK 和错误都进入正文，并且显示前要净化文本。

U8 的 diff 很集中：[`tui/src/state/backend/atoms.ts`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/src/state/backend/atoms.ts) 新增提交队列，[`bodyEntries.ts`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/src/state/backend/bodyEntries.ts) 把队列转成正文 entry，[`sanitizeDisplayText.ts`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/src/libs/text/sanitizeDisplayText.ts) 负责 terminal 安全显示，`App` 和 `main.tsx` 切到 Jotai store composition。

```ts
/** Ordered record of submitted prompts and their backend outcomes. */
export const promptQueueAtom = atom<QueueItem[]>([]);

const drainingAtom = atom(false);
```

为什么这是分水岭？U1 到 U7 都是在铺路：有静态首页、有 composer、有 Rust JSON-RPC ACK 后端、有启动和客户端生命周期。但用户按 Enter 后还没有真正驱动后端。U8 把这些孤立能力连成回路，所以它是 KQode 从“能显示界面”走向“能证明前后端交互”的第一个 milestone。

U8 也明确没有做真实 LLM、assistant stream、工具调用或 session persistence。显示出来的 `Rust backend ACK - received: ...` 是开发期 proof，不是最终对话协议。这个克制很重要：先验证本地 ACK 往返，避免把还没设计好的 agent session 过早固化进 UI。
