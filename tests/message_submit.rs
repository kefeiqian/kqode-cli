#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::{
    BACKEND_READY_METHOD, RpcMethod, SETTLED_KIND_NEEDS_CONFIGURATION, TURN_ENQUEUED_METHOD,
    TURN_SETTLED_METHOD,
};
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
    assert!(
        frames[0]["params"]["sessionId"]
            .as_str()
            .is_some_and(|id| !id.is_empty()),
        "ready notification must carry a non-empty sessionId: {}",
        frames[0]
    );
}

#[test]
fn message_submit_without_key_settles_needs_configuration() {
    // With no API key (forced by the harness), submit must still be accepted.
    // The coordinator then settles the turn to configuration-required.
    let output = backend_output(&request_frame(
        1,
        RpcMethod::MessageSubmit.as_str(),
        json!({ "text": "hello from tui", "turnId": "turn-1" }),
    ));

    assert!(output.status.success(), "{output:?}");

    let all_frames = parse_stdout_frames(&output.stdout);
    assert!(
        all_frames
            .iter()
            .any(|frame| frame["method"] == TURN_ENQUEUED_METHOD),
        "expected an enqueue notification: {all_frames:?}"
    );
    assert!(
        all_frames
            .iter()
            .any(|frame| frame["method"] == TURN_SETTLED_METHOD),
        "expected a settled notification: {all_frames:?}"
    );
    assert!(
        all_frames
            .iter()
            .any(|frame| frame["method"] == TURN_SETTLED_METHOD
                && frame["params"]["result"]["kind"] == SETTLED_KIND_NEEDS_CONFIGURATION),
        "expected a needs-configuration settlement: {all_frames:?}"
    );

    let frames = response_frames(&output.stdout);
    let response = frames.iter().find(|frame| frame["id"] == 1).unwrap();
    assert_eq!(response["result"]["turnId"], "turn-1");
    assert!(
        response["result"].get("status").is_none(),
        "submit ack no longer carries status: {response:?}"
    );
}

#[test]
fn message_submit_echoes_the_client_turn_id_for_each_submit() {
    let output = backend_output(
        &[
            request_frame(
                1,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": "first", "turnId": "turn-a" }),
            ),
            request_frame(
                2,
                RpcMethod::MessageSubmit.as_str(),
                json!({ "text": "", "turnId": "turn-b" }),
            ),
        ]
        .concat(),
    );

    assert!(output.status.success(), "{output:?}");
    let frames = response_frames(&output.stdout);
    let first = frames.iter().find(|frame| frame["id"] == 1).unwrap();
    let second = frames.iter().find(|frame| frame["id"] == 2).unwrap();
    assert_eq!(first["result"]["turnId"], "turn-a");
    assert!(first["result"].get("status").is_none());
    assert_eq!(second["result"]["turnId"], "turn-b");
    assert!(second["result"].get("status").is_none());
}
