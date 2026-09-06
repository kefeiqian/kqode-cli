use tauri::AppHandle;

use super::events::{emit_update, stream_handler};
use crate::conversation::{
    service::{ConversationService, SendMessageResult},
    store::Conversation,
};
use kqode_core::runtime::QueuedTurn;

pub(super) fn finish_send(
    app: AppHandle,
    service: ConversationService,
    result: SendMessageResult,
) -> Result<Conversation, String> {
    let conversation = service
        .with_active_turn(result.conversation)
        .map_err(|error| error.to_string())?;
    emit_update(&app, &conversation);
    if let Some(request) = result.title_generation {
        tauri::async_runtime::spawn(async move {
            match service.generate_title(request).await {
                Ok(Some(conversation)) => emit_update(&app, &conversation),
                Ok(None) => {}
                Err(error) => eprintln!("generate conversation title: {error}"),
            }
        });
    }
    Ok(conversation)
}

pub(super) fn run_queued(
    app: AppHandle,
    service: ConversationService,
    conversation_id: String,
    turn_id: String,
    queued: QueuedTurn,
) {
    tauri::async_runtime::spawn(async move {
        match service
            .run_queued(
                &conversation_id,
                &turn_id,
                queued,
                Some(stream_handler(&app)),
            )
            .await
        {
            Ok(result) => {
                if let Err(error) = finish_send(app, service, result) {
                    eprintln!("finish steered turn {turn_id}: {error}");
                }
            }
            Err(error) => eprintln!("run steered turn {turn_id}: {error}"),
        }
    });
}
