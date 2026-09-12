use super::{SandboxAccountRole, SandboxAccountSetupError, WindowsSandboxAccountPlan};
use std::ptr;
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_LOCAL_MACHINE, CRYPTPROTECT_UI_FORBIDDEN,
        CryptProtectData, CryptUnprotectData,
    },
};
use zeroize::{Zeroize, Zeroizing};

const DOMAIN: &[u8] = b"KQode Windows sandbox account password v1";
pub(super) const MAX_CIPHERTEXT_BYTES: usize = 8192;

/// Binds each encrypted password to this installation and its account role.
pub(super) fn protect(
    plaintext: &[u8],
    plan: &WindowsSandboxAccountPlan,
    role: SandboxAccountRole,
) -> Result<Vec<u8>, SandboxAccountSetupError> {
    let mut plaintext = Zeroizing::new(plaintext.to_vec());
    let mut entropy = entropy(plan, role);
    let input = blob(&mut plaintext)?;
    let extra = blob(&mut entropy)?;
    let mut output = LocalBlob(CRYPT_INTEGER_BLOB::default());
    if unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            &extra,
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_LOCAL_MACHINE | CRYPTPROTECT_UI_FORBIDDEN,
            &mut output.0,
        )
    } == 0
    {
        return Err(SandboxAccountSetupError::last_os("CryptProtectData"));
    }
    let length = output.0.cbData as usize;
    if output.0.pbData.is_null() || length == 0 || length > MAX_CIPHERTEXT_BYTES {
        return Err(SandboxAccountSetupError::InvalidNativeData(
            "CryptProtectData",
        ));
    }
    Ok(unsafe { std::slice::from_raw_parts(output.0.pbData, length) }.to_vec())
}

/// Checks decodability and password shape without returning or retaining plaintext.
pub(super) fn verify_password(
    encrypted: &mut [u8],
    plan: &WindowsSandboxAccountPlan,
    role: SandboxAccountRole,
) -> Result<(), SandboxAccountSetupError> {
    use super::credentials::{COMPLEXITY_PREFIX, PASSWORD_TEXT_BYTES};
    if encrypted.is_empty() || encrypted.len() > MAX_CIPHERTEXT_BYTES {
        return Err(SandboxAccountSetupError::InvalidNativeData(
            "protected password length",
        ));
    }
    let mut extra = entropy(plan, role);
    let mut output = LocalBlob(CRYPT_INTEGER_BLOB::default());
    if unsafe {
        CryptUnprotectData(
            &blob(encrypted)?,
            ptr::null_mut(),
            &blob(&mut extra)?,
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output.0,
        )
    } == 0
    {
        return Err(SandboxAccountSetupError::last_os("CryptUnprotectData"));
    }
    if output.0.pbData.is_null() || output.0.cbData as usize != PASSWORD_TEXT_BYTES {
        return Err(SandboxAccountSetupError::InvalidNativeData(
            "protected password shape",
        ));
    }
    let bytes = unsafe { std::slice::from_raw_parts(output.0.pbData, PASSWORD_TEXT_BYTES) };
    if !bytes.starts_with(COMPLEXITY_PREFIX.as_bytes())
        || !bytes[COMPLEXITY_PREFIX.len()..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || [b'+', b'/'].contains(byte))
    {
        return Err(SandboxAccountSetupError::InvalidNativeData(
            "protected password shape",
        ));
    }
    Ok(())
}

fn entropy(plan: &WindowsSandboxAccountPlan, role: SandboxAccountRole) -> Vec<u8> {
    [DOMAIN, plan.installation_id().as_bytes(), &[role as u8]].concat()
}

fn blob(bytes: &mut [u8]) -> Result<CRYPT_INTEGER_BLOB, SandboxAccountSetupError> {
    Ok(CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len())
            .map_err(|_| SandboxAccountSetupError::InvalidNativeData("DPAPI input length"))?,
        pbData: bytes.as_mut_ptr(),
    })
}

struct LocalBlob(CRYPT_INTEGER_BLOB);
impl Drop for LocalBlob {
    fn drop(&mut self) {
        if !self.0.pbData.is_null() {
            unsafe {
                std::slice::from_raw_parts_mut(self.0.pbData, self.0.cbData as usize).zeroize();
                LocalFree(self.0.pbData.cast());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::Security::Cryptography::CryptUnprotectData;

    #[test]
    fn machine_dpapi_roundtrip_requires_matching_installation_and_role() {
        let plan = WindowsSandboxAccountPlan::new(uuid::Uuid::new_v4()).unwrap();
        let other = WindowsSandboxAccountPlan::new(uuid::Uuid::new_v4()).unwrap();
        let data = b"non-credential test payload";
        let mut encrypted = protect(data, &plan, SandboxAccountRole::Offline).unwrap();
        for (id, role, success) in [
            (&plan, SandboxAccountRole::Offline, true),
            (&plan, SandboxAccountRole::Online, false),
            (&other, SandboxAccountRole::Offline, false),
        ] {
            let mut entropy = entropy(id, role);
            let mut output = LocalBlob(CRYPT_INTEGER_BLOB::default());
            let result = unsafe {
                CryptUnprotectData(
                    &blob(&mut encrypted).unwrap(),
                    ptr::null_mut(),
                    &blob(&mut entropy).unwrap(),
                    ptr::null(),
                    ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output.0,
                )
            };
            assert_eq!(result != 0, success);
            if success {
                let bytes = unsafe {
                    std::slice::from_raw_parts(output.0.pbData, output.0.cbData as usize)
                };
                assert!(bytes == data);
            }
        }
    }
}
