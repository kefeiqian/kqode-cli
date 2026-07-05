use std::{error::Error, fmt};

use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::chat::spawn_streaming_turn;
use crate::config::KimiConfig;
use crate::debug_log;
use crate::protocol::{
    BACKEND_READY_METHOD, JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND, MessageSubmitParams,
    MessageSubmitResult, RpcMethod, SUBMIT_STATUS_NEEDS_CONFIGURATION, SUBMIT_STATUS_STREAMING,
};

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
/// # Errors
///
/// Returns an error when the ready signal cannot be sent, the transport threads
/// fail, or a response cannot be written.
pub fn run_stdio() -> Result<(), BackendError> {
    dotenvy::dotenv().ok();
    // Hold the guard for the whole session so buffered log lines flush on exit;
    // `None` when debug logging is disabled.
    let _log_guard = debug_log::init();
    let (connection, io_threads) = Connection::stdio();
    announce_ready(&connection)?;
    match run_loop(connection) {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}

/// Emits the one-shot backend-ready notification over `connection`.
///
/// Sending this before the request loop lets a client observe readiness the
/// moment the backend can speak JSON-RPC. The notification carries no params;
/// `lsp-server` omits a null `params` field on the wire.
///
/// # Errors
///
/// Returns a [`BackendError::Transport`] when the notification cannot be queued
/// on the transport (for example, the writer thread has already stopped).
fn announce_ready(connection: &Connection) -> Result<(), BackendError> {
    connection
        .sender
        .send(Message::Notification(Notification::new(
            BACKEND_READY_METHOD.to_owned(),
            (),
        )))
        .map_err(|error| {
            BackendError::Transport(format!("failed to send backend ready signal: {error}"))
        })
}

fn run_loop(connection: Connection) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                let response = handle_request(request, &connection);
                connection
                    .sender
                    .send(Message::Response(response))
                    .map_err(|error| {
                        BackendError::Transport(format!(
                            "failed to write JSON-RPC response: {error}"
                        ))
                    })?;
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

/// Handles one JSON-RPC request.
///
/// `kqode.message.submit` returns an immediate streaming ack: when a Kimi key is
/// configured it spawns a streaming turn (whose tokens arrive as notifications
/// through a clone of `connection.sender`) and returns
/// [`SUBMIT_STATUS_STREAMING`]; otherwise it returns
/// [`SUBMIT_STATUS_NEEDS_CONFIGURATION`] without contacting the provider.
fn handle_request(request: Request, connection: &Connection) -> Response {
    if request.method != RpcMethod::MessageSubmit.as_str() {
        return Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        );
    }

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
