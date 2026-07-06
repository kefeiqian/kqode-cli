#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::{
    RpcMethod, SETTLED_KIND_NEEDS_CONFIGURATION, SUBMIT_STATUS_NEEDS_CONFIGURATION,
    TURN_ENQUEUED_METHOD, TURN_ERROR_METHOD, TURN_SETTLED_METHOD,
};
use serde_json::json;

use rpc::{backend_output, parse_stdout_frames, request_frame};

#[test]
fn submit_without_key_emits_queue_lifecycle_and_legacy_terminal() {
    let output = backend_output(&request_frame(
        1,
        RpcMethod::MessageSubmit.as_str(),
        json!({ "text": "hello from tui", "turnId": "turn-1" }),
    ));

    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    assert!(
        frames
            .iter()
            .any(|frame| frame["method"] == TURN_ENQUEUED_METHOD
                && frame["params"]["turnId"] == "turn-1"
                && frame["params"]["state"] == "active"),
        "missing active enqueue: {frames:?}"
    );
    assert!(
        frames
            .iter()
            .any(|frame| frame["method"] == TURN_SETTLED_METHOD
                && frame["params"]["turnId"] == "turn-1"
                && frame["params"]["result"]["kind"] == SETTLED_KIND_NEEDS_CONFIGURATION),
        "missing needs-configuration settlement: {frames:?}"
    );
    assert!(
        frames
            .iter()
            .any(|frame| frame["method"] == TURN_ERROR_METHOD
                && frame["params"]["turnId"] == "turn-1"),
        "missing legacy terminal error: {frames:?}"
    );
    assert!(
        frames.iter().any(|frame| frame["id"] == 1
            && frame["result"]["status"] == SUBMIT_STATUS_NEEDS_CONFIGURATION),
        "missing needs-configuration ack: {frames:?}"
    );
}

#[test]
fn turn_cancel_request_is_accepted() {
    let output = backend_output(&request_frame(
        1,
        RpcMethod::TurnCancel.as_str(),
        json!({ "turnId": "missing-active" }),
    ));

    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    assert!(
        frames
            .iter()
            .any(|frame| frame["id"] == 1 && frame["result"]["ok"] == true),
        "missing cancel ack: {frames:?}"
    );
}
