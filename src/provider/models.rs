//! OpenAI-compatible model-catalog parsing and validation outcomes.

use serde::Deserialize;

use crate::provider::ProviderError;

/// One model entry returned by an OpenAI-compatible `/models` catalog.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelInfo {
    /// Provider-native model id.
    pub id: String,
    /// Optional owner metadata when the provider returns it.
    pub owned_by: Option<String>,
}

/// Parses an OpenAI-compatible `/models` response body.
///
/// The accepted shape is `{ "data": [ { "id": "..." }, ... ] }`; order is
/// preserved and an empty `data` array is valid.
///
/// # Errors
///
/// Returns [`ProviderError::Decode`] when the body is not JSON, `data` is
/// missing or not an array, or any model entry is missing an `id`.
pub fn parse_models_response(body: &str) -> Result<Vec<ModelInfo>, ProviderError> {
    let response: ModelsResponse =
        serde_json::from_str(body).map_err(|error| ProviderError::Decode(error.to_string()))?;

    Ok(response
        .data
        .into_iter()
        .map(|model| ModelInfo {
            id: model.id,
            owned_by: model.owned_by,
        })
        .collect())
}

/// Provider validation result derived from the `/models` response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidationOutcome {
    /// The endpoint returned a parseable, non-empty model catalog.
    Connected(Vec<ModelInfo>),
    /// The provider rejected the supplied credential.
    AuthFailed,
    /// The provider is rate-limiting validation.
    RateLimited,
    /// The endpoint could not be reached or returned an unexpected failure.
    Unreachable,
    /// The endpoint did not expose an OpenAI-compatible model catalog.
    NotCompatible,
    /// The endpoint exposed a compatible but empty model catalog.
    EmptyCatalog,
}

impl ValidationOutcome {
    /// Maps a raw HTTP status and body into a typed validation outcome.
    #[must_use]
    pub fn from_response(status: u16, body: &str) -> Self {
        match status {
            401 | 403 => Self::AuthFailed,
            429 => Self::RateLimited,
            200..=299 => match parse_models_response(body) {
                Ok(models) if models.is_empty() => Self::EmptyCatalog,
                Ok(models) => Self::Connected(models),
                Err(_error) => Self::NotCompatible,
            },
            _other => Self::Unreachable,
        }
    }
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
    #[serde(default)]
    owned_by: Option<String>,
}
