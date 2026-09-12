use base64::{Engine, engine::general_purpose::STANDARD};
use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom,
};
use zeroize::Zeroizing;

use super::{SandboxAccountRole, SandboxAccountSetupError, WindowsSandboxAccountPlan, protection};

const RANDOM_PASSWORD_BYTES: usize = 48;
pub(super) const COMPLEXITY_PREFIX: &str = "Kq1!";
pub(super) const PASSWORD_TEXT_BYTES: usize =
    COMPLEXITY_PREFIX.len() + RANDOM_PASSWORD_BYTES / 3 * 4;
pub(super) const PASSWORD_ENVELOPE_VERSION: u32 = 1;

/// Machine-DPAPI ciphertext, still requiring private storage. Debug never dumps the blobs.
///
/// Serialization is exclusively for the private journal, not logs or frontend IPC.
#[derive(Serialize)]
pub struct ProtectedSandboxPasswords {
    version: u32,
    offline: Vec<u8>,
    online: Vec<u8>,
}

impl std::fmt::Debug for ProtectedSandboxPasswords {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ProtectedSandboxPasswords([REDACTED])")
    }
}

pub(super) struct Passwords {
    offline: SecretString,
    online: SecretString,
}

impl Passwords {
    pub fn generate() -> Result<Self, SandboxAccountSetupError> {
        Ok(Self {
            offline: generate()?,
            online: generate()?,
        })
    }

    pub fn get(&self, role: SandboxAccountRole) -> Option<&SecretString> {
        match role {
            SandboxAccountRole::Offline => Some(&self.offline),
            SandboxAccountRole::Online => Some(&self.online),
            SandboxAccountRole::Group => None,
        }
    }

    pub fn protect(
        &self,
        plan: &WindowsSandboxAccountPlan,
    ) -> Result<ProtectedSandboxPasswords, SandboxAccountSetupError> {
        Ok(ProtectedSandboxPasswords {
            version: PASSWORD_ENVELOPE_VERSION,
            offline: protection::protect(
                self.offline.expose_secret().as_bytes(),
                plan,
                SandboxAccountRole::Offline,
            )?,
            online: protection::protect(
                self.online.expose_secret().as_bytes(),
                plan,
                SandboxAccountRole::Online,
            )?,
        })
    }
}

fn generate() -> Result<SecretString, SandboxAccountSetupError> {
    let mut random = Zeroizing::new([0u8; RANDOM_PASSWORD_BYTES]);
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            random.as_mut_ptr(),
            random.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status < 0 {
        return Err(SandboxAccountSetupError::Native {
            operation: "BCryptGenRandom",
            code: status as u32,
        });
    }
    let mut text = String::with_capacity(PASSWORD_TEXT_BYTES);
    text.push_str(COMPLEXITY_PREFIX);
    STANDARD.encode_string(random.as_slice(), &mut text);
    Ok(SecretString::from(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_passwords_are_distinct_and_encrypted_output_is_redacted() {
        let plan = WindowsSandboxAccountPlan::new(uuid::Uuid::new_v4()).unwrap();
        let passwords = Passwords::generate().unwrap();
        assert!(passwords.offline.expose_secret().len() == 68);
        assert!(passwords.offline.expose_secret() != passwords.online.expose_secret());
        let protected = passwords.protect(&plan).unwrap();
        assert_eq!(
            format!("{protected:?}"),
            "ProtectedSandboxPasswords([REDACTED])"
        );
        let encoded = serde_json::to_string(&protected).unwrap();
        assert!(!encoded.contains(passwords.offline.expose_secret()));
        assert!(!encoded.contains(passwords.online.expose_secret()));
    }
}
