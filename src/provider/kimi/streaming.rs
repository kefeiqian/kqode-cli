//! SSE chunk parsing for OpenAI-compatible chat streams.

use eventsource_stream::{Event, EventStreamError};
use serde::Deserialize;

use crate::provider::{ProviderError, StreamEvent};

/// SSE payload that marks the end of an OpenAI-compatible stream.
const DONE_SENTINEL: &str = "[DONE]";

/// Converts one SSE event (or framing error) into an optional stream event.
pub(super) fn map_event(
    event: Result<Event, EventStreamError<reqwest::Error>>,
) -> Result<Option<StreamEvent>, ProviderError> {
    match event {
        Ok(event) => parse_chunk(&event.data),
        Err(error) => Err(ProviderError::Network(error.to_string())),
    }
}

/// Parses one SSE `data:` payload into an optional [`StreamEvent`].
///
/// Returns `Ok(None)` for keep-alive/role-only chunks that carry no text and no
/// finish reason, so the caller can drop them silently.
///
/// # Errors
///
/// Returns [`ProviderError::Decode`] when a non-sentinel payload is not valid
/// chat-completion chunk JSON.
pub(super) fn parse_chunk(data: &str) -> Result<Option<StreamEvent>, ProviderError> {
    let data = data.trim();
    if data.is_empty() {
        return Ok(None);
    }
    if data == DONE_SENTINEL {
        return Ok(Some(StreamEvent::Done {
            finish_reason: None,
        }));
    }

    let chunk: ChatChunk =
        serde_json::from_str(data).map_err(|error| ProviderError::Decode(error.to_string()))?;
    let Some(choice) = chunk.choices.into_iter().next() else {
        return Ok(None);
    };

    if let Some(content) = choice.delta.content
        && !content.is_empty()
    {
        return Ok(Some(StreamEvent::Delta(content)));
    }

    Ok(choice.finish_reason.map(|reason| StreamEvent::Done {
        finish_reason: Some(reason),
    }))
}

#[derive(Deserialize)]
struct ChatChunk {
    #[serde(default)]
    choices: Vec<ChunkChoice>,
}

#[derive(Deserialize)]
struct ChunkChoice {
    #[serde(default)]
    delta: Delta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Default, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}
