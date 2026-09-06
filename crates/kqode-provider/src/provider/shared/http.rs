use std::time::Duration;

use reqwest::{Client, Response};
use serde::Deserialize;

use crate::{
    inference::ChatError,
    provider::{Provider, ProviderConfig},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Deserialize)]
struct ApiErrorResponse {
    error: ApiErrorBody,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: String,
}

pub(in crate::provider) fn client() -> Result<Client, ChatError> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| ChatError::Request(format!("build LLM client: {error}")))
}

pub(in crate::provider) fn endpoint(api_base_url: &str, path: &str) -> Result<String, ChatError> {
    let api_base_url = validate_base_url(api_base_url)?;
    Ok(format!("{api_base_url}/{path}"))
}

/// Validates and normalizes an HTTPS provider base URL.
///
/// # Errors
///
/// Returns [`ChatError::Configuration`] when the URL is missing, malformed,
/// not HTTPS, or contains embedded user information.
pub fn validate_base_url(api_base_url: &str) -> Result<String, ChatError> {
    let api_base_url = api_base_url.trim();
    if api_base_url.is_empty() {
        return Err(ChatError::Configuration(
            "configure an API base URL in Settings".to_owned(),
        ));
    }
    let parsed = reqwest::Url::parse(api_base_url)
        .map_err(|error| ChatError::Configuration(format!("invalid API base URL: {error}")))?;
    if parsed.scheme() != "https" {
        return Err(ChatError::Configuration(
            "API base URL must use HTTPS".to_owned(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ChatError::Configuration(
            "API base URL must not contain embedded user information".to_owned(),
        ));
    }
    Ok(parsed.as_str().trim_end_matches('/').to_owned())
}

pub(in crate::provider) async fn response_body(response: Response) -> Result<String, ChatError> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| ChatError::Response(format!("read LLM response: {error}")))?;
    if status.is_success() {
        return Ok(body);
    }
    let message = serde_json::from_str::<ApiErrorResponse>(&body)
        .map(|response| response.error.message)
        .unwrap_or_else(|_| format!("request failed with HTTP {status}"));
    Err(ChatError::Api(format!("LLM API error: {message}")))
}

pub(in crate::provider) fn validate_api_key(config: &ProviderConfig) -> Result<(), ChatError> {
    if config.api_key.trim().is_empty() {
        return Err(ChatError::Configuration(
            "configure an API key in Settings before sending a message".to_owned(),
        ));
    }
    Ok(())
}

pub(in crate::provider) fn authentication_error(provider: Provider) -> ChatError {
    ChatError::Configuration(format!("Invalid API key for {}.", provider.display_name()))
}
