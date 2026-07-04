---
sidebar_position: 3
title: 3. JSON-RPC stdio 读写循环
---

U4 的 backend 选择复用 [`lsp-server`](https://crates.io/crates/lsp-server) 提供的 JSON-RPC stdio transport，而不是手写 `Content-Length` framing。提交在 [`Cargo.toml`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/Cargo.toml) 中新增了依赖：

```toml
[dependencies]
lsp-server = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

选择 `lsp-server` 的关键原因不是 KQode 要实现 LSP，而是它已经封装了与 VS Code 生态一致的 JSON-RPC stdio framing：读取 `Content-Length` header、解析 body、在线程里管理 reader/writer，并用 channel 暴露 `Message`。U4 只需要证明 backend request/response 行为，不需要在第一步就承担 transport parser 的 bug 风险。

[`src/backend.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/backend.rs) 的入口非常短：

```rust
/// Runs the internal JSON-RPC stdio backend until stdin closes.
///
/// # Errors
///
/// Returns an error when the transport threads fail or a response cannot be written.
pub fn run_stdio() -> Result<(), BackendError> {
    let (connection, io_threads) = Connection::stdio();
    match run_loop(connection) {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}
```

这段代码把生命周期分成两层：`run_loop` 处理业务消息；`io_threads.join()` 负责在 stdin 关闭后收尾 transport 线程。这样错误边界很清楚：如果业务 loop 正常结束，再检查 transport 线程是否有 framing 或 IO 错误；如果业务 loop 自己发现不可恢复错误，就直接返回。

## 消息循环只响应 request

U4 的 loop 对三类 JSON-RPC message 做了不同处理：

```rust
fn run_loop(connection: Connection) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                let response = handle_request(request);
                connection
                    .sender
                    .send(Message::Response(response))
                    .map_err(|error| {
                        BackendError::Transport(format!(
                            "failed to write JSON-RPC response: {error}"
                        ))
                    })?;
            }
            Message::Notification(_) => {}
            Message::Response(_) => {
                return Err(BackendError::Transport(
                    "backend received an unexpected JSON-RPC response".to_owned(),
                ));
            }
        }
    }

    Ok(())
}
```

这个分支体现了 U4 的协议边界：

- `Message::Request` 是唯一有业务意义的输入，因为 ACK backend 只支持 `kqode.message.submit` 请求。
- `Message::Notification` 被忽略，因为 U4 还没有 readiness、cancel 或 progress notification。
- `Message::Response` 被视为 fatal error，因为 backend 在这条连接里是 server 角色，不应该收到 response。

把 `Response` 当成错误很重要。如果 backend 不小心收到 response 还继续运行，就说明双方对连接角色的理解已经不一致。早失败比吞掉异常更适合协议初期，因为它能迫使测试和调用方把 wire contract 讲清楚。

## 为什么 notification 暂时忽略

U4 还没有实现 `kqode.backend.ready`。这不是遗漏，而是分层节奏：U4 只证明“请求进来，响应出去”；readiness notification 会在后续 TypeScript 协议与进程 launcher 接入时变得有意义。如果在 U4 里提前发送 ready，Rust 端会有一个没有前端消费的协议行为，反而扩大测试面。

因此，U4 的 stdio loop 是一个最小 server：能读、能处理、能写、能在 stdin 关闭后退出。它不负责进程启动策略，不负责 timeout，也不负责 UI 状态。这些都留给后续单元。
