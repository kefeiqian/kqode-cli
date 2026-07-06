use std::sync::mpsc::Sender;

use lsp_server::{Request, Response};

use super::resolve::resolve_submit_config;
use crate::conversation::Command;
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
    let status = if config.is_some() {
        SUBMIT_STATUS_STREAMING
    } else {
        SUBMIT_STATUS_NEEDS_CONFIGURATION
    };
    let _ = coordinator.send(Command::Enqueue {
        turn_id: turn_id.clone(),
        prompt: text,
        config,
    });
    Response::new_ok(request.id, MessageSubmitResult { turn_id, status })
}
