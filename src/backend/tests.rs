use lsp_server::{Connection, Message, Request, RequestId};

use super::*;
use crate::conversation::{Coordinator, SessionPersistence};
use crate::conversation::session_log::SessionLogEvent;
use crate::protocol::{SESSION_LIST_METHOD, SESSION_RESUME_METHOD};
use crate::store::StoredSession;

#[test]
fn set_key_rejects_bad_custom_url_immediately_without_worker() {
    let (backend, client) = Connection::memory();
    let (coordinator, _receiver) = std::sync::mpsc::channel();
    let request = Request {
        id: RequestId::from(1),
        method: crate::protocol::PROVIDER_SET_KEY_METHOD.to_owned(),
        params: serde_json::json!({
            "providerId": "custom",
            "baseUrl": "http://example.test/v1",
            "apiKey": "sk-pre-network",
            "label": null
        }),
    };

    let dir = tempfile::tempdir().unwrap();
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();
    let response =
        handle_request(request, &backend, &store, &coordinator).expect("immediate error");

    assert_eq!(response.error.unwrap().code, JSON_RPC_INVALID_PARAMS);
    assert!(
        client.receiver.try_recv().is_err(),
        "no deferred worker sent a response"
    );
}

#[test]
fn store_failure_returns_before_ready_or_loop() {
    let (backend, client) = Connection::memory();
    client
        .sender
        .send(Message::Request(Request {
            id: RequestId::from(1),
            method: RpcMethod::MessageSubmit.as_str().to_owned(),
            params: serde_json::json!({ "text": "hello", "turnId": "turn-1" }),
        }))
        .unwrap();

    let result = run_stdio_with_store_result(backend, Err(StoreError::NoPath), "session-test");

    assert!(matches!(
        result,
        Err(BackendError::Store(StoreError::NoPath))
    ));
    assert!(
        client.receiver.try_recv().is_err(),
        "store failure must not emit ready or handle queued requests"
    );
}

#[test]
fn healthy_store_announces_ready_before_loop() {
    let (backend, client) = Connection::memory();
    let Connection {
        sender: client_sender,
        receiver: client_receiver,
    } = client;
    drop(client_sender);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();

    run_stdio_with(backend, &store, "session-test").unwrap();

    let ready = client_receiver.try_recv().expect("ready notification");
    match ready {
        Message::Notification(notification) => {
            assert_eq!(notification.method, BACKEND_READY_METHOD);
        }
        other => panic!("expected ready notification, got {other:?}"),
    }
    assert!(
        client_receiver.try_recv().is_err(),
        "no request loop responses should be emitted after client closes"
    );
}

#[test]
fn session_resume_attaches_and_marks_the_row_current() {
    let (backend, _client) = Connection::memory();
    let dir = tempfile::tempdir().unwrap();
    let session_log_path = dir.path().join("sessions").join("sess-1.jsonl");
    std::fs::create_dir_all(session_log_path.parent().unwrap()).unwrap();
    let log = [
        SessionLogEvent::SessionStarted {
            session_id: "sess-1".to_owned(),
            created_at_ms: 10,
            workspace_cwd: "C:\\workspace".to_owned(),
            canonical_workspace_cwd: "C:\\workspace".to_owned(),
        },
        SessionLogEvent::TurnEnqueued {
            turn_id: "turn-1".to_owned(),
            seq: 0,
            prompt: "hello".to_owned(),
            at_ms: 11,
        },
        SessionLogEvent::TurnSettled {
            turn_id: "turn-1".to_owned(),
            settled_kind: "completed".to_owned(),
            text: Some("done".to_owned()),
            finish_reason: None,
            error_kind: None,
            message: None,
            at_ms: 12,
        },
    ]
    .into_iter()
    .map(|event| serde_json::to_string(&event).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&session_log_path, format!("{log}\n")).unwrap();

    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();
    store
        .upsert_session(&StoredSession {
            id: "sess-1".to_owned(),
            created_at: 10,
            modified_at: 12,
            workspace_cwd: "C:\\workspace".to_owned(),
            canonical_workspace_cwd: "C:\\workspace".to_owned(),
            session_log_path: session_log_path.display().to_string(),
            first_prompt_summary: Some("hello".to_owned()),
        })
        .unwrap();

    let coordinator = Coordinator::start(
        |_event: ConversationEvent| {},
        Box::new(SessionPersistence::new(store.clone())),
    );
    let sender = coordinator.sender();

    let resume = handle_request(
        Request {
            id: RequestId::from(1),
            method: SESSION_RESUME_METHOD.to_owned(),
            params: serde_json::json!({ "sessionId": "sess-1" }),
        },
        &backend,
        &store,
        &sender,
    )
    .expect("resume response");
    assert!(resume.error.is_none(), "{resume:?}");

    let list = handle_request(
        Request {
            id: RequestId::from(2),
            method: SESSION_LIST_METHOD.to_owned(),
            params: serde_json::json!({}),
        },
        &backend,
        &store,
        &sender,
    )
    .expect("list response");
    assert_eq!(
        list.result.unwrap(),
        serde_json::json!({
            "sessions": [{
                "sessionId": "sess-1",
                "summary": "hello",
                "status": "Current",
                "modifiedAt": 12,
                "createdAt": 10,
                "folder": "C:\\workspace"
            }]
        })
    );

    coordinator.shutdown_and_join();
}
