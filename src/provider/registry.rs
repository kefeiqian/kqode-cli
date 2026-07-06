//! Provider registry, base-URL validation, and credential-status derivation.

use crate::config::{DEFAULT_KIMI_BASE_URL, DEFAULT_KIMI_MODEL};
use crate::provider::{ProviderError, ProviderId};

/// A provider's endpoint mode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderEndpoint {
    /// A compiled-in endpoint that users cannot override.
    Fixed { base_url: &'static str },
    /// A user-configured OpenAI-compatible endpoint.
    Custom,
}

/// Static provider metadata keyed by [`ProviderId`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProviderDescriptor {
    /// Stable provider id.
    pub id: ProviderId,
    /// User-facing provider name.
    pub label: &'static str,
    /// Endpoint configuration mode.
    pub endpoint: ProviderEndpoint,
    /// Registry default model, when the provider has one.
    pub default_model: Option<&'static str>,
}

/// Kimi/Moonshot preset descriptor.
pub const KIMI_DESCRIPTOR: ProviderDescriptor = ProviderDescriptor {
    id: ProviderId::Kimi,
    label: "Kimi",
    endpoint: ProviderEndpoint::Fixed {
        base_url: DEFAULT_KIMI_BASE_URL,
    },
    default_model: Some(DEFAULT_KIMI_MODEL),
};

/// User-provided OpenAI-compatible endpoint descriptor.
pub const CUSTOM_DESCRIPTOR: ProviderDescriptor = ProviderDescriptor {
    id: ProviderId::Custom,
    label: "Custom",
    endpoint: ProviderEndpoint::Custom,
    default_model: None,
};

/// All compiled provider descriptors.
pub const PROVIDERS: &[ProviderDescriptor] = &[KIMI_DESCRIPTOR, CUSTOM_DESCRIPTOR];

/// Looks up a provider descriptor by stable id.
#[must_use]
pub fn provider_descriptor(provider: ProviderId) -> &'static ProviderDescriptor {
    match provider {
        ProviderId::Kimi => &KIMI_DESCRIPTOR,
        ProviderId::Custom => &CUSTOM_DESCRIPTOR,
    }
}

/// User-supplied Custom provider settings.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CustomProviderConfig {
    /// Normalized HTTPS base URL without a trailing slash.
    pub base_url: String,
    /// Optional display label.
    pub label: Option<String>,
}

impl CustomProviderConfig {
    /// Builds Custom provider settings after validating and normalizing the URL.
    ///
    /// # Errors
    ///
    /// Returns [`ProviderError::Config`] when `base_url` is malformed, not
    /// HTTPS, or contains embedded userinfo.
    pub fn new(base_url: &str, label: Option<String>) -> Result<Self, ProviderError> {
        Ok(Self {
            base_url: validate_base_url(base_url)?,
            label,
        })
    }
}

/// Validates and normalizes an OpenAI-compatible HTTPS base URL.
///
/// # Errors
///
/// Returns [`ProviderError::Config`] when the URL is malformed, does not use
/// HTTPS, or contains embedded username/password userinfo.
pub fn validate_base_url(base_url: &str) -> Result<String, ProviderError> {
    let parsed = reqwest::Url::parse(base_url.trim())
        .map_err(|error| ProviderError::Config(format!("invalid base URL: {error}")))?;

    if parsed.scheme() != "https" {
        return Err(ProviderError::Config(
            "base URL must use the https scheme".to_owned(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ProviderError::Config(
            "base URL must not contain embedded userinfo".to_owned(),
        ));
    }

    Ok(parsed.as_str().trim_end_matches('/').to_owned())
}

/// Where a usable provider key was found.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeySource {
    /// The OS keychain.
    Keychain,
    /// A workspace environment variable.
    Env,
    /// No usable key was found.
    None,
}

/// User-facing connected credential source.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialSource {
    /// Connected via the OS keychain.
    Keychain,
    /// Connected via a workspace environment variable.
    Env,
}

/// Cached provider status for selection/login surfaces.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderStatus {
    /// The provider has a resolvable credential from the given source.
    Connected(CredentialSource),
    /// The provider has no resolvable credential.
    NotConfigured,
}

/// Resolves the source of a provider key without exposing key material.
pub trait KeyResolver {
    /// Returns where the provider's key can be resolved, if anywhere.
    fn key_source(&self, provider: ProviderId) -> KeySource;
}

impl<F> KeyResolver for F
where
    F: Fn(ProviderId) -> KeySource,
{
    fn key_source(&self, provider: ProviderId) -> KeySource {
        self(provider)
    }
}

/// Derives provider status from an abstract key resolver.
#[must_use]
pub fn derive_status<R: KeyResolver + ?Sized>(
    provider: ProviderId,
    resolver: &R,
) -> ProviderStatus {
    match resolver.key_source(provider) {
        KeySource::Keychain => ProviderStatus::Connected(CredentialSource::Keychain),
        KeySource::Env => ProviderStatus::Connected(CredentialSource::Env),
        KeySource::None => ProviderStatus::NotConfigured,
    }
}
