use std::{fmt, io};

use super::{SandboxCapability, SandboxEnforcement};
use crate::runtime::{PowerShellError, ProcessError, WorkspaceError};

/// Typed refusal or execution failure; messages never contain scripts or environment values.
#[derive(Debug)]
pub enum CommandGateError {
    InvalidRequest(&'static str),
    InvalidEnvironment,
    Executable(io::Error),
    Shell(PowerShellError),
    Workspace(WorkspaceError),
    PolicyDenied,
    BackendUnavailable,
    UnsupportedCapability {
        capability: SandboxCapability,
        enforcement: SandboxEnforcement,
    },
    ApprovalUnavailable,
    ApprovalRejected,
    ApprovalMismatch,
    ApprovalTimedOut,
    Cancelled,
    Backend(ProcessError),
}

impl fmt::Display for CommandGateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRequest(reason) => write!(f, "invalid command request: {reason}"),
            Self::InvalidEnvironment => write!(
                f,
                "command environment contains invalid, duplicate, or secret-like overrides"
            ),
            Self::Executable(error) => write!(f, "validate command executable: {error}"),
            Self::Shell(error) => error.fmt(f),
            Self::Workspace(error) => error.fmt(f),
            Self::PolicyDenied => write!(f, "command denied by policy"),
            Self::BackendUnavailable => write!(f, "required sandbox backend is unavailable"),
            Self::UnsupportedCapability {
                capability,
                enforcement,
            } => {
                write!(
                    f,
                    "sandbox requires full {capability:?} enforcement; backend reports {enforcement:?}"
                )
            }
            Self::ApprovalUnavailable => write!(
                f,
                "fresh command approval is required but no responder is available"
            ),
            Self::ApprovalRejected => write!(f, "command approval was rejected"),
            Self::ApprovalMismatch => {
                write!(f, "approval response does not match this command request")
            }
            Self::ApprovalTimedOut => write!(f, "command approval deadline exceeded"),
            Self::Cancelled => write!(f, "command cancelled before completion"),
            Self::Backend(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for CommandGateError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Executable(error) => Some(error),
            Self::Shell(error) => Some(error),
            Self::Workspace(error) => Some(error),
            Self::Backend(error) => Some(error),
            _ => None,
        }
    }
}

impl From<WorkspaceError> for CommandGateError {
    fn from(error: WorkspaceError) -> Self {
        Self::Workspace(error)
    }
}

impl From<ProcessError> for CommandGateError {
    fn from(error: ProcessError) -> Self {
        Self::Backend(error)
    }
}
