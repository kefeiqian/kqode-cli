---
sidebar_position: 4
title: 4. 错误分类与客户端 seam
---

U5 不只定义 message shape，也定义了 TUI 面向 backend 的窄接口。这个接口位于 [`tui/src/contracts/backend/client.ts`](https://github.com/kefeiqian/KQode/blob/ac566c70f9a1fdd1bfcb20e37b4d648f8402992f/tui/src/contracts/backend/client.ts)。它同样放在 `contracts/backend` 下，原因是 UI 和 state 以后只应该依赖这个 seam，而不是依赖具体的 process launcher 或 `vscode-jsonrpc` connection。

文件顶部说明了这个边界：

```ts
/**
 * Consumer-facing backend seam shared by the `@state` and `@backend` layers.
 *
 * Like its sibling `messages.ts`, this module stays free of `@state`/`@backend`
 * and transport dependencies so both layers can depend on it without forming a
 * cycle. Implementations (process, connection, runtime wiring) live in `@backend`.
 */
```

这是一种“面向消费者的 contract”。React component 或 state atom 不需要知道 backend 是本地 Rust process、packaged executable、daemon，还是测试里的 fake client。它们只需要知道：我可以提交一段文本，要么得到 ACK result，要么得到一个分类明确的 backend error。

## 错误 kind 使用常量对象

U5 定义了 `BackendErrorKind`：

```ts
/** Backend failure categories surfaced to the TUI. */
export const BackendErrorKind = {
  /** JSON-RPC method/params error or an invalid response shape. */
  Protocol: 'protocol',
  /** Stream framing died or the child stdio closed unexpectedly. */
  Transport: 'transport',
  /** A startup or per-request deadline elapsed. */
  Timeout: 'timeout',
  /** The backend process could not be started. */
  Launch: 'launch'
} as const;

export type BackendErrorKind = (typeof BackendErrorKind)[keyof typeof BackendErrorKind];
```

它没有直接写成 `type BackendErrorKind = 'protocol' | 'transport' | ...`，而是用 `as const` 常量对象导出 runtime value 和 compile-time type。这样测试、实现和 UI 都可以引用 `BackendErrorKind.Protocol`，而不是重复写字符串。这个设计再次贯彻了“不要硬编码状态字符串”的项目约定。

四类错误也对应不同 UX 和恢复策略：

- `protocol`：请求 method、params 或 response shape 有问题，通常是前后端 contract 漂移。
- `transport`：stdio framing、stream 或 child pipe 出问题，说明连接不可靠。
- `timeout`：backend 没有在预期时间内 ready 或响应。
- `launch`：backend process 根本没能启动。

把这些早早区分出来，后续 UI 才能展示更有用的错误，而不是只显示一个泛化的 “backend failed”。

## 自定义 Error 保留 cause

U5 的错误类型是一个小的 `Error` 子类：

```ts
/** Error raised when a backend request cannot complete. */
export class BackendClientError extends Error {
  readonly kind: BackendErrorKind;

  constructor(kind: BackendErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackendClientError';
    this.kind = kind;
  }
}
```

这个类型的目标不是创建复杂异常体系，而是让上层可以稳定地检查 `kind`。`cause` 保留底层错误，方便调试 `vscode-jsonrpc` 或 child process 失败，但 UI 不需要把底层 exception 类型暴露给用户。

## `BackendClient` 是第一版窄 seam

最后，U5 定义了 TUI 使用的最小 backend client：

```ts
/**
 * Narrow backend seam the TUI uses for the first-slice ACK protocol.
 *
 * `submitMessage` resolves with the backend ACK result or rejects with a
 * {@link BackendClientError}; display components depend only on this interface
 * so process and protocol mechanics stay out of the render tree.
 */
export type BackendClient = {
  submitMessage(params: MessageSubmitParams): Promise<MessageSubmitResult>;
};
```

这个接口只有一个方法，是因为 U5 只服务第一条 ACK flow。它没有提前加入 `startSession`、`cancelRequest`、`shutdown` 或 `streamEvents`。这些能力都可能需要，但要等对应 milestone 真正实现时再进入 seam。窄接口的好处是替换实现很容易：测试 fake、message connection client、process client 都可以实现同一个 `submitMessage`。

从架构上看，U5 在这里做了一次“提前隔离”：UI 以后不直接 import protocol descriptor，也不直接操作 JSON-RPC connection。它只面对 `BackendClient`。这能防止 transport 细节泄漏进 render tree，让后续重构 backend lifecycle 时不必改 UI 组件。
