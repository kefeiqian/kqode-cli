//! Streaming chat-turn orchestration.
//!
//! Each accepted turn runs on an OS thread with a dedicated `tokio`
//! current-thread runtime. The thread drives the Kimi stream and emits
//! transport-free [`TurnStreamEvent`] values through the injected `emit` sink,
//! correlated by `turn_id`.

use std::pin::pin;
use std::thread;
use std::time::Duration;

use futures_util::StreamExt;
use tracing::Instrument;

use crate::chat::system_prompt::system_message;
use crate::chat::{CancellationToken, TurnStreamEvent};
use crate::config::KimiConfig;
use crate::debug_log;
use crate::provider::{ChatMessage, KimiProvider, ProviderError, ProviderRequest, StreamEvent};

/// Maximum time to wait for the next streamed chunk before failing the turn.
const NEXT_CHUNK_TIMEOUT: Duration = Duration::from_secs(120);

/// How often the stream loop re-checks the cancellation flag while awaiting the
/// next chunk, so an Esc/`/clear` mid-stream is observed promptly (not only when
/// the next chunk arrives or the chunk timeout elapses).
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Spawns a detached OS thread that streams one Kimi turn and emits token
/// deltas followed by exactly one terminal event, all tagged with `turn_id`.
///
/// `config` carries the already resolved provider key, model, and base URL for
/// this turn; submit-time resolution may source it from active selection,
/// keychain, or environment fallback.
///
/// The turn is instrumented with a debug-log span carrying `turn_id`; when debug
/// logging is enabled the assembled request and the response/error are recorded.
pub fn spawn_streaming_turn<E>(
    turn_id: String,
    user_text: String,
    config: KimiConfig,
    cancel: CancellationToken,
    emit: E,
) where
    E: Fn(TurnStreamEvent) + Send + 'static,
{
    thread::spawn(move || run_streaming_turn(turn_id, user_text, config, cancel, emit));
}

/// Runs one streaming turn on the current thread and reports every update to
/// `emit`.
pub fn run_streaming_turn<E>(
    turn_id: String,
    user_text: String,
    config: KimiConfig,
    cancel: CancellationToken,
    emit: E,
) where
    E: Fn(TurnStreamEvent),
{
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            emit(error_event(&ProviderError::Network(format!(
                "runtime error: {error}"
            ))));
            return;
        }
    };

    runtime.block_on(
        stream_turn(&turn_id, user_text, config, cancel, &emit)
            .instrument(debug_log::turn_span(&turn_id)),
    );
}

async fn stream_turn<E: Fn(TurnStreamEvent)>(
    _turn_id: &str,
    user_text: String,
    config: KimiConfig,
    cancel: CancellationToken,
    emit: &E,
) {
    let model = config.model.clone();
    let provider = match KimiProvider::new(config) {
        Ok(provider) => provider,
        Err(error) => return fail(&error, emit),
    };

    let request = ProviderRequest {
        messages: vec![system_message(&model), ChatMessage::user(user_text)],
        model,
    };
    let record_transcript = debug_log::transcript_enabled();
    if record_transcript {
        debug_log::log_request(&request.model, &request.messages);
    }

    let stream = match provider.stream(request).await {
        Ok(stream) => stream,
        Err(error) => return fail(&error, emit),
    };

    let mut stream = pin!(stream);
    let mut finish_reason = None;
    let mut response_text = String::new();
    loop {
        // Await the next chunk and the cancellation signal concurrently, so a
        // cancel that arrives while `stream.next()` is pending is observed within
        // `CANCEL_POLL_INTERVAL` rather than waiting for the next chunk / timeout.
        tokio::select! {
            biased;
            () = wait_for_cancel(&cancel) => {
                emit(TurnStreamEvent::Cancelled);
                return;
            }
            outcome = tokio::time::timeout(NEXT_CHUNK_TIMEOUT, stream.next()) => {
                match outcome {
                    Err(_elapsed) => {
                        return fail(
                            &ProviderError::Network(
                                "timed out waiting for the next token".to_owned(),
                            ),
                            emit,
                        );
                    }
                    Ok(None) => break,
                    Ok(Some(Ok(StreamEvent::Delta(text)))) => {
                        // Always accumulate for the settled result; only the
                        // debug transcript log is gated on `record_transcript`.
                        response_text.push_str(&text);
                        emit(TurnStreamEvent::Delta(text));
                    }
                    Ok(Some(Ok(StreamEvent::Done {
                        finish_reason: reason,
                    }))) => {
                        if reason.is_some() {
                            finish_reason = reason;
                        }
                    }
                    Ok(Some(Err(error))) => return fail(&error, emit),
                }
            }
        }
    }

    if record_transcript {
        debug_log::log_response(&response_text, finish_reason.as_deref());
    }
    emit(TurnStreamEvent::Completed {
        text: response_text,
        finish_reason,
    });
}

/// Resolves once `cancel` is triggered, polling cooperatively so a cancel that
/// arrives mid-`stream.next()` is observed within [`CANCEL_POLL_INTERVAL`].
async fn wait_for_cancel(cancel: &CancellationToken) {
    while !cancel.is_cancelled() {
        tokio::time::sleep(CANCEL_POLL_INTERVAL).await;
    }
}

/// Emits a sanitized error and mirrors it to the debug log.
fn fail<E: Fn(TurnStreamEvent)>(error: &ProviderError, emit: &E) {
    debug_log::log_error(error.kind(), &error.to_string());
    emit(error_event(error));
}

fn error_event(error: &ProviderError) -> TurnStreamEvent {
    TurnStreamEvent::Error {
        error_kind: error.kind().to_owned(),
        message: error.to_string(),
    }
}
