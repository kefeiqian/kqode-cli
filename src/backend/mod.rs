use std::{error::Error, fmt};

use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::debug_log;
use crate::protocol::{
    BackendReadyParams, ClearKeyParams, RpcMethod, SelectionSetParams, BACKEND_READY_METHOD,
    JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND,
};
use crate::store::Store;

mod git_status;
mod login;
mod message;
mod providers;
mod resolve;

#[derive(Debug)]
pub enum BackendError {
    Transport(String),
}

impl fmt::Display for BackendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transport(message) => formatter.write_str(message),
        }
    }
}

impl Error for BackendError {}

/// Runs the internal JSON-RPC stdio backend until stdin closes.
///
/// Loads a `.env` file (if present) into the process environment first so the
/// Kimi provider can read `KIMI_API_KEY` and friends, then emits a single
/// [`BACKEND_READY_METHOD`] notification as soon as the stdio transport is
/// established and before any request is handled, so clients bound startup on
/// real JSON-RPC readiness rather than the OS process-spawn event.
///
/// After the receive loop ends (stdin closed), [`io_threads.join`] blocks until
/// every `connection.sender` clone is dropped. Deferred handlers (streaming
/// turns and [`spawn_git_status`]) hold such clones, so an in-flight response is
/// flushed to stdout before the process exits rather than being cut off.
///
/// # Errors
///
/// Returns an error when the ready signal cannot be sent, the transport threads
/// fail, or a response cannot be written.
pub fn run_stdio() -> Result<(), BackendError> {
    dotenvy::dotenv().ok();
    let session_id = debug_log::new_session_id();
    // Hold the guard for the whole session so buffered log lines flush on exit;
    // `None` when debug logging is disabled.
    let _log_guard = debug_log::init(&session_id);
    let store = Store::open_or_bootstrap().ok();
    let (connection, io_threads) = Connection::stdio();
    announce_ready(&connection, &session_id)?;
    match run_loop(connection, store.as_ref()) {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}

/// Emits the one-shot backend-ready notification over `connection`, carrying the
/// session id minted for this spawn.
///
/// Sending this before the request loop lets a client observe readiness the
/// moment the backend can speak JSON-RPC; the `sessionId` lets the client scope
/// its own per-session log to the same session.
///
/// # Errors
///
/// Returns a [`BackendError::Transport`] when the notification cannot be queued
/// on the transport (for example, the writer thread has already stopped).
fn announce_ready(connection: &Connection, session_id: &str) -> Result<(), BackendError> {
    connection
        .sender
        .send(Message::Notification(Notification::new(
            BACKEND_READY_METHOD.to_owned(),
            BackendReadyParams {
                session_id: session_id.to_owned(),
            },
        )))
        .map_err(|error| {
            BackendError::Transport(format!("failed to send backend ready signal: {error}"))
        })
}

fn run_loop(connection: Connection, store: Option<&Store>) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                if let Some(response) = handle_request(request, &connection, store) {
                    send_response(&connection, response)?;
                }
            }
            Message::Notification(_) => {}
            Message::Response(_) => {
                return Err(BackendError::Transport(
                    "backend received an unexpected JSON-RPC response".to_owned(),
                ));
            }
        }
    }

    Ok(())
}

/// Writes one response over the transport, mapping a closed writer to a
/// [`BackendError::Transport`].
fn send_response(connection: &Connection, response: Response) -> Result<(), BackendError> {
    connection
        .sender
        .send(Message::Response(response))
        .map_err(|error| {
            BackendError::Transport(format!("failed to write JSON-RPC response: {error}"))
        })
}

fn handle_request(
    request: Request,
    connection: &Connection,
    store: Option<&Store>,
) -> Option<Response> {
    match RpcMethod::from_method(&request.method) {
        Some(RpcMethod::MessageSubmit) => {
            Some(message::handle_message_submit(request, connection, store))
        }
        Some(RpcMethod::ConversationClear | RpcMethod::TurnCancel) => Some(Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        )),
        Some(RpcMethod::GitStatus) => {
            git_status::spawn_git_status(request, connection);
            None
        }
        Some(RpcMethod::ProviderList) => Some(Response::new_ok(
            request.id,
            providers::provider_list(store),
        )),
        Some(RpcMethod::SelectionGet) => Some(Response::new_ok(
            request.id,
            providers::active_selection(store),
        )),
        Some(RpcMethod::SelectionSet) => Some(handle_selection_set(request, store)),
        Some(RpcMethod::ProviderClearKey) => Some(handle_provider_clear_key(request, store)),
        Some(RpcMethod::ProviderSetKey) => {
            login::handle_provider_set_key(request, connection, store)
        }
        Some(RpcMethod::ProviderModels) => {
            login::handle_provider_models(request, connection, store)
        }
        None => Some(Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        )),
    }
}

fn handle_selection_set(request: Request, store: Option<&Store>) -> Response {
    let params = match serde_json::from_value::<SelectionSetParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid selection set params: {error}"),
            );
        }
    };
    Response::new_ok(request.id, providers::set_active_selection(store, params))
}

fn handle_provider_clear_key(request: Request, store: Option<&Store>) -> Response {
    let params = match serde_json::from_value::<ClearKeyParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid provider clearKey params: {error}"),
            );
        }
    };
    Response::new_ok(request.id, providers::clear_provider_key(store, params))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lsp_server::{Connection, RequestId};

    #[test]
    fn set_key_rejects_bad_custom_url_immediately_without_worker() {
        let (backend, client) = Connection::memory();
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

        let response = handle_request(request, &backend, None).expect("immediate error");

        assert_eq!(response.error.unwrap().code, JSON_RPC_INVALID_PARAMS);
        assert!(
            client.receiver.try_recv().is_err(),
            "no deferred worker sent a response"
        );
    }
}
