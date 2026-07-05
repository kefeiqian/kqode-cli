//! Runtime configuration for the Kimi provider, sourced from environment
//! variables (populated from a `.env` file at backend startup).
//!
//! Only the API key is required; the model and base URL fall back to documented
//! defaults so a minimal `.env` needs a single line. The key is read at use time
//! and never logged.

use std::env;

/// Environment variable holding the Kimi/Moonshot API key.
pub const KIMI_API_KEY_VAR: &str = "KIMI_API_KEY";

/// Environment variable overriding the Kimi model id.
pub const KIMI_MODEL_VAR: &str = "KIMI_MODEL";

/// Environment variable overriding the Kimi API base URL.
pub const KIMI_BASE_URL_VAR: &str = "KIMI_BASE_URL";

/// Default model: newer, coding-optimized, 256k context.
pub const DEFAULT_KIMI_MODEL: &str = "kimi-k2.7-code";

/// Default base URL (Moonshot China / CNY billing). International keys use
/// `https://api.moonshot.ai/v1`.
pub const DEFAULT_KIMI_BASE_URL: &str = "https://api.moonshot.cn/v1";

/// Resolved Kimi provider configuration for a single turn.
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

impl KimiConfig {
    /// Reads the Kimi configuration from the process environment.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError::MissingApiKey`] when [`KIMI_API_KEY_VAR`] is unset
    /// or blank, so the backend can route the user to configuration instead of
    /// issuing an unauthenticated provider call.
    pub fn from_env() -> Result<Self, ConfigError> {
        let api_key = non_empty_var(KIMI_API_KEY_VAR).ok_or(ConfigError::MissingApiKey)?;
        let model = non_empty_var(KIMI_MODEL_VAR).unwrap_or_else(|| DEFAULT_KIMI_MODEL.to_owned());
        let base_url =
            non_empty_var(KIMI_BASE_URL_VAR).unwrap_or_else(|| DEFAULT_KIMI_BASE_URL.to_owned());

        Ok(Self {
            api_key,
            model,
            base_url: base_url.trim_end_matches('/').to_owned(),
        })
    }
}

/// Reads an environment variable, treating unset and whitespace-only values the
/// same so a placeholder `KEY=` line in `.env` counts as "not configured".
fn non_empty_var(name: &str) -> Option<String> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value.trim().to_owned()),
        _ => None,
    }
}

/// Reasons the Kimi configuration cannot be resolved.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigError {
    /// No usable API key is present in the environment.
    MissingApiKey,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingApiKey => {
                write!(
                    formatter,
                    "{KIMI_API_KEY_VAR} is not set; configure it in .env"
                )
            }
        }
    }
}

impl std::error::Error for ConfigError {}

#[cfg(test)]
mod tests;
