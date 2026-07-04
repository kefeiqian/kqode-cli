---
sidebar_position: 5
title: 5. CLI 与 ACK 成功路径测试
---

U4 的测试从进程边界开始，而不是只测 Rust 函数。原因是这个 milestone 的真实风险在 binary invocation、隐藏参数、stdio pipe 和 JSON-RPC frame：后续 TUI 也会启动一个 child process，所以测试应该尽早站在同样的位置。

[`tests/common/cli.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/common/cli.rs) 用 Cargo 注入的 binary 路径启动 `kqode`：

```rust
use std::process::{Command, Output};

pub fn run_cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_kqode"))
        .args(args)
        .output()
        .expect("binary runs")
}
```

这样测到的是最终可执行文件，而不是 library 函数。U4 还用 [`tests/cli_invocation.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/cli_invocation.rs) 固定三条 CLI 语义：未知参数失败、backend mode 不接受额外参数、默认 invocation 保持 harmless starter message。

```rust
#[test]
fn backend_mode_rejects_extra_arguments() {
    let output = run_cli(&[BACKEND_MODE_ARG, "extra"]);

    assert!(!output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stderr).contains("extra argument"));
}

#[test]
fn default_invocation_stays_harmless() {
    let output = run_cli(&[]);

    assert!(output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stdout).contains("KQode starter CLI"));
}
```

这里的 WHY 是可诊断性。Backend mode 以后会由 TUI 自动启动，参数错误应该立刻以非零退出和 stderr 暴露；默认命令则不能阻塞等待 JSON-RPC frame，否则人类开发者运行 `cargo run` 会以为程序卡住了。

## 构造真实 JSON-RPC frame

[`tests/common/rpc.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/common/rpc.rs) 自己拼 `Content-Length` frame：

```rust
pub fn request_frame(id: i64, method: &str, params: Value) -> Vec<u8> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
    .to_string();

    format!("Content-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
}
```

测试 helper 没有复用 `lsp-server` 来发送请求，是有意的。被测 backend 已经使用 `lsp-server`；测试端手写 frame 可以更像独立前端进程，也避免 client 和 server 使用同一套 abstraction 后互相掩盖 framing 问题。

## ACK 成功路径验证文本保真

[`tests/message_submit.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/message_submit.rs) 先验证基本 ACK：

```rust
#[test]
fn message_submit_returns_ack_with_received_text() {
    let output = backend_output(&request_frame(
        1,
        RpcMethod::MessageSubmit.as_str(),
        json!({ "text": "hello from tui" }),
    ));

    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[0]["result"]["message"], ACK_MESSAGE);
    assert_eq!(frames[0]["result"]["receivedText"], "hello from tui");
}
```

另一条测试提交 Unicode、换行、前后空格和空字符串。这个选择不是为了凑边界条件，而是在固定 agent prompt 的基本语义：用户输入跨进程传输时不能被 trim、normalize 或丢失。

![U4 ACK 成功响应测试](../../images/u4-ack-backend/message-submit-test.png)
