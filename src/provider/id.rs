//! Stable, cross-boundary provider identifiers.
//!
//! `provider_id` spans keychain service/account names, SQLite rows, wire
//! payloads, and the TUI, so it is treated like a versioned constant: changing
//! a shipped string value orphans stored secrets and settings simultaneously.
//! The registry (provider descriptors, base URLs, default models) is keyed by
//! this type.

/// A provider KQode can talk to. The string form ([`ProviderId::as_str`]) is the
/// stable cross-boundary key — never change a shipped value.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum ProviderId {
    /// The preset Kimi (Moonshot) provider.
    Kimi,
    /// A user-configured OpenAI-compatible endpoint.
    Custom,
}

/// Stable wire/storage string for [`ProviderId::Kimi`].
pub const PROVIDER_ID_KIMI: &str = "kimi";
/// Stable wire/storage string for [`ProviderId::Custom`].
pub const PROVIDER_ID_CUSTOM: &str = "custom";

impl ProviderId {
    /// The stable cross-boundary string id.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Kimi => PROVIDER_ID_KIMI,
            Self::Custom => PROVIDER_ID_CUSTOM,
        }
    }

    /// Parses the stable string id, returning `None` for an unknown value.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            PROVIDER_ID_KIMI => Some(Self::Kimi),
            PROVIDER_ID_CUSTOM => Some(Self::Custom),
            _ => None,
        }
    }
}
