---
sidebar_position: 2
title: 2. 协议消息类型与 contracts 边界
---

U5 的核心文件是 [`tui/src/contracts/backend/messages.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/messages.ts)。它被放在 `contracts/backend` 下，而不是 `backend/protocol` 下，是一个非常重要的分层决定：contract 是多个层共享的 wire seam，不应该依赖 process launcher、JSON-RPC library、React state 或 UI 组件。

文件顶部的注释把这个边界写得很明确：

```ts
/**
 * Wire contract for the KQode backend message protocol.
 *
 * This module is a dependency-free seam shared by the `@state` and `@backend`
 * layers: it must not import from either side (or pull in transport libraries
 * such as `vscode-jsonrpc`) so it can never participate in a layer cycle.
 */
```

这个选择解决的是“谁可以依赖谁”的问题。后续 TUI state 需要知道 `MessageSubmitParams` 和 `MessageSubmitResult`，backend process/client 层也需要知道这些类型。如果把它们放进 `@backend` 并顺手 import `vscode-jsonrpc`，state 层要么也依赖 transport library，要么形成循环依赖。U5 先把 contract 层独立出来，后面实现功能时就不需要在依赖方向上返工。

## Method name 是常量，不是 call site 字符串

U5 新增的第一个协议常量是 `MESSAGE_SUBMIT_METHOD`：

```ts
/**
 * KQode-owned JSON-RPC method that acknowledges a submitted prompt.
 *
 * Must match `RpcMethod::MessageSubmit` (via `RpcMethod::as_str`) in
 * `src/protocol.rs`.
 */
export const MESSAGE_SUBMIT_METHOD = 'kqode.message.submit';
```

这直接呼应 KQode 的项目约定：避免硬编码 protocol name、event name 和 status string。U4 的 Rust 端已经有 `RpcMethod::MessageSubmit.as_str()`；U5 在 TypeScript 端也定义同名常量，而不是让每个 request call site 自己写 `'kqode.message.submit'`。

为什么不用 string literal scattered everywhere？因为协议名不是局部实现细节，它是 Rust 和 TypeScript 之间的跨语言 contract。一个字符写错，编译器不会跨语言帮我们发现；集中常量至少让搜索、review 和测试更可靠。

## ACK 文案也进入 contract

U5 还把 U4 backend 返回的 ACK 文案定义成常量：

```ts
/**
 * ACK text the first-slice Rust backend returns for a received prompt.
 *
 * Must match the `ACK_MESSAGE` constant in `src/protocol.rs`.
 */
export const ACK_MESSAGE = 'ACK: message received';
```

把 ACK 文案做成 contract 看起来有点小题大做，但它有实际价值。U4 的测试已经验证 Rust 返回 `ACK: message received`；U5 的 TypeScript 测试也用同一个常量断言成功响应。如果将来文案变成结构化 status，或者 ACK 只作为 debug 字段保留，修改会从一个清楚的 contract 点开始，而不是在测试和 UI 文案里四处替换。

## Ready notification 提前进入 TypeScript contract

U5 定义了一个 U4 Rust 端尚未发送的 notification 名称：

```ts
/**
 * JSON-RPC notification the backend emits exactly once, as soon as it is
 * listening and speaking JSON-RPC and before it handles any request.
 *
 * Must match the `BACKEND_READY_METHOD` constant in `src/protocol.rs`. The TUI
 * bounds startup readiness on this notification instead of the OS process-spawn
 * event, so a backend that spawns but never speaks is caught by the startup
 * timeout.
 */
export const BACKEND_READY_METHOD = 'kqode.backend.ready';
```

这不是记录 U4 已经具备的能力，而是为后续 launcher / client 单元提前固定 TypeScript 侧 contract。原因是 process spawn 成功不等于 backend 已经能说 JSON-RPC：子进程可能启动了，但卡在初始化、panic 前没有输出、或者 stdout/stderr wiring 有问题。`kqode.backend.ready` 的设计意图是让 TUI 等到 backend 明确发出 protocol-level readiness，而不是仅仅相信 OS process event。

## Params 和 result 保持最小

最后，U5 定义了请求和响应类型：

```ts
/**
 * Params for `kqode.message.submit`; intentionally text-only for this slice.
 *
 * The Rust backend deserializes this with serde `#[serde(deny_unknown_fields)]`
 * (`MessageSubmitParams` in `src/protocol.rs`), so adding a field here without
 * updating the Rust struct makes the backend reject the request as invalid
 * params. Keep the two shapes in lockstep.
 */
export type MessageSubmitParams = {
  text: string;
};

/** Result for `kqode.message.submit`. */
export type MessageSubmitResult = {
  message: string;
  receivedText: string;
};
```

`MessageSubmitParams` 故意只有 `text`。它没有 session id、model id、cwd、attachments 或工具配置，因为 U5 只记录第一条 ACK 通道。过早把完整 prompt payload 设计出来，会让后端 ACK proof 背上尚未验证的复杂性。更好的做法是先让最小协议跑通，再根据 agent loop、session store 和 UI 需求逐步扩展。

同时，注释明确提醒 Rust 端启用了 `deny_unknown_fields`。这让 TypeScript 类型不是“随便扩展一下也能跑”的假象，而是跨语言同步 contract：加字段就要同步改 Rust。
