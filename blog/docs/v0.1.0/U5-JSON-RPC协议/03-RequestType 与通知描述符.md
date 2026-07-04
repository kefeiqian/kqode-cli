---
sidebar_position: 3
title: 3. RequestType 与通知描述符
---

[`tui/src/backend/protocol/messageProtocol.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/backend/protocol/messageProtocol.ts) 是 U5 把 dependency-free contract 接到 `vscode-jsonrpc` 的地方。它不重新定义 method name，也不重新定义 params/result shape，而是 import `@contracts/backend` 中的常量和类型。

```ts
import { NotificationType0, RequestType } from 'vscode-jsonrpc';
import { BACKEND_READY_METHOD, MESSAGE_SUBMIT_METHOD } from '@contracts/backend/index.ts';
import type { MessageSubmitParams, MessageSubmitResult } from '@contracts/backend/index.ts';
```

这种分层让 `vscode-jsonrpc` 只出现在真正需要 transport descriptor 的 backend protocol 层。UI、state 和纯 contract 模块不需要知道 `RequestType` 是什么，也不需要 import transport library。

## 用 `RequestType` 描述 request，而不是直接发字符串

U5 为 `kqode.message.submit` 创建了一个 typed request descriptor：

```ts
/**
 * Typed request descriptor for `kqode.message.submit`.
 *
 * Routing the method through a single `RequestType` keeps the KQode-owned method
 * name out of call sites while `vscode-jsonrpc` owns request IDs and framing. The
 * method name and wire shapes come from the dependency-free `@contracts` seam.
 */
export const messageSubmitRequest = new RequestType<MessageSubmitParams, MessageSubmitResult, void>(
  MESSAGE_SUBMIT_METHOD
);
```

`RequestType<MessageSubmitParams, MessageSubmitResult, void>` 同时表达了三件事：请求 params 的形状、响应 result 的形状、以及这个 request 不使用自定义 error data。后续 client 发送请求时，可以传这个 descriptor，而不是手写 method string 和泛型。

这里的 WHY 很关键：`vscode-jsonrpc` 负责 request ID、framing 和 promise wiring；KQode 自己负责 method name 和 wire shape。两者边界清楚以后，协议代码既不会把 KQode 的 string 到处散落，也不会自己重造 JSON-RPC runtime。

## Notification descriptor 先定义 ready 语义

U5 还创建了 backend ready notification descriptor：

```ts
/**
 * Typed descriptor for the backend's one-shot readiness notification.
 *
 * The backend sends this parameterless notification the moment it can serve
 * JSON-RPC; the client resolves startup on it (see `waitForBackendReady`). The
 * method name comes from the same dependency-free `@contracts` seam so the Rust
 * and TypeScript sides stay in lockstep.
 */
export const backendReadyNotification = new NotificationType0(BACKEND_READY_METHOD);
```

`NotificationType0` 表示这个 notification 没有 params。这是有意为之：readiness 只回答“backend 已经能处理 JSON-RPC 了吗”，不携带版本、capabilities 或 workspace 信息。那些信息以后可能需要，但不应该塞进第一版 ready notification。保持参数为空，可以避免 readiness 变成另一个早期过度设计点。

## 为什么 descriptor 层不做 process lifecycle

这个文件没有 `spawn`、没有 timeout、没有 stdout/stderr 管理，也没有 `dispose`。这些缺失不是功能不完整，而是 U5 的边界：它只定义 protocol descriptor。真正的 process JSON-RPC client 会在后续单元把 descriptor、child process、stream reader/writer 和 error mapping 组合起来。

如果 U5 直接实现完整 client，协议定义、process 启动、cleanup、timeout 和 UI 行为会混在一个 commit 里。那样即使测试通过，也很难 review 到底哪一层出了问题。把 descriptor 先单独提交，后续每个单元都能复用稳定的 protocol surface。

![U5 request descriptor 到 backend client 的关系](../../images/u5-jsonrpc-protocol/request-descriptor.png)
