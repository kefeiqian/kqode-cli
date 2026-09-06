//! OS-keychain storage for provider API keys.

use std::fmt;

#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use kqode_provider::Provider;
use secrecy::{ExposeSecret, SecretString};

#[cfg(not(test))]
pub const KEYCHAIN_SERVICE: &str = "com.nincere.kqode.providers";
pub const KEYCHAIN_BACKEND_ENV: &str = "KQODE_KEYCHAIN_BACKEND";

const KEYCHAIN_BACKEND_MOCK: &str = "mock";
const REDACTED: &str = "<redacted>";

pub struct ApiKey(SecretString);

impl ApiKey {
    #[must_use]
    pub fn new(key: String) -> Self {
        Self(SecretString::from(key))
    }

    #[must_use]
    pub fn expose(&self) -> &str {
        self.0.expose_secret()
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

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeychainError {
    Unavailable,
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

#[derive(Clone, Default)]
pub struct SecretsStore {
    #[cfg(test)]
    entries: Arc<Mutex<HashMap<String, String>>>,
}

impl SecretsStore {
    pub fn get_key(&self, provider: Provider) -> Result<Option<ApiKey>, KeychainError> {
        #[cfg(test)]
        {
            Ok(self
                .entries
                .lock()
                .expect("test keychain lock")
                .get(provider.as_str())
                .cloned()
                .map(ApiKey::new))
        }
        #[cfg(not(test))]
        {
            let entry = entry(provider)?;
            match entry.get_password() {
                Ok(key) => Ok(Some(ApiKey::new(key))),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(error) => Err(map_keyring_error(error)),
            }
        }
    }

    pub fn set_key(&self, provider: Provider, key: &ApiKey) -> Result<(), KeychainError> {
        #[cfg(test)]
        {
            self.entries
                .lock()
                .expect("test keychain lock")
                .insert(provider.as_str().to_owned(), key.expose().to_owned());
            Ok(())
        }
        #[cfg(not(test))]
        {
            entry(provider)?
                .set_password(key.expose())
                .map_err(map_keyring_error)
        }
    }

    pub fn clear_key(&self, provider: Provider) -> Result<(), KeychainError> {
        #[cfg(test)]
        {
            self.entries
                .lock()
                .expect("test keychain lock")
                .remove(provider.as_str());
            Ok(())
        }
        #[cfg(not(test))]
        {
            match entry(provider)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(map_keyring_error(error)),
            }
        }
    }
}

pub fn init_keychain_backend() {
    if std::env::var(KEYCHAIN_BACKEND_ENV).as_deref() == Ok(KEYCHAIN_BACKEND_MOCK) {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }
}

#[cfg(not(test))]
fn entry(provider: Provider) -> Result<keyring::Entry, KeychainError> {
    keyring::Entry::new(KEYCHAIN_SERVICE, provider.as_str()).map_err(map_keyring_error)
}

#[cfg(not(test))]
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
