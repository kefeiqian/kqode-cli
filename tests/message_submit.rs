#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::{ACK_MESSAGE, RpcMethod};
use serde_json::json;

use rpc::{backend_output, parse_stdout_frames, request_frame};

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
    let frames = parse_stdout_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(frames[1]["id"], 2);
    assert_eq!(frames[0]["result"]["receivedText"], text);
    assert_eq!(frames[1]["result"]["receivedText"], "");
}
