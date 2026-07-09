//! Runtime configuration values.
//!
//! `.env` is loaded at backend startup for development-only settings such as
//! `KQODE_DEBUG`. Provider credentials, models, and base URLs are configured
//! through `/connect`, the OS keychain, and the SQLite settings store.

/// Default model for the Kimi preset: coding-optimized, 256k context.
pub const DEFAULT_KIMI_MODEL: &str = "kimi-k2.7-code";

/// Kimi preset base URL (Moonshot China / CNY billing). Fixed and never
/// overridable from the environment. International keys use
/// `https://api.moonshot.ai/v1`.
pub const DEFAULT_KIMI_BASE_URL: &str = "https://api.moonshot.cn/v1";

/// Resolved provider configuration for a single OpenAI-compatible turn.
#[derive(Clone)]
pub struct KimiConfig {
    /// API key used to authenticate with the selected provider. Never logged or traced.
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

#[cfg(test)]
mod tests;
