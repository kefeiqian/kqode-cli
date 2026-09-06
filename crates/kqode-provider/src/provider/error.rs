//! Typed provider failures, classified so the backend can emit themed,
//! non-fatal settled error notifications.
//!
//! Error messages are sanitized: they never include the bearer token, auth
//! headers, or a full request dump.

use std::fmt;

/// Stable machine-readable error-kind tags shared with the TUI.
pub mod kind {
    /// Authentication/authorization failure (bad or missing key).
    pub const AUTH: &str = "auth";
    /// The provider rejected the request for rate-limiting reasons.
    pub const RATE_LIMIT: &str = "rateLimit";
    /// Network/transport failure or timeout.
    pub const NETWORK: &str = "network";
    /// The response could not be decoded into a known shape.
    pub const DECODE: &str = "decode";
    /// The request could not be constructed (e.g. invalid base URL).
    pub const CONFIG: &str = "config";
}

/// A classified, already-sanitized provider failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProviderError {
    /// Authentication failed (HTTP 401/403).
    Auth,
    /// The provider is rate-limiting (HTTP 429).
    RateLimit,
    /// A network/transport error or timeout, with a sanitized detail string.
    Network(String),
    /// The response body could not be decoded.
    Decode(String),
    /// The request could not be built from the configuration.
    Config(String),
}

impl ProviderError {
    /// The stable machine-readable kind tag (see [`kind`]).
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Auth => kind::AUTH,
            Self::RateLimit => kind::RATE_LIMIT,
            Self::Network(_) => kind::NETWORK,
            Self::Decode(_) => kind::DECODE,
            Self::Config(_) => kind::CONFIG,
        }
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Auth => {
                formatter.write_str("the provider rejected the API key (authentication failed)")
            }
            Self::RateLimit => {
                formatter.write_str("the provider rate limit was reached; try again shortly")
            }
            Self::Network(detail) => {
                write!(formatter, "network error talking to the provider: {detail}")
            }
            Self::Decode(detail) => {
                write!(formatter, "could not decode provider response: {detail}")
            }
            Self::Config(detail) => write!(formatter, "invalid provider configuration: {detail}"),
        }
    }
}

impl std::error::Error for ProviderError {}
