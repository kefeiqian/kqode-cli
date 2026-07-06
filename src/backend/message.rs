use std::sync::mpsc::Sender;

use lsp_server::{Request, Response};

use super::resolve::resolve_submit_config;
use crate::conversation::Command;
use crate::protocol::{JSON_RPC_INVALID_PARAMS, MessageSubmitParams, MessageSubmitResult};
use crate::store::Store;

/// Handles `kqode.message.submit`.
///
/// The ack only confirms the turn was accepted for enqueue. The coordinator
/// resolves terminal outcomes, including missing provider configuration, via
/// settled events.
pub(super) fn handle_message_submit(
    request: Request,
    coordinator: &Sender<Command>,
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
    let config = resolve_submit_config(store);
    let _ = coordinator.send(Command::Enqueue {
        turn_id: turn_id.clone(),
        prompt: text,
        config,
    });
    Response::new_ok(request.id, MessageSubmitResult { turn_id })
}
