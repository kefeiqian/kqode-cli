#[path = "common/rpc.rs"]
mod rpc;

use std::fs;

use kqode::conversation::session_log::{SessionLogEvent, append_event};
use kqode::protocol::{SESSION_LIST_METHOD, SESSION_RESUME_METHOD};
use kqode::store::{Store, StoredSession};
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
fn saved_session_lists_globally_and_resumes_only_from_its_original_workspace() {
    let home = tempfile::tempdir().expect("home");
    let workspace_one = tempfile::tempdir().expect("workspace one");
    let workspace_two = tempfile::tempdir().expect("workspace two");
    let (session_id, workspace_one_canonical) =
        seed_session(home.path(), workspace_one.path(), "resume me");

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
    assert_eq!(session["folder"], workspace_one_canonical);
    assert_eq!(session["sessionId"], session_id);

    let wrong_workspace_resume = backend_output_in(
        home.path(),
        workspace_two.path(),
        &request_frame(3, SESSION_RESUME_METHOD, json!({ "sessionId": session_id })),
    );
    assert!(
        wrong_workspace_resume.status.success(),
        "{wrong_workspace_resume:?}"
    );
    let wrong_workspace_response = response_frames(&wrong_workspace_resume.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 3)
        .expect("wrong workspace resume response");
    assert!(
        wrong_workspace_response["error"]["message"]
            .as_str()
            .unwrap()
            .contains("does not match current workspace"),
        "{wrong_workspace_response:?}"
    );

    let resume = backend_output_in(
        home.path(),
        workspace_one.path(),
        &request_frame(4, SESSION_RESUME_METHOD, json!({ "sessionId": session_id })),
    );
    assert!(resume.status.success(), "{resume:?}");
    let resume_response = response_frames(&resume.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 4)
        .expect("resume response");
    assert_eq!(
        resume_response["result"]["workspaceCwd"],
        workspace_one_canonical
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
    let (session_id, _canonical) = seed_session(home.path(), workspace.path(), "current me");

    let list_before = backend_output_in(
        home.path(),
        workspace.path(),
        &request_frame(2, SESSION_LIST_METHOD, json!({})),
    );
    let listed_session_id = response_frames(&list_before.stdout)
        .into_iter()
        .find(|frame| frame["id"] == 2)
        .and_then(|frame| frame["result"]["sessions"].as_array().cloned())
        .and_then(|sessions| sessions.first().cloned())
        .and_then(|session| session["sessionId"].as_str().map(str::to_owned))
        .expect("session id");
    assert_eq!(listed_session_id, session_id);

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

fn seed_session(
    home: &std::path::Path,
    workspace: &std::path::Path,
    prompt: &str,
) -> (String, String) {
    let kqode_home = home.join(".kqode");
    let store = Store::open_or_bootstrap_at(kqode_home.join("kqode.db")).expect("store");
    let session_id = format!("sess-{}", prompt.replace(' ', "-"));
    let canonical = fs::canonicalize(workspace)
        .expect("canonical workspace")
        .display()
        .to_string();
    let session_log_path = kqode_home
        .join("sessions")
        .join(format!("{session_id}.jsonl"));
    append_event(
        &session_log_path,
        &SessionLogEvent::SessionStarted {
            session_id: session_id.clone(),
            created_at_ms: 10,
            workspace_cwd: canonical.clone(),
            canonical_workspace_cwd: canonical.clone(),
        },
    )
    .unwrap();
    append_event(
        &session_log_path,
        &SessionLogEvent::TurnEnqueued {
            turn_id: "turn-1".to_owned(),
            seq: 0,
            prompt: prompt.to_owned(),
            at_ms: 11,
        },
    )
    .unwrap();
    append_event(
        &session_log_path,
        &SessionLogEvent::TurnSettled {
            turn_id: "turn-1".to_owned(),
            settled_kind: "needsConfiguration".to_owned(),
            text: None,
            finish_reason: None,
            error_kind: Some("needsConfiguration".to_owned()),
            message: Some(
                "No provider configured. Use /connect to add a provider before sending messages."
                    .to_owned(),
            ),
            at_ms: 12,
        },
    )
    .unwrap();
    store
        .upsert_session(&StoredSession {
            id: session_id.clone(),
            created_at: 10,
            modified_at: 12,
            workspace_cwd: canonical.clone(),
            canonical_workspace_cwd: canonical.clone(),
            session_log_path: session_log_path.display().to_string(),
            first_prompt_summary: Some(prompt.to_owned()),
        })
        .unwrap();
    (session_id, canonical)
}
