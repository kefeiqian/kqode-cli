---
sidebar_position: 2
title: 2. JSON-RPC ready 信号与消息 framing
---

U6 的 `spawn` 事件只能说明 OS 已经创建进程。U7 进一步发现：对 TUI 来说，真正重要的是后端是否已经建立 stdio transport，并且能说 JSON-RPC。因此 U7 在 Rust backend 启动后先发一个 one-shot ready notification。

## Rust 侧新增 ready notification

[`src/protocol.rs`](https://github.com/kefeiqian/KQode/blob/7c9d43fa3af1413967813e51709ee6790151e8aa/src/protocol.rs) 新增了协议常量：

```rust
/// JSON-RPC notification the backend emits exactly once, immediately after its
/// stdio transport is live and before it handles any request.
///
/// It signals "I am listening and speaking JSON-RPC," so a client can bound
/// startup readiness on this notification instead of the OS process-spawn event
/// (a backend that spawns but never speaks would otherwise slip past the startup
/// timeout). The mirrored TypeScript constant lives in
/// `tui/src/contracts/backend/messages.ts` (`BACKEND_READY_METHOD`).
pub const BACKEND_READY_METHOD: &str = "kqode.backend.ready";
```

这个名字有两个取舍：

1. 它是 KQode 自有 method，不复用 LSP initialize。当前 backend 不是 language server，不应该继承 LSP 初始化语义。
2. 它是 notification，不是 request。ready 是单向事件，client 不需要回应，也不应该在启动阶段再引入一轮 request / response。

## run_stdio 先 announce，再进 loop

[`run_stdio`](https://github.com/kefeiqian/KQode/blob/7c9d43fa3af1413967813e51709ee6790151e8aa/src/backend.rs) 在进入 request loop 前调用 `announce_ready`：

```rust
pub fn run_stdio() -> Result<(), BackendError> {
    let (connection, io_threads) = Connection::stdio();
    announce_ready(&connection)?;
    match run_loop(connection) {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}
```

顺序很重要。如果先进入 loop，client 可能需要发送某个“探活 request”才能证明 backend ready；这会让第一个真实用户请求和 startup probe 纠缠在一起。先发 notification 的设计让 readiness 成为明确的协议事件。

## notification 没有 id

`announce_ready` 使用 `Message::Notification`：

```rust
fn announce_ready(connection: &Connection) -> Result<(), BackendError> {
    connection
        .sender
        .send(Message::Notification(Notification::new(
            BACKEND_READY_METHOD.to_owned(),
            (),
        )))
        .map_err(|error| {
            BackendError::Transport(format!("failed to send backend ready signal: {error}"))
        })
}
```

没有 `id` 的好处是 client 可以把它和 response 清晰地区分开。U6 的集成测试里已经需要跳过“启动后第一帧”；U7 把这个行为正式固化进 Rust 测试 helper。

## framing 仍然走 `Content-Length`

测试 helper [`parse_stdout_frames`](https://github.com/kefeiqian/KQode/blob/7c9d43fa3af1413967813e51709ee6790151e8aa/tests/common/rpc.rs) 明确按 LSP / JSON-RPC over stdio 的 framing 解析 stdout：

```rust
pub fn parse_stdout_frames(stdout: &[u8]) -> Vec<Value> {
    let mut frames = Vec::new();
    let mut offset = 0;

    while offset < stdout.len() {
        let relative_header_end = stdout[offset..]
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("frame header terminator exists");
        let header_end = offset + relative_header_end;
        let headers = std::str::from_utf8(&stdout[offset..header_end]).expect("headers are utf8");
```

这不是自定义一套协议，而是沿用成熟的 `Content-Length: N\r\n\r\n<body>` framing。原因很简单：stdio 是 byte stream，不是 message stream；如果只按换行拆 JSON，会在 pretty JSON、日志混入、Unicode 或大消息时变脆。

## response 测试必须先消费 ready

U7 修改后的 helper 先断言第一帧是 ready，再返回后续 response：

```rust
pub fn response_frames(stdout: &[u8]) -> Vec<Value> {
    let mut frames = parse_stdout_frames(stdout);
    assert!(
        !frames.is_empty(),
        "backend must emit a ready notification before any response"
    );
    let ready = frames.remove(0);
    assert_eq!(
        ready["method"], BACKEND_READY_METHOD,
        "first stdout frame must be the ready notification: {ready}"
    );
```

这个测试结构把协议约定写成了可执行文档：从 U7 开始，任何 backend run 都必须先发 ready notification，然后才会出现 request response。
