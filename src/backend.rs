use std::{error::Error, fmt, thread};

use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::chat::spawn_streaming_turn;
use crate::config::KimiConfig;
use crate::debug_log;
use crate::git;
use crate::protocol::{
    BACKEND_READY_METHOD, BackendReadyParams, GitStatusResult, JSON_RPC_INVALID_PARAMS,
    JSON_RPC_METHOD_NOT_FOUND, MessageSubmitParams, MessageSubmitResult, RpcMethod,
    SUBMIT_STATUS_NEEDS_CONFIGURATION, SUBMIT_STATUS_STREAMING,
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
    let (connection, io_threads) = Connection::stdio();
    announce_ready(&connection, &session_id)?;
    match run_loop(connection) {
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

fn run_loop(connection: Connection) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                if let Some(response) = handle_request(request, &connection) {
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

/// Dispatches one JSON-RPC request.
///
/// Returns `Some(response)` to answer synchronously, or `None` when the handler
/// owns its response and will send it later. `kqode.message.submit` answers
/// immediately with a streaming ack (and spawns the turn); `kqode.git.status`
/// runs on a spawned thread and sends its response deferred, so a slow `git`
/// never stalls the receive loop.
fn handle_request(request: Request, connection: &Connection) -> Option<Response> {
    match RpcMethod::from_method(&request.method) {
        Some(RpcMethod::MessageSubmit) => Some(handle_message_submit(request, connection)),
        Some(RpcMethod::GitStatus) => {
            spawn_git_status(request, connection);
            None
        }
        None => Some(Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        )),
    }
}

/// Handles `kqode.message.submit`.
///
/// When a Kimi key is configured it spawns a streaming turn (whose tokens arrive
/// as notifications through a clone of `connection.sender`) and returns
/// [`SUBMIT_STATUS_STREAMING`]; otherwise it returns
/// [`SUBMIT_STATUS_NEEDS_CONFIGURATION`] without contacting the provider.
fn handle_message_submit(request: Request, connection: &Connection) -> Response {
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

/// Spawns a detached thread that computes the workspace git label and sends the
/// deferred response for `request`.
///
/// Running `git` off the receive loop keeps a slow or hung call from stalling
/// other requests; the thread's `sender` clone also keeps the transport alive
/// until the response is flushed, so the answer is not lost if stdin closes
/// first (see the shutdown note in [`run_stdio`]).
fn spawn_git_status(request: Request, connection: &Connection) {
    let id = request.id;
    let sender = connection.sender.clone();
    thread::spawn(move || {
        let response = Response::new_ok(
            id,
            GitStatusResult {
                label: git::status_label(),
            },
        );
        let _ = sender.send(Message::Response(response));
    });
}
