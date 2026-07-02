#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::{ACK_MESSAGE, BACKEND_READY_METHOD, RpcMethod};
use serde_json::json;

use rpc::{backend_output, parse_stdout_frames, request_frame, response_frames};

#[test]
fn backend_announces_ready_before_handling_requests() {
    // Close stdin with no request: the backend's only output must be the
    // one-shot ready notification it emits before entering its request loop.
    let output = backend_output(&[]);

    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    assert_eq!(
        frames.len(),
        1,
        "startup with no request must emit only the ready notification: {frames:?}"
    );
    assert_eq!(frames[0]["jsonrpc"], "2.0");
    assert_eq!(frames[0]["method"], BACKEND_READY_METHOD);
    assert!(
        frames[0].get("id").is_none(),
        "ready is a notification, not a response: {}",
        frames[0]
    );
}

#[test]
fn message_submit_returns_ack_with_received_text() {
    let output = backend_output(&request_frame(
        1,
        RpcMethod::MessageSubmit.as_str(),
        json!({ "text": "hello from tui" }),
    ));

    assert!(output.status.success(), "{output:?}");
    let frames = response_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[0]["result"]["message"], ACK_MESSAGE);
    assert_eq!(frames[0]["result"]["receivedText"], "hello from tui");
}

#[test]
fn message_submit_preserves_unicode_newlines_and_empty_text() {
    let text = "  hello\nfrom tui 🌱  ";
    let output = backend_output(
        &[
            request_frame(
                1,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": text }),
            ),
            request_frame(2, RpcMethod::MessageSubmit.as_str(), json!({ "text": "" })),
        ]
        .concat(),
    );

    assert!(output.status.success(), "{output:?}");
    let frames = response_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[1]["id"], 2);
    assert_eq!(frames[0]["result"]["receivedText"], text);
    assert_eq!(frames[1]["result"]["receivedText"], "");
}
