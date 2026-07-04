---
sidebar_position: 4
title: 4. ACK 请求协议与类型
---

U4 的协议文件是 [`src/protocol.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/protocol.rs)。它做的事情不多，但每一个常量都在为后续 Rust / TypeScript 对齐打基础：method name、ACK 文案、JSON-RPC error code、request params 和 response result 都集中在这里。

```rust
/// ACK text returned by the first-slice backend proof.
pub const ACK_MESSAGE: &str = "ACK: message received";

/// JSON-RPC code for method lookup failures.
pub const JSON_RPC_METHOD_NOT_FOUND: i32 = -32601;

/// JSON-RPC code for requests whose params do not match the method contract.
pub const JSON_RPC_INVALID_PARAMS: i32 = -32602;
```

这些值没有散落在 handler 或测试里，是因为 KQode 的约定是避免硬编码 protocol name、event name、status string 和不明显的数字。协议字符串一旦散落，后面 Rust 和 TypeScript 很容易改一边漏一边；集中常量虽然朴素，但可搜索、可复用、也方便测试直接引用。

## 用 enum 表达 method，而不是到处写字符串

U4 只有一个 method，但仍然定义了 `RpcMethod`：

```rust
/// KQode-owned JSON-RPC methods supported by this slice.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RpcMethod {
    MessageSubmit,
}

impl RpcMethod {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MessageSubmit => "kqode.message.submit",
        }
    }
}
```

这里的取舍是：为一个 method 写 enum 看起来比直接字符串更啰嗦，但它把“协议名是 KQode 拥有的枚举成员”这件事表达出来了。后续如果新增 `session.start`、`tool.call` 或 `backend.ready` 之类的事件，可以沿着同一个入口扩展，而不是在 handler、测试、前端 constants 里分别搜索字符串。

同时，`as_str` 返回 `&'static str`，让 handler 和测试都能使用同一 source of truth。U4 不需要复杂的 reverse mapping，因为当前只做 request dispatch；等 method 数量增加后，再决定是否需要 parse helper。

## params 严格，result 简单

`MessageSubmitParams` 只有一个字段 `text`，并且启用了 `deny_unknown_fields`：

```rust
/// Params for `kqode.message.submit`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MessageSubmitParams {
    pub text: String,
}

/// Result for `kqode.message.submit`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSubmitResult {
    pub message: &'static str,
    pub received_text: String,
}
```

`deny_unknown_fields` 是一个很关键的小决定。U4 的 backend 是第一个协议端点，如果它默默接受未知字段，前端就可能以为某个字段已经被 Rust 理解了。严格拒绝未知字段可以让协议演进必须显式发生：加字段时，TypeScript contract 和 Rust struct 必须一起更新。

`MessageSubmitResult` 使用 `rename_all = "camelCase"`，所以 Rust 字段 `received_text` 会在线上变成 JSON 的 `receivedText`。这让 Rust 代码保持 idiomatic snake_case，同时让前端得到 idiomatic TypeScript shape。它也预示了后续协议层的责任：Rust 内部命名和 wire 命名可以不同，但必须通过 serde 明确声明。

## handler 只做 dispatch 和反序列化

[`src/backend.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/backend.rs) 里的 request handler 故意保持很薄：

```rust
fn handle_request(request: Request) -> Response {
    if request.method != RpcMethod::MessageSubmit.as_str() {
        return Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        );
    }

    match serde_json::from_value::<MessageSubmitParams>(request.params) {
        Ok(params) => Response::new_ok(request.id, MessageSubmitResult::from(params)),
        Err(error) => Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            format!("invalid message submit params: {error}"),
        ),
    }
}
```

这里没有做复杂业务逻辑，因为 U4 的业务目标就是 ACK。真正值得验证的是：未知 method 返回 `-32601`，params 不符合 contract 返回 `-32602`，合法请求返回 result。把 handler 做薄也方便后续替换内部实现：将来 `MessageSubmitParams` 可能进入 agent loop、session store 或 tool scheduler，但 JSON-RPC dispatch 的错误语义不应该因此改变。
