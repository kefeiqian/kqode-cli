#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::{BACKEND_READY_METHOD, RpcMethod, SUBMIT_STATUS_NEEDS_CONFIGURATION};
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
fn message_submit_without_key_returns_needs_configuration() {
    // With no API key (forced by the harness), submit must return an immediate
    // ack routing the user to configuration and must not stream any tokens.
    let output = backend_output(&request_frame(
        1,
        RpcMethod::MessageSubmit.as_str(),
        json!({ "text": "hello from tui" }),
    ));

    assert!(output.status.success(), "{output:?}");

    let all_frames = parse_stdout_frames(&output.stdout);
    assert_eq!(
        all_frames.len(),
        2,
        "expected only the ready notification and one ack response: {all_frames:?}"
    );

    let frames = response_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(
        frames[0]["result"]["status"],
        SUBMIT_STATUS_NEEDS_CONFIGURATION
    );
}

#[test]
fn message_submit_answers_each_request_with_needs_configuration() {
    let output = backend_output(
        &[
            request_frame(
                1,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": "first" }),
            ),
            request_frame(
                2,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": "" }),
            ),
        ]
        .concat(),
    );

    assert!(output.status.success(), "{output:?}");
    let frames = response_frames(&output.stdout);
    assert_eq!(frames[0]["id"], 1);
    assert_eq!(
        frames[0]["result"]["status"],
        SUBMIT_STATUS_NEEDS_CONFIGURATION
    );
    assert_eq!(frames[1]["id"], 2);
    assert_eq!(
        frames[1]["result"]["status"],
        SUBMIT_STATUS_NEEDS_CONFIGURATION
    );
}
