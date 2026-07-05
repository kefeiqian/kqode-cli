#[path = "common/rpc.rs"]
mod rpc;

use std::{
    io::Write,
    process::{Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

use kqode::protocol::{
    BACKEND_MODE_ARG, JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND, RpcMethod,
};
use serde_json::json;

use rpc::{backend_output, request_frame, response_frames};

fn response_frame(id: i64) -> Vec<u8> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {},
    })
    .to_string();

    format!("Content-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
}

fn backend_output_without_closing_stdin(input: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_kqode"))
        .arg(BACKEND_MODE_ARG)
        // Keep the test-spawned backend from writing under the real
        // `~/.kqode/logs` (the dev build defaults debug logging on).
        .env("KQODE_DEBUG", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("backend process starts");

    child
        .stdin
        .as_mut()
        .expect("stdin is piped")
        .write_all(input)
        .expect("request is written");

    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        if child
            .try_wait()
            .expect("process status is available")
            .is_some()
        {
            drop(child.stdin.take());
            return child.wait_with_output().expect("backend output is read");
        }

        thread::sleep(Duration::from_millis(10));
    }

    let _ = child.kill();
    let output = child.wait_with_output().expect("backend output is read");
    panic!("backend did not exit before timeout: {output:?}");
}

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
    let frames = response_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[0]["error"]["code"], JSON_RPC_METHOD_NOT_FOUND);
    assert_eq!(frames[1]["id"], 2);
    assert_eq!(frames[1]["error"]["code"], JSON_RPC_INVALID_PARAMS);
    assert_eq!(frames[2]["id"], 3);
    assert_eq!(frames[2]["error"]["code"], JSON_RPC_INVALID_PARAMS);
}

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
