use lsp_server::{Connection, Message, Notification, Request, Response};

use super::resolve::resolve_submit_config;
use crate::chat::spawn_streaming_turn;
use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, MessageSubmitParams, MessageSubmitResult,
    SUBMIT_STATUS_NEEDS_CONFIGURATION, SUBMIT_STATUS_STREAMING,
};
use crate::store::Store;

/// Handles `kqode.message.submit`.
///
/// When the active or effective-default provider config resolves it spawns a
/// streaming turn and returns `streaming`; otherwise it returns
/// `needsConfiguration`.
pub(super) fn handle_message_submit(
    request: Request,
    connection: &Connection,
    store: Option<&Store>,
) -> Response {
    let params = match serde_json::from_value::<MessageSubmitParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid message submit params: {error}"),
            );
        }
    };
    let MessageSubmitParams { text, turn_id } = params;
    match resolve_submit_config(store) {
        None => Response::new_ok(
            request.id,
            MessageSubmitResult {
                turn_id,
                status: SUBMIT_STATUS_NEEDS_CONFIGURATION,
            },
        ),
        Some(config) => {
            let sender = connection.sender.clone();
            let emit = move |notification: Notification| {
                let _ = sender.send(Message::Notification(notification));
            };
            spawn_streaming_turn(turn_id.clone(), text, config, emit);
            Response::new_ok(
                request.id,
                MessageSubmitResult {
                    turn_id,
                    status: SUBMIT_STATUS_STREAMING,
                },
            )
        }
    }
}
