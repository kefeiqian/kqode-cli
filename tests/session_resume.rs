#[path = "common/rpc.rs"]
mod rpc;

use std::fs;

use kqode::protocol::{RpcMethod, SESSION_LIST_METHOD, SESSION_RESUME_METHOD};
use serde_json::json;

use rpc::{backend_output_in, parse_stdout_frames, request_frame, response_frames};

#[test]
fn session_list_is_empty_until_the_first_submit() {
    let home = tempfile::tempdir().expect("home");
    let workspace = tempfile::tempdir().expect("workspace");

    let output = backend_output_in(
        home.path(),
        workspace.path(),
        &request_frame(1, SESSION_LIST_METHOD, json!({})),
    );

    assert!(output.status.success(), "{output:?}");
    let response = response_frames(&output.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 1)
        .expect("list response");
    assert_eq!(response["result"], serde_json::json!({ "sessions": [] }));
}

#[test]
fn saved_session_lists_globally_and_resumes_into_its_original_workspace() {
    let home = tempfile::tempdir().expect("home");
    let workspace_one = tempfile::tempdir().expect("workspace one");
    let workspace_two = tempfile::tempdir().expect("workspace two");

    let submit = backend_output_in(
        home.path(),
        workspace_one.path(),
        &request_frame(
            1,
            RpcMethod::MessageSubmit.as_str(),
            json!({ "text": "resume me", "turnId": "turn-1" }),
        ),
    );
    assert!(submit.status.success(), "{submit:?}");

    let list = backend_output_in(
        home.path(),
        workspace_two.path(),
        &request_frame(2, SESSION_LIST_METHOD, json!({})),
    );
    assert!(list.status.success(), "{list:?}");
    let list_response = response_frames(&list.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 2)
        .expect("list response");
    let sessions = list_response["result"]["sessions"]
        .as_array()
        .expect("session rows");
    assert_eq!(sessions.len(), 1);
    let session = &sessions[0];
    assert_eq!(session["summary"], "resume me");
    assert_eq!(session["status"], "Idle");
    assert_eq!(
        session["folder"],
        workspace_one.path().display().to_string()
    );
    let session_id = session["sessionId"]
        .as_str()
        .expect("session id")
        .to_owned();

    let resume = backend_output_in(
        home.path(),
        workspace_two.path(),
        &request_frame(3, SESSION_RESUME_METHOD, json!({ "sessionId": session_id })),
    );
    assert!(resume.status.success(), "{resume:?}");
    let resume_response = response_frames(&resume.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 3)
        .expect("resume response");
    assert_eq!(
        resume_response["result"]["workspaceCwd"],
        workspace_one.path().display().to_string()
    );
    let turns = resume_response["result"]["turns"]
        .as_array()
        .expect("resumed turns");
    assert_eq!(turns.len(), 1);
    assert_eq!(turns[0]["prompt"], "resume me");
    assert_eq!(turns[0]["result"]["kind"], "needsConfiguration");
}

#[test]
fn resumed_session_is_marked_current_for_the_runtime_that_attached_it() {
    let home = tempfile::tempdir().expect("home");
    let workspace = tempfile::tempdir().expect("workspace");
    let submit = backend_output_in(
        home.path(),
        workspace.path(),
        &request_frame(
            1,
            RpcMethod::MessageSubmit.as_str(),
            json!({ "text": "current me", "turnId": "turn-1" }),
        ),
    );
    assert!(submit.status.success(), "{submit:?}");

    let list_before = backend_output_in(
        home.path(),
        workspace.path(),
        &request_frame(2, SESSION_LIST_METHOD, json!({})),
    );
    let session_id = response_frames(&list_before.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 2)
        .and_then(|frame| frame["result"]["sessions"].as_array().cloned())
        .and_then(|sessions| sessions.first().cloned())
        .and_then(|session| session["sessionId"].as_str().map(str::to_owned))
        .expect("session id");

    let attach_then_list = [
        request_frame(3, SESSION_RESUME_METHOD, json!({ "sessionId": session_id })),
        request_frame(4, SESSION_LIST_METHOD, json!({})),
    ]
    .concat();
    let output = backend_output_in(home.path(), workspace.path(), &attach_then_list);
    assert!(output.status.success(), "{output:?}");
    let frames = parse_stdout_frames(&output.stdout);
    let list_frame = frames
        .into_iter()
        .find(|frame| frame.get("id") == Some(&json!(4)))
        .expect("list response after resume");
    assert_eq!(list_frame["result"]["sessions"][0]["status"], "Current");

    let _ = fs::read_dir(home.path()).expect("home still exists");
}
