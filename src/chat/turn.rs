//! Streaming chat-turn orchestration.
//!
//! `lsp-server` is synchronous, so each accepted turn runs on its own OS thread
//! with a dedicated `tokio` current-thread runtime. The thread drives the Kimi
//! stream and emits JSON-RPC notifications through the injected `emit` sink (a
//! clone of the backend's crossbeam sender), correlated by `turnId`.

use std::pin::pin;
use std::thread;
use std::time::Duration;

use futures_util::StreamExt;
use lsp_server::Notification;
use tracing::Instrument;

use crate::chat::system_prompt::system_message;
use crate::config::KimiConfig;
use crate::debug_log;
use crate::protocol::{
    TOKEN_DELTA_METHOD, TURN_END_METHOD, TURN_ERROR_METHOD, TokenDeltaParams, TurnEndParams,
    TurnErrorParams,
};
use crate::provider::{ChatMessage, KimiProvider, ProviderError, ProviderRequest, StreamEvent};

/// Maximum time to wait for the next streamed chunk before failing the turn.
const NEXT_CHUNK_TIMEOUT: Duration = Duration::from_secs(120);

/// Spawns a detached OS thread that streams one Kimi turn and emits
/// `kqode/tokenDelta` notifications followed by a terminal `kqode/turnEnd` (or a
/// single `kqode/turnError`), all tagged with `turn_id`.
///
/// The turn is instrumented with a debug-log span carrying `turn_id`; when debug
/// logging is enabled the assembled request and the response/error are recorded.
pub fn spawn_streaming_turn<E>(turn_id: String, user_text: String, config: KimiConfig, emit: E)
where
    E: Fn(Notification) + Send + 'static,
{
    thread::spawn(move || run_turn(&turn_id, user_text, config, &emit));
}

fn run_turn<E: Fn(Notification)>(turn_id: &str, user_text: String, config: KimiConfig, emit: &E) {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            emit(turn_error(
                turn_id,
                &ProviderError::Network(format!("runtime error: {error}")),
            ));
            return;
        }
    };

    runtime.block_on(
        stream_turn(turn_id, user_text, config, emit).instrument(debug_log::turn_span(turn_id)),
    );
}

async fn stream_turn<E: Fn(Notification)>(
    turn_id: &str,
    user_text: String,
    config: KimiConfig,
    emit: &E,
) {
    let model = config.model.clone();
    let provider = match KimiProvider::new(config) {
        Ok(provider) => provider,
        Err(error) => return fail(turn_id, &error, emit),
    };

    let request = ProviderRequest {
        messages: vec![system_message(&model), ChatMessage::user(user_text)],
        model,
    };
    debug_log::log_request(&request.model, &request.messages);

    let stream = match provider.stream(request).await {
        Ok(stream) => stream,
        Err(error) => return fail(turn_id, &error, emit),
    };

    let mut stream = pin!(stream);
    let mut finish_reason = None;
    let mut response_text = String::new();
    loop {
        match tokio::time::timeout(NEXT_CHUNK_TIMEOUT, stream.next()).await {
            Err(_elapsed) => {
                return fail(
                    turn_id,
                    &ProviderError::Network("timed out waiting for the next token".to_owned()),
                    emit,
                );
            }
            Ok(None) => break,
            Ok(Some(Ok(StreamEvent::Delta(text)))) => {
                response_text.push_str(&text);
                emit(token_delta(turn_id, text));
            }
            Ok(Some(Ok(StreamEvent::Done {
                finish_reason: reason,
            }))) => {
                if reason.is_some() {
                    finish_reason = reason;
                }
            }
            Ok(Some(Err(error))) => return fail(turn_id, &error, emit),
        }
    }

    debug_log::log_response(&response_text, finish_reason.as_deref());
    emit(turn_end(turn_id, finish_reason));
}

/// Emits a sanitized `kqode/turnError` and mirrors it to the debug log.
fn fail<E: Fn(Notification)>(turn_id: &str, error: &ProviderError, emit: &E) {
    debug_log::log_error(error.kind(), &error.to_string());
    emit(turn_error(turn_id, error));
}

fn token_delta(turn_id: &str, delta: String) -> Notification {
    Notification::new(
        TOKEN_DELTA_METHOD.to_owned(),
        TokenDeltaParams {
            turn_id: turn_id.to_owned(),
            delta,
        },
    )
}

fn turn_end(turn_id: &str, finish_reason: Option<String>) -> Notification {
    Notification::new(
        TURN_END_METHOD.to_owned(),
        TurnEndParams {
            turn_id: turn_id.to_owned(),
            finish_reason,
        },
    )
}

fn turn_error(turn_id: &str, error: &ProviderError) -> Notification {
    Notification::new(
        TURN_ERROR_METHOD.to_owned(),
        TurnErrorParams {
            turn_id: turn_id.to_owned(),
            error_kind: error.kind().to_owned(),
            message: error.to_string(),
        },
    )
}
