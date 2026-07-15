use std::{error::Error, fmt, thread};

use lsp_server::{Connection, Message, Notification, Request, Response};

use crate::git;
use crate::protocol::{
    BACKEND_READY_METHOD, GitStatusResult, JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND,
    MessageSubmitParams, MessageSubmitResult, RpcMethod, SUBMIT_STATUS_NEEDS_CONFIGURATION,
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
/// Emits a single [`BACKEND_READY_METHOD`] notification as soon as the stdio
/// transport is established and before any request is handled, so clients bound
/// startup on real JSON-RPC readiness rather than the OS process-spawn event.
///
/// After the receive loop ends (stdin closed), [`io_threads.join`] blocks until
/// every `connection.sender` clone is dropped. Deferred handlers such as
/// [`spawn_git_status`] hold such clones, so an in-flight response is flushed to
/// stdout before the process exits rather than being cut off.
///
/// # Errors
///
/// Returns an error when the ready signal cannot be sent, the transport threads
/// fail, or a response cannot be written.
pub fn run_stdio() -> Result<(), BackendError> {
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
/// immediately with a configuration-required ack in this bootstrap slice;
/// `kqode.git.status` runs on a spawned thread and sends its response deferred,
/// so a slow `git` never stalls the receive loop.
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
/// No provider is wired in this bootstrap slice, so every accepted submit is
/// acknowledged with [`SUBMIT_STATUS_NEEDS_CONFIGURATION`]; it never reads
/// plaintext credentials or contacts a model. Streaming lands with the provider
/// PR.
fn handle_message_submit(request: Request, _connection: &Connection) -> Response {
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

    let MessageSubmitParams { turn_id, .. } = params;

    Response::new_ok(
        request.id,
        MessageSubmitResult {
            turn_id,
            status: SUBMIT_STATUS_NEEDS_CONFIGURATION,
        },
    )
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
        let status = git::status();
        let response = Response::new_ok(
            id,
            GitStatusResult {
                label: status.as_ref().map(|status| status.label.clone()),
                pull_request_label: status
                    .as_ref()
                    .and_then(|status| status.pull_request_label.clone()),
                pull_request_url: status.and_then(|status| status.pull_request_url),
            },
        );
        let _ = sender.send(Message::Response(response));
    });
}
