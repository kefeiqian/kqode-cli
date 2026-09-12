use std::{fmt, io};

use super::SandboxAccountRole;

/// Setup failures do not enable, adopt, delete or reset any principal.
///
/// After a mutation starts, the private journal and any returned ownership checkpoint
/// require explicit recovery. A missing completion record is never assumed successful.
#[derive(Debug)]
pub enum SandboxAccountSetupError {
    InvalidPlan,
    InvalidTimeout,
    ElevationRequired,
    DomainControllerUnsupported,
    Cancelled,
    TimedOut,
    NameAlreadyExists(SandboxAccountRole),
    OwnershipMismatch(SandboxAccountRole),
    InvalidNativeData(&'static str),
    Native {
        operation: &'static str,
        code: u32,
    },
    Journal {
        operation: &'static str,
        source: io::Error,
    },
}

impl SandboxAccountSetupError {
    pub(super) fn last_os(operation: &'static str) -> Self {
        Self::Native {
            operation,
            code: unsafe { windows_sys::Win32::Foundation::GetLastError() },
        }
    }
}

impl fmt::Display for SandboxAccountSetupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPlan => write!(f, "sandbox installation ID must not be nil"),
            Self::InvalidTimeout => write!(f, "invalid sandbox account setup timeout"),
            Self::ElevationRequired => write!(
                f,
                "sandbox account setup requires explicit administrator authorization and elevation"
            ),
            Self::DomainControllerUnsupported => write!(
                f,
                "sandbox local-account setup is not supported on domain controllers"
            ),
            Self::Cancelled => write!(
                f,
                "sandbox account setup cancelled; inspect its journal before recovery"
            ),
            Self::TimedOut => write!(
                f,
                "sandbox account setup timed out; inspect its journal before recovery"
            ),
            Self::NameAlreadyExists(role) => {
                write!(f, "sandbox {role:?} name already exists; refusing adoption")
            }
            Self::OwnershipMismatch(role) => write!(
                f,
                "sandbox {role:?} identity or disabled-account state does not match"
            ),
            Self::InvalidNativeData(operation) => {
                write!(f, "invalid native result during {operation}")
            }
            Self::Native { operation, code } => write!(
                f,
                "{operation} failed ({code:#x}); inspect the setup journal"
            ),
            Self::Journal { operation, source } => {
                write!(f, "sandbox setup journal {operation} failed: {source}")
            }
        }
    }
}

impl std::error::Error for SandboxAccountSetupError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Journal { source, .. } => Some(source),
            _ => None,
        }
    }
}
