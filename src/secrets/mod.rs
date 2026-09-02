//! Provider API-key storage and resolution.
//!
//! Secrets are read per operation and wrapped in [`ApiKey`] so accidental
//! formatting redacts by default. The raw value is only available through
//! [`ApiKey::expose`], which is the single audited leak surface for future
//! provider authentication call sites.

use std::fmt;

use secrecy::{ExposeSecret, SecretString};

use crate::provider::ProviderId;
use crate::provider::registry::{KeyResolver, KeySource};

/// Stable OS-keychain service namespace for provider API keys.
///
/// Reverse-DNS for the product domain (`nincere.com`, app `kqode`), matching the
/// platform convention for keychain service identifiers. Kept identical across
/// dev and prod so a user's stored key resolves for every build.
pub const KEYCHAIN_SERVICE: &str = "com.nincere.kqode.providers";

/// Environment variable selecting the keychain backend. Set to `mock` to use an
/// in-memory keyring instead of the real OS keychain.
///
/// This is a **test/CI affordance only** — production never sets it. It lets
/// integration tests that spawn the real backend binary run against an empty,
/// isolated keychain, so they stay deterministic regardless of the developer's
/// OS credentials (the OS keychain is process-global and is not scoped by the
/// `HOME`/`USERPROFILE` overrides the test harness sets).
pub const KEYCHAIN_BACKEND_ENV: &str = "KQODE_KEYCHAIN_BACKEND";

/// Value of [`KEYCHAIN_BACKEND_ENV`] that selects the in-memory mock keyring.
const KEYCHAIN_BACKEND_MOCK: &str = "mock";

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

/// Resolves a provider API key from the OS keychain.
///
/// Resolution is intentionally uncached so clear/set operations take effect on
/// the next call.
#[must_use]
pub fn resolve_key(provider: ProviderId) -> Option<ApiKey> {
    get_key(provider).ok().flatten()
}

/// Installs the in-memory mock keyring when [`KEYCHAIN_BACKEND_ENV`] is `mock`.
///
/// Call once at process startup, before any keychain access. It is a no-op
/// unless the env var explicitly selects the mock backend, so production
/// behavior is unchanged. With the mock installed, every key read returns "no
/// entry" (the store starts empty) and writes stay in memory, isolating the
/// process from the real OS keychain.
pub fn init_keychain_backend() {
    if std::env::var(KEYCHAIN_BACKEND_ENV).as_deref() == Ok(KEYCHAIN_BACKEND_MOCK) {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }
}

/// Real key-source resolver for provider status derivation.
#[derive(Clone, Copy, Debug, Default)]
pub struct KeychainKeyResolver;

impl KeyResolver for KeychainKeyResolver {
    fn key_source(&self, provider: ProviderId) -> KeySource {
        if matches!(get_key(provider), Ok(Some(_))) {
            KeySource::Keychain
        } else {
            KeySource::None
        }
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
