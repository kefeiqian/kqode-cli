use std::{error::Error, fmt};

use lsp_server::{Connection, Message, Request, Response};

use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, JSON_RPC_METHOD_NOT_FOUND, MessageSubmitParams, MessageSubmitResult,
    RpcMethod,
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
/// # Errors
///
/// Returns an error when the transport threads fail or a response cannot be written.
pub fn run_stdio() -> Result<(), BackendError> {
    let (connection, io_threads) = Connection::stdio();
    match run_loop(connection) {
        Ok(()) => io_threads.join().map_err(|error| {
            BackendError::Transport(format!("JSON-RPC transport failed: {error}"))
        }),
        Err(error) => Err(error),
    }
}

fn run_loop(connection: Connection) -> Result<(), BackendError> {
    while let Ok(message) = connection.receiver.recv() {
        match message {
            Message::Request(request) => {
                let response = handle_request(request);
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

fn handle_request(request: Request) -> Response {
    if request.method != RpcMethod::MessageSubmit.as_str() {
        return Response::new_err(
            request.id,
            JSON_RPC_METHOD_NOT_FOUND,
            format!("unsupported method `{}`", request.method),
        );
    }

    match serde_json::from_value::<MessageSubmitParams>(request.params) {
        Ok(params) => Response::new_ok(request.id, MessageSubmitResult::from(params)),
        Err(error) => Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            format!("invalid message submit params: {error}"),
        ),
    }
}
