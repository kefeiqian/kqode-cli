---
sidebar_position: 1
title: 1. U5 JSON-RPC 协议总览
---

U5 对应 tag [`U5`](https://github.com/kefeiqian/KQode/commit/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f)，提交是 [`ac566c70f9a1fdd1bfcb20e37b4d648f8402992f`](https://github.com/kefeiqian/KQode/commit/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f)，主题是 `feat(tui): define the JSON-RPC message protocol`。它的父提交是 U3 的 [`5432e018cb496e5f7359e69d47a2a7d1691c0794`](https://github.com/kefeiqian/KQode/commit/5432e018cb496e5f7359e69d47a2a7d1691c0794)，所以这组文章只记录 U5 这个 commit 自己新增的 TypeScript 侧协议定义、依赖和测试。

U5 映射计划文档里的 [`U5. Define the JSON-RPC message protocol`](https://github.com/kefeiqian/KQode/blob/17b51456a479ab5de20af403bf1668788099d076/docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md#u5-define-the-json-rpc-message-protocol)。它承接 U4 的 Rust ACK backend，但不负责启动 backend process，也不负责把 App submit 状态接到界面上。它做的是中间那层：在 TypeScript TUI 里定义一组稳定、可复用、可测试的 JSON-RPC contract。

## 这个 milestone 交付了什么

U5 新增了三个层次：

1. [`tui/src/contracts/backend/messages.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/messages.ts)：dependency-free wire contract，包含 method name、ACK 文案、ready notification 名称、params/result 类型。
2. [`tui/src/contracts/backend/client.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/client.ts)：TUI 面向 backend 的窄接口和错误分类。
3. [`tui/src/backend/protocol/messageProtocol.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/backend/protocol/messageProtocol.ts)：把 dependency-free contract 包装成 `vscode-jsonrpc` 的 `RequestType` 和 `NotificationType0`。

数据流可以这样理解：

```text
React / state 层
  -> 依赖 BackendClient seam
  -> submitMessage({ text })
  -> backend protocol 层使用 messageSubmitRequest
  -> vscode-jsonrpc 负责 request ID、framing、response promise
  -> Rust U4 backend 处理 kqode.message.submit
```

这个 milestone 的重点不是“把消息真的发到 Rust”。真正的 process launcher 和 client lifecycle 还在后续单元。U5 的重点是把协议名字、wire shape 和错误语义先固定下来，避免后续在 UI、state、process、transport 各层到处写字符串。

![U5 JSON-RPC 协议分层](../../images/u5-jsonrpc-protocol/protocol-layering.png)

## 文件地图 / 篇目

| 篇目 | 模块 | 本 milestone 中的作用 |
| --- | --- | --- |
| 01 | 总览 | 解释 U5 的交付范围、计划映射和 TypeScript 侧数据流。 |
| 02 | 协议消息类型与 contracts 边界 | 讲 [`messages.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/messages.ts) 如何定义 method、notification 和 message shape。 |
| 03 | `RequestType` 与通知描述符 | 讲 [`messageProtocol.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/backend/protocol/messageProtocol.ts) 如何把 contract 接入 `vscode-jsonrpc`。 |
| 04 | 错误分类与客户端 seam | 讲 [`client.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/client.ts) 如何隔离 UI 与 backend mechanics。 |
| 05 | 协议测试与依赖选择 | 讲 [`messageProtocol.test.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/backend/protocol/__tests__/messageProtocol.test.ts)、[`package.json`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/package.json) 与 `bun.lock` 的变化。 |
| 06 | U5 总结 | 总结已交付内容、关键技术决策和刻意延后内容。 |
