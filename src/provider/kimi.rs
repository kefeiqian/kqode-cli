//! Kimi/Moonshot streaming chat-completions client over its OpenAI-compatible
//! API. Vendor wire types (SSE chunk shapes) stay inside this module; callers
//! only see [`StreamEvent`] and [`ProviderError`].

use std::future::ready;
use std::time::Duration;

use eventsource_stream::Eventsource;
use futures_util::{Stream, StreamExt};
use serde_json::json;

use crate::config::KimiConfig;
use crate::provider::error::ProviderError;
use crate::provider::models::{ModelInfo, parse_models_response};
use crate::provider::registry::validate_base_url;
use crate::provider::{ProviderRequest, StreamEvent};

mod streaming;
use streaming::map_event;
#[cfg(test)]
use streaming::parse_chunk;

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
    model: String,
}

impl KimiProvider {
    /// Builds a client from resolved [`KimiConfig`].
    ///
    /// # Errors
    ///
    /// Returns [`ProviderError::Config`] when the base URL is not a valid HTTPS
    /// URL or the underlying HTTP client cannot be constructed.
    pub fn new(config: KimiConfig) -> Result<Self, ProviderError> {
        Self::from_endpoint(config.base_url, config.api_key, config.model)
    }

    /// Builds a neutral OpenAI-compatible client from endpoint parts.
    ///
    /// # Errors
    ///
    /// Returns [`ProviderError::Config`] when `base_url` is invalid or the HTTP
    /// client cannot be constructed.
    pub fn from_endpoint(
        base_url: String,
        api_key: String,
        model: String,
    ) -> Result<Self, ProviderError> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
            .read_timeout(Duration::from_secs(READ_TIMEOUT_SECS))
            // Never follow redirects, so bearer auth cannot ride to another
            // origin. TLS verification remains enabled by reqwest defaults.
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| {
                ProviderError::Config(format!("could not build HTTP client: {error}"))
            })?;

        Ok(Self {
            client,
            api_key,
            base_url: validate_base_url(&base_url)?,
            model,
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
        let model = if request.model.trim().is_empty() {
            &self.model
        } else {
            &request.model
        };
        let body = json!({
            "model": model,
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

    /// Fetches the OpenAI-compatible model catalog.
    ///
    /// # Errors
    ///
    /// Returns a [`ProviderError`] if the request fails, the server responds
    /// with a non-success status, or the catalog cannot be decoded.
    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let url = format!("{}/models", self.base_url);
        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|error| ProviderError::Network(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
        }

        let body = response
            .text()
            .await
            .map_err(|error| ProviderError::Network(error.to_string()))?;
        parse_models_response(&body)
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

#[cfg(test)]
mod tests;
