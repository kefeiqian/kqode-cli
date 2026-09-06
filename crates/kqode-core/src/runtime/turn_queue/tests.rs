use std::sync::Arc;

use tokio::sync::oneshot;

use super::{DeleteResult, TurnQueue};

#[tokio::test]
async fn serializes_requests_for_one_conversation() {
    let queue = Arc::new(TurnQueue::default());
    let first = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let second_waiter = queue
        .enqueue_request("conversation-1", "message-2")
        .unwrap();
    let (acquired_tx, mut acquired_rx) = oneshot::channel();
    let second = tokio::spawn(async move {
        let turn = second_waiter.acquire().await.unwrap().unwrap();
        acquired_tx.send(()).unwrap();
        turn
    });

    tokio::task::yield_now().await;
    assert!(acquired_rx.try_recv().is_err());
    drop(first);
    acquired_rx.await.unwrap();
    drop(second.await.unwrap());
}

#[tokio::test]
async fn steer_cancels_active_and_promotes_target() {
    let queue = TurnQueue::default();
    let active = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let second = queue
        .enqueue_request("conversation-1", "message-2")
        .unwrap();
    let target = queue
        .enqueue_request("conversation-1", "message-3")
        .unwrap();

    let result = queue
        .steer_or_enqueue_request("conversation-1", "message-3")
        .unwrap()
        .unwrap();
    assert_eq!(result.active_request_id.as_deref(), Some("message-1"));
    assert!(result.waiter.is_none());
    assert!(active.cancellation().unwrap().is_cancelled());
    drop(active);

    let promoted = target.acquire().await.unwrap().unwrap();
    assert!(matches!(
        queue.delete_request("conversation-1", "message-2").unwrap(),
        DeleteResult::Deleted
    ));
    assert!(second.acquire().await.unwrap().is_none());
    drop(promoted);
}

#[tokio::test]
async fn allows_different_conversations_to_run_concurrently() {
    let queue = TurnQueue::default();
    let first = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap()
        .acquire()
        .await
        .unwrap();
    let second = queue
        .enqueue_request("conversation-2", "message-2")
        .unwrap()
        .acquire()
        .await
        .unwrap();

    assert!(first.is_some());
    assert!(second.is_some());
}

#[tokio::test]
async fn steer_can_start_a_persisted_unregistered_turn() {
    let queue = TurnQueue::default();

    let result = queue
        .steer_or_enqueue_request("conversation-1", "message-1")
        .unwrap()
        .unwrap();

    assert!(result.waiter.is_some());
    assert_eq!(
        queue
            .active_request_id("conversation-1")
            .unwrap()
            .as_deref(),
        Some("message-1")
    );
    assert!(result.waiter.unwrap().acquire().await.unwrap().is_some());
}
