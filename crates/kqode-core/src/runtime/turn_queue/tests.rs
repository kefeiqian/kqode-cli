use std::sync::Arc;

use tokio::sync::oneshot;

use super::{DeleteResult, TurnQueue, TurnQueueError};

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
        .steer_request("conversation-1", "message-3")
        .unwrap()
        .unwrap();
    assert_eq!(result, "message-1");
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
async fn steer_leaves_unclaimed_persisted_turns_for_the_worker() {
    let queue = TurnQueue::default();
    let active = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();

    let active_request_id = queue
        .steer_request("conversation-1", "message-2")
        .unwrap()
        .unwrap();

    assert_eq!(active_request_id, "message-1");
    assert!(active.cancellation().unwrap().is_cancelled());
    drop(active);
    assert!(queue.active_request_id("conversation-1").unwrap().is_none());
}

#[tokio::test]
async fn abandoning_an_active_request_promotes_the_next_turn() {
    let queue = TurnQueue::default();
    let first = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap();
    let second = queue
        .enqueue_request("conversation-1", "message-2")
        .unwrap();

    first.abandon().unwrap();

    assert_eq!(
        queue
            .active_request_id("conversation-1")
            .unwrap()
            .as_deref(),
        Some("message-2")
    );
    assert!(second.acquire().await.unwrap().is_some());
}

#[tokio::test]
async fn dropping_an_unacquired_turn_releases_its_queue_entry() {
    let queue = TurnQueue::default();
    let first = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap();
    let second = queue
        .enqueue_request("conversation-1", "message-2")
        .unwrap();

    drop(first);

    assert_eq!(
        queue
            .active_request_id("conversation-1")
            .unwrap()
            .as_deref(),
        Some("message-2")
    );
    assert!(second.acquire().await.unwrap().is_some());
}

#[tokio::test]
async fn failed_durable_deletion_keeps_the_waiting_entry() {
    let queue = TurnQueue::default();
    let active = queue
        .enqueue_request("conversation-1", "message-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let waiting = queue
        .enqueue_request("conversation-1", "message-2")
        .unwrap();

    let result = queue.delete_request_with("conversation-1", "message-2", || {
        Err::<(), _>(TurnQueueError::Wait("durable deletion failed".to_owned()))
    });

    assert!(result.is_err());
    drop(active);
    assert!(waiting.acquire().await.unwrap().is_some());
}

#[tokio::test]
async fn failed_durable_steer_does_not_cancel_or_reorder_the_queue() {
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
    let _target = queue
        .enqueue_request("conversation-1", "message-3")
        .unwrap();

    let result = queue.steer_request_with("conversation-1", "message-3", |_| {
        Err::<(), _>(TurnQueueError::Wait("durable steering failed".to_owned()))
    });

    assert!(result.is_err());
    assert!(!active.cancellation().unwrap().is_cancelled());
    drop(active);
    assert!(second.acquire().await.unwrap().is_some());
}
