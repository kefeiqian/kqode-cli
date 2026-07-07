use lsp_server::{Connection, Message, Request, RequestId};

use super::*;

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
