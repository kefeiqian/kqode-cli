#[path = "common/rpc.rs"]
mod rpc;

use kqode::protocol::RpcMethod;
use serde_json::json;

use rpc::{backend_output, request_frame, response_frames};

#[test]
fn git_status_returns_a_formatted_label_for_the_workspace() {
    // The integration harness spawns the backend with the crate root as its cwd,
    // which is the KQode git repository, so the status query resolves a branch.
    // Branch name and dirty flags are non-deterministic, so assert only the
    // stable shape: a non-null label beginning with the branch glyph.
    let output = backend_output(&request_frame(
        1,
        RpcMethod::GitStatus.as_str(),
        json!(null),
    ));

    assert!(output.status.success(), "{output:?}");

    let frames = response_frames(&output.stdout);
    assert_eq!(
        frames.len(),
        1,
        "expected one git status response after the ready notification: {frames:?}"
    );
    assert_eq!(frames[0]["id"], 1);

    let label = frames[0]["result"]["label"]
        .as_str()
        .expect("git status label is a string inside the KQode repository");
    assert!(
        label.starts_with("⎇ "),
        "label should start with the branch glyph: {label}"
    );
    assert!(
        frames[0]["result"]["pullRequestLabel"].is_null()
            || frames[0]["result"]["pullRequestLabel"].is_string(),
        "pull request label should be null or a string"
    );
    assert!(
        frames[0]["result"]["pullRequestUrl"].is_null()
            || frames[0]["result"]["pullRequestUrl"].is_string(),
        "pull request url should be null or a string"
    );
}
