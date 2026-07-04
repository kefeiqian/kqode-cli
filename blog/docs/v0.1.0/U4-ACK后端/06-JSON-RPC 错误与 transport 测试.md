---
sidebar_position: 6
title: 6. JSON-RPC 错误与 transport 测试
---

U4 不只测试 happy path。对于一个被 TUI 长期驱动的 backend process，错误分类同样重要：有些错误只是单次 request 的 JSON-RPC error，有些错误说明 transport 本身已经坏掉，必须让进程失败。

[`tests/common/rpc.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/common/rpc.rs) 里解析 stdout frame 的 helper 让错误响应也能按 JSON-RPC body 检查：

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
        let content_length = headers
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .expect("content length header exists")
            .parse::<usize>()
            .expect("content length is numeric");

        let body_start = header_end + 4;
        let body_end = body_start + content_length;
        frames.push(serde_json::from_slice(&stdout[body_start..body_end]).expect("valid json"));
        offset = body_end;
    }

    frames
}
```

## Request error 不等于进程失败

[`tests/json_rpc_errors.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests/json_rpc_errors.rs) 同时提交未知 method、类型错误 params 和未知字段 params：

```rust
#[test]
fn unsupported_method_and_invalid_params_return_json_rpc_errors() {
    let output = backend_output(
        &[
            request_frame(1, "kqode.unsupported", json!({ "text": "hello" })),
            request_frame(2, RpcMethod::MessageSubmit.as_str(), json!({ "text": 42 })),
            request_frame(
                3,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": "hello", "unexpected": true }),
            ),
        ]
        .concat(),
    );

    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[0]["error"]["code"], JSON_RPC_METHOD_NOT_FOUND);
    assert_eq!(frames[1]["id"], 2);
    assert_eq!(frames[1]["error"]["code"], JSON_RPC_INVALID_PARAMS);
    assert_eq!(frames[2]["id"], 3);
    assert_eq!(frames[2]["error"]["code"], JSON_RPC_INVALID_PARAMS);
}
```

注意这里 `output.status.success()` 仍然为真。WHY：未知 method 和 invalid params 属于可恢复 request-level error，server 应该返回 JSON-RPC error response 后继续处理后续请求，而不是把整个 backend process 退出掉。

## Fatal transport error 必须可见

同一个文件还覆盖 malformed JSON 和 unexpected response：

```rust
#[test]
fn malformed_transport_exits_with_visible_error() {
    let output = backend_output(b"Content-Length: 8\r\n\r\nnot json");

    assert!(!output.status.success(), "{output:?}");
    assert!(
        !output.stderr.is_empty(),
        "fatal transport errors should be visible"
    );
}

#[test]
fn unexpected_json_rpc_response_exits_with_visible_error() {
    let output = backend_output_without_closing_stdin(&response_frame(1));

    assert!(!output.status.success(), "{output:?}");
    assert!(!output.stderr.is_empty());
}
```

这类错误表示连接角色或 wire framing 已经不可信。继续运行只会让 TUI 和 backend 状态越来越难解释，所以 U4 选择失败并输出 stderr。后续 UI 可以把这种失败归为 backend lifecycle / transport 问题，而不是普通 submit error。

![U4 JSON-RPC 错误场景](../../images/u4-ack-backend/json-rpc-error-output.png)
