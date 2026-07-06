//! Runtime provider configuration sourced from environment variables
//! (populated from a `.env` file at backend startup).
//!
//! The `.env` file configures the user-supplied **Custom** provider: an
//! OpenAI-compatible endpoint that is not one of the compiled presets. The
//! built-in Kimi preset is configured through `/login` (OS keychain) only and
//! never reads the environment. Values are read at use time and never logged.

use std::env;

/// Environment variable holding the Custom provider API key.
pub const CUSTOM_API_KEY_VAR: &str = "CUSTOM_API_KEY";

/// Environment variable holding the Custom provider model id.
pub const CUSTOM_MODEL_VAR: &str = "CUSTOM_MODEL";

/// Environment variable holding the Custom provider base URL.
pub const CUSTOM_BASE_URL_VAR: &str = "CUSTOM_BASE_URL";

/// Default model for the Kimi preset: coding-optimized, 256k context.
pub const DEFAULT_KIMI_MODEL: &str = "kimi-k2.7-code";

/// Kimi preset base URL (Moonshot China / CNY billing). Fixed and never
/// overridable from the environment. International keys use
/// `https://api.moonshot.ai/v1`.
pub const DEFAULT_KIMI_BASE_URL: &str = "https://api.moonshot.cn/v1";

/// Resolved provider configuration for a single OpenAI-compatible turn.
///
/// Historically this was read from environment variables only; submit-time
/// resolution now also reuses it as the carrier for active provider selections,
/// keychain credentials, and custom or preset base URLs.
#[derive(Clone)]
pub struct KimiConfig {
    /// Bearer token used to authenticate with Kimi. Never logged or traced.
    pub api_key: String,
    /// Chat-completions model id.
    pub model: String,
    /// API base URL without a trailing slash.
    pub base_url: String,
}

impl std::fmt::Debug for KimiConfig {
    /// Redacts `api_key` so a `{:?}` of the config never leaks the secret.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("KimiConfig")
            .field("api_key", &"<redacted>")
            .field("model", &self.model)
            .field("base_url", &self.base_url)
            .finish()
    }
}

/// Reads the Custom provider model id from the environment, if set.
///
/// Returns `None` when [`CUSTOM_MODEL_VAR`] is unset or whitespace-only, so a
/// placeholder `CUSTOM_MODEL=` line in `.env` counts as "not set".
#[must_use]
pub fn custom_env_model() -> Option<String> {
    non_empty_var(CUSTOM_MODEL_VAR)
}

/// Reads the raw Custom provider base URL from the environment, if set.
///
/// The value is returned unnormalized; callers validate and normalize it
/// through the provider registry before use. Returns `None` when
/// [`CUSTOM_BASE_URL_VAR`] is unset or whitespace-only.
#[must_use]
pub fn custom_env_base_url() -> Option<String> {
    non_empty_var(CUSTOM_BASE_URL_VAR)
}

/// Reads an environment variable, treating unset and whitespace-only values the
/// same so a placeholder `KEY=` line in `.env` counts as "not configured".
fn non_empty_var(name: &str) -> Option<String> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value.trim().to_owned()),
        _ => None,
    }
}

#[cfg(test)]
mod tests;
