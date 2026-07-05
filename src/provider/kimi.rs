//! Kimi/Moonshot streaming chat-completions client over its OpenAI-compatible
//! API. Vendor wire types (SSE chunk shapes) stay inside this module; callers
//! only see [`StreamEvent`] and [`ProviderError`].

use std::future::ready;
use std::time::Duration;

use eventsource_stream::{Event, EventStreamError, Eventsource};
use futures_util::{Stream, StreamExt};
use serde::Deserialize;
use serde_json::json;

use crate::config::KimiConfig;
use crate::provider::error::ProviderError;
use crate::provider::{ProviderRequest, StreamEvent};

/// SSE payload that marks the end of an OpenAI-compatible stream.
const DONE_SENTINEL: &str = "[DONE]";

/// Ceiling for establishing the TCP/TLS connection (not the whole stream).
const CONNECT_TIMEOUT_SECS: u64 = 30;

/// Ceiling for each read (response headers and inter-chunk gaps); resets after
/// every successful read, so it bounds a stalled-but-connected server without
/// capping a legitimately long stream.
const READ_TIMEOUT_SECS: u64 = 120;

/// Streaming client bound to one Kimi credential and endpoint.
pub struct KimiProvider {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
}

impl KimiProvider {
    /// Builds a client from resolved [`KimiConfig`].
    ///
    /// # Errors
    ///
    /// Returns [`ProviderError::Config`] when the base URL is not HTTPS or the
    /// underlying HTTP client cannot be constructed.
    pub fn new(config: KimiConfig) -> Result<Self, ProviderError> {
        if !config.base_url.starts_with("https://") {
            return Err(ProviderError::Config(format!(
                "base URL must use https, got `{}`",
                config.base_url
            )));
        }

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
            .read_timeout(Duration::from_secs(READ_TIMEOUT_SECS))
            .build()
            .map_err(|error| {
                ProviderError::Config(format!("could not build HTTP client: {error}"))
            })?;

        Ok(Self {
            client,
            api_key: config.api_key,
            base_url: config.base_url,
        })
    }

    /// Opens a streamed chat completion.
    ///
    /// The returned stream yields ordered [`StreamEvent::Delta`] chunks followed
    /// by a [`StreamEvent::Done`]; per-chunk decode failures surface as stream
    /// items rather than ending the request.
    ///
    /// # Errors
    ///
    /// Returns a [`ProviderError`] if the initial request fails to send or the
    /// server answers with a non-success status (auth, rate-limit, or network).
    pub async fn stream(
        &self,
        request: ProviderRequest,
    ) -> Result<impl Stream<Item = Result<StreamEvent, ProviderError>>, ProviderError> {
        let url = format!("{}/chat/completions", self.base_url);
        let body = json!({
            "model": request.model,
            "stream": true,
            "messages": request.messages,
        });

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| ProviderError::Network(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
        }

        let events = response
            .bytes_stream()
            .eventsource()
            .map(map_event)
            .filter_map(|item| {
                ready(match item {
                    Ok(None) => None,
                    Ok(Some(event)) => Some(Ok(event)),
                    Err(error) => Some(Err(error)),
                })
            });

        Ok(events)
    }
}

/// Maps HTTP status codes to typed provider errors.
fn classify_status(code: u16) -> ProviderError {
    match code {
        401 | 403 => ProviderError::Auth,
        429 => ProviderError::RateLimit,
        other => ProviderError::Network(format!("HTTP {other}")),
    }
}

/// Converts one SSE event (or framing error) into an optional stream event.
fn map_event(
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
fn parse_chunk(data: &str) -> Result<Option<StreamEvent>, ProviderError> {
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

#[cfg(test)]
mod tests;
