use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::chat::spawn_streaming_turn;
use crate::config::KimiConfig;
use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, MessageSubmitParams, MessageSubmitResult,
    SUBMIT_STATUS_NEEDS_CONFIGURATION, SUBMIT_STATUS_STREAMING,
};

/// Handles `kqode.message.submit`.
///
/// When a Kimi key is configured it spawns a streaming turn and returns
/// `streaming`; otherwise it returns `needsConfiguration`.
pub(super) fn handle_message_submit(request: Request, connection: &Connection) -> Response {
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
    match KimiConfig::from_env() {
        Err(_) => Response::new_ok(
            request.id,
            MessageSubmitResult {
                turn_id,
                status: SUBMIT_STATUS_NEEDS_CONFIGURATION,
            },
        ),
        Ok(config) => {
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
