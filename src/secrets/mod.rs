//! Provider API-key storage and resolution.
//!
//! Secrets are read per operation and wrapped in [`ApiKey`] so accidental
//! formatting redacts by default. The raw value is only available through
//! [`ApiKey::expose`], which is the single audited leak surface for future
//! provider authentication call sites.

use std::{env, fmt};

use secrecy::{ExposeSecret, SecretString};

use crate::config::CUSTOM_API_KEY_VAR;
use crate::provider::ProviderId;
use crate::provider::registry::{KeyResolver, KeySource};

/// Stable OS-keychain service namespace for provider API keys.
pub const KEYCHAIN_SERVICE: &str = "dev.kqode.providers";

const REDACTED: &str = "<redacted>";

/// A redacting, zeroizing provider API key.
///
/// The wrapped [`SecretString`] zeroizes on drop and does not implement
/// `Serialize` unless secrecy's serde feature and explicit marker traits are
/// enabled. KQode deliberately does not enable that feature.
pub struct ApiKey(SecretString);

impl ApiKey {
    /// Wraps a raw API key in a redacting, zeroizing secret container.
    #[must_use]
    pub fn new(key: String) -> Self {
        Self(SecretString::from(key))
    }

    /// Exposes the raw API key.
    ///
    /// This method is the only intentional leak surface. Call it only at the
    /// provider authentication boundary (for example, a future `.bearer_auth`
    /// call site), never in logs, errors, debug output, or serialized payloads.
    #[must_use]
    pub fn expose(&self) -> &str {
        self.0.expose_secret()
    }
}

impl From<String> for ApiKey {
    fn from(key: String) -> Self {
        Self::new(key)
    }
}

impl fmt::Debug for ApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("ApiKey").field(&REDACTED).finish()
    }
}

impl fmt::Display for ApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(REDACTED)
    }
}

/// Sanitized keychain failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeychainError {
    /// The platform keychain is locked or otherwise inaccessible.
    Unavailable,
    /// The keychain returned a non-secret backend failure.
    Backend,
}

impl fmt::Display for KeychainError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unavailable => formatter.write_str("the OS keychain is unavailable"),
            Self::Backend => formatter.write_str("the OS keychain operation failed"),
        }
    }
}

impl std::error::Error for KeychainError {}

/// Reads a provider key from the OS keychain.
///
/// # Errors
///
/// Returns [`KeychainError::Unavailable`] when the platform keychain cannot be
/// accessed, or [`KeychainError::Backend`] for other sanitized backend failures.
pub fn get_key(provider: ProviderId) -> Result<Option<ApiKey>, KeychainError> {
    with_entry(provider, |entry| match entry.get_password() {
        Ok(key) => Ok(Some(ApiKey::new(key))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(map_keyring_error(error)),
    })
}

/// Stores a provider key in the OS keychain.
///
/// # Errors
///
/// Returns [`KeychainError::Unavailable`] when the platform keychain cannot be
/// accessed, or [`KeychainError::Backend`] for other sanitized backend failures.
pub fn set_key(provider: ProviderId, key: &ApiKey) -> Result<(), KeychainError> {
    with_entry(provider, |entry| {
        entry.set_password(key.expose()).map_err(map_keyring_error)
    })
}

/// Clears a provider key from the OS keychain.
///
/// Missing entries are treated as already cleared.
///
/// # Errors
///
/// Returns [`KeychainError::Unavailable`] when the platform keychain cannot be
/// accessed, or [`KeychainError::Backend`] for other sanitized backend failures.
pub fn clear_key(provider: ProviderId) -> Result<(), KeychainError> {
    with_entry(provider, |entry| match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(map_keyring_error(error)),
    })
}

/// Resolves a provider API key, preferring keychain over `.env`.
///
/// Resolution is intentionally uncached so clear/set operations take effect on
/// the next call. Keychain failures fall through to the Custom-only `.env`
/// fallback instead of hiding a working environment key.
#[must_use]
pub fn resolve_key(provider: ProviderId) -> Option<ApiKey> {
    get_key(provider)
        .ok()
        .flatten()
        .or_else(|| env_key(provider))
}

/// Real key-source resolver for provider status derivation.
#[derive(Clone, Copy, Debug, Default)]
pub struct KeychainKeyResolver;

impl KeyResolver for KeychainKeyResolver {
    fn key_source(&self, provider: ProviderId) -> KeySource {
        if matches!(get_key(provider), Ok(Some(_))) {
            KeySource::Keychain
        } else if env_key(provider).is_some() {
            KeySource::Env
        } else {
            KeySource::None
        }
    }
}

fn env_key(provider: ProviderId) -> Option<ApiKey> {
    match provider {
        ProviderId::Custom => non_empty_env(CUSTOM_API_KEY_VAR).map(ApiKey::new),
        ProviderId::Kimi => None,
    }
}

fn non_empty_env(name: &str) -> Option<String> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value.trim().to_owned()),
        _ => None,
    }
}

#[cfg(not(test))]
fn with_entry<T>(
    provider: ProviderId,
    operation: impl FnOnce(&keyring::Entry) -> Result<T, KeychainError>,
) -> Result<T, KeychainError> {
    let entry =
        keyring::Entry::new(KEYCHAIN_SERVICE, provider.as_str()).map_err(map_keyring_error)?;
    operation(&entry)
}

#[cfg(test)]
fn with_entry<T>(
    provider: ProviderId,
    operation: impl FnOnce(&keyring::Entry) -> Result<T, KeychainError>,
) -> Result<T, KeychainError> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    static ENTRIES: OnceLock<Mutex<HashMap<ProviderId, keyring::Entry>>> = OnceLock::new();
    let mut entries = ENTRIES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap();
    let entry = entries.entry(provider).or_insert_with(|| {
        keyring::Entry::new(KEYCHAIN_SERVICE, provider.as_str()).expect("mock keyring entry")
    });
    operation(entry)
}

fn map_keyring_error(error: keyring::Error) -> KeychainError {
    match error {
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_) => {
            KeychainError::Unavailable
        }
        _ => KeychainError::Backend,
    }
}

#[cfg(test)]
mod tests;
