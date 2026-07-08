use std::{error::Error, fmt};

use std::sync::mpsc::Sender;

use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::conversation::{
    Command, ConversationEvent, Coordinator, SessionPersistence, SettledKind, TurnResult,
};
use crate::debug_log;
use crate::protocol::{
    ActivatedParams, BACKEND_READY_METHOD, BackendReadyParams, ClearKeyParams,
    ConversationClearResult, EnqueuedParams, JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND,
    RpcMethod, SelectionSetParams, SettledParams, TOKEN_DELTA_METHOD, TURN_ACTIVATED_METHOD,
    TURN_ENQUEUED_METHOD, TURN_SETTLED_METHOD, TokenDeltaParams, TurnCancelParams,
    TurnCancelResult,
};
use crate::store::{Store, StoreError};

mod git_status;
mod login;
mod message;
mod providers;
mod resolve;
mod sessions;
#[cfg(test)]
mod tests;

#[derive(Debug)]
pub enum BackendError {
    Store(StoreError),
    Transport(String),
}

impl fmt::Display for BackendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Store(error) => write!(formatter, "{error}"),
            Self::Transport(message) => formatter.write_str(message),
        }
    }
}

impl Error for BackendError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::Transport(_) => None,
        }
    }
}

/// Runs the internal JSON-RPC stdio backend until stdin closes.
///
/// Loads a `.env` file (if present) into the process environment first so the
/// Custom provider can read `CUSTOM_API_KEY` and friends, then emits a single
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
    let store = Store::open_or_bootstrap().map_err(BackendError::Store)?;
    let (connection, io_threads) = Connection::stdio();
    let loop_result = run_stdio_with(connection, &store, &session_id);
    match loop_result {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}

fn run_stdio_with(
    connection: Connection,
    store: &Store,
    session_id: &str,
) -> Result<(), BackendError> {
    announce_ready(&connection, session_id)?;
    let coordinator = Coordinator::start(
        json_rpc_event_sink(&connection),
        Box::new(SessionPersistence::new(store.clone())),
    );
    let loop_result = run_loop(connection, store, coordinator.sender());
    coordinator.shutdown_and_join();
    loop_result
}

#[cfg(test)]
fn run_stdio_with_store_result(
    connection: Connection,
    store: Result<Store, StoreError>,
    session_id: &str,
) -> Result<(), BackendError> {
    let store = store.map_err(BackendError::Store)?;
    run_stdio_with(connection, &store, session_id)
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

fn run_loop(
    connection: Connection,
    store: &Store,
    coordinator: Sender<Command>,
) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                if let Some(response) = handle_request(request, &connection, store, &coordinator) {
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

    let _ = coordinator.send(Command::Shutdown);
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
    store: &Store,
    coordinator: &Sender<Command>,
) -> Option<Response> {
    match RpcMethod::from_method(&request.method) {
        Some(RpcMethod::MessageSubmit) => {
            Some(message::handle_message_submit(request, coordinator, store))
        }
        Some(RpcMethod::ConversationClear) => Some(handle_conversation_clear(request, coordinator)),
        Some(RpcMethod::TurnCancel) => Some(handle_turn_cancel(request, coordinator)),
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
        Some(RpcMethod::SessionList) => Some(sessions::list_sessions(request, store, coordinator)),
        Some(RpcMethod::SessionResume) => {
            Some(sessions::resume_session(request, store, coordinator))
        }
        None => Some(Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        )),
    }
}

fn handle_conversation_clear(request: Request, coordinator: &Sender<Command>) -> Response {
    // Clear takes no meaningful params; abandon the active turn, drop pending,
    // and empty the transcript history on the single owner.
    let _ = coordinator.send(Command::Clear);
    Response::new_ok(request.id, ConversationClearResult { ok: true })
}

fn handle_turn_cancel(request: Request, coordinator: &Sender<Command>) -> Response {
    let params = match serde_json::from_value::<TurnCancelParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid turn cancel params: {error}"),
            );
        }
    };
    let _ = coordinator.send(Command::Cancel {
        turn_id: params.turn_id,
    });
    Response::new_ok(request.id, TurnCancelResult { ok: true })
}

fn json_rpc_event_sink(
    connection: &Connection,
) -> impl Fn(ConversationEvent) + Send + Sync + 'static {
    let sender = connection.sender.clone();
    move |event| {
        for notification in notifications_for_event(event) {
            let _ = sender.send(Message::Notification(notification));
        }
    }
}

fn notifications_for_event(event: ConversationEvent) -> Vec<Notification> {
    match event {
        ConversationEvent::Enqueued {
            turn_id,
            seq,
            state,
        } => vec![Notification::new(
            TURN_ENQUEUED_METHOD.to_owned(),
            EnqueuedParams {
                turn_id,
                seq,
                state: state
                    .as_queue_state()
                    .expect("enqueued state is queue-visible"),
            },
        )],
        ConversationEvent::Activated { turn_id } => vec![Notification::new(
            TURN_ACTIVATED_METHOD.to_owned(),
            ActivatedParams { turn_id },
        )],
        ConversationEvent::Delta { turn_id, text } => vec![Notification::new(
            TOKEN_DELTA_METHOD.to_owned(),
            TokenDeltaParams {
                turn_id,
                delta: text,
            },
        )],
        ConversationEvent::Settled { turn_id, result } => vec![Notification::new(
            TURN_SETTLED_METHOD.to_owned(),
            SettledParams {
                turn_id,
                result: protocol_turn_result(&result),
            },
        )],
    }
}

fn protocol_turn_result(result: &TurnResult) -> crate::protocol::TurnResult {
    crate::protocol::TurnResult {
        kind: match result.kind {
            SettledKind::Completed => crate::protocol::SETTLED_KIND_COMPLETED,
            SettledKind::NeedsConfiguration => crate::protocol::SETTLED_KIND_NEEDS_CONFIGURATION,
            SettledKind::Error => crate::protocol::SETTLED_KIND_ERROR,
            SettledKind::Cancelled => crate::protocol::SETTLED_KIND_CANCELLED,
        },
        text: result.text.clone(),
        finish_reason: result.finish_reason.clone(),
        error_kind: result.error_kind.clone(),
        message: result.message.clone(),
    }
}

fn handle_selection_set(request: Request, store: &Store) -> Response {
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

fn handle_provider_clear_key(request: Request, store: &Store) -> Response {
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
