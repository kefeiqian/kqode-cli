use std::{sync::Arc, time::Duration};

use kqode_core::runtime::QueuedTurn;

use super::service::{ConversationMessageStreamHandler, ConversationService};

const WORKER_POLL_INTERVAL: Duration = Duration::from_millis(500);

pub(crate) struct ConversationWorkItem {
    pub(crate) conversation_id: String,
    pub(crate) turn_id: String,
    pub(crate) queued: QueuedTurn,
}

pub(crate) type ConversationUpdateHandler = Arc<dyn Fn(&str) + Send + Sync>;

pub(crate) async fn run(
    service: ConversationService,
    stream_handler: ConversationMessageStreamHandler,
    update_handler: ConversationUpdateHandler,
) {
    loop {
        match service.claim_pending_work() {
            Ok(work_items) => {
                for work in work_items {
                    update_handler(&work.conversation_id);
                    let service = service.clone();
                    let stream_handler = stream_handler.clone();
                    let update_handler = update_handler.clone();
                    tokio::spawn(async move {
                        run_work(service, work, stream_handler, update_handler).await;
                    });
                }
            }
            Err(error) => eprintln!("poll queued conversation turns: {error}"),
        }
        tokio::time::sleep(WORKER_POLL_INTERVAL).await;
    }
}

async fn run_work(
    service: ConversationService,
    work: ConversationWorkItem,
    stream_handler: ConversationMessageStreamHandler,
    update_handler: ConversationUpdateHandler,
) {
    let conversation_id = work.conversation_id;
    let turn_id = work.turn_id;
    match service
        .run_queued(
            &conversation_id,
            &turn_id,
            work.queued,
            Some(stream_handler),
        )
        .await
    {
        Ok(result) => {
            if let Some(request) = result.title_generation
                && let Err(error) = service.generate_title(request).await
            {
                eprintln!("generate conversation title after turn {turn_id}: {error}");
            }
        }
        Err(error) => {
            if let Err(persist_error) =
                service.fail_pending_work(&conversation_id, &turn_id, &error.to_string())
            {
                eprintln!("persist failed conversation turn {turn_id}: {persist_error}");
            }
            eprintln!("run queued turn {turn_id}: {error}");
        }
    }
    update_handler(&conversation_id);
}
