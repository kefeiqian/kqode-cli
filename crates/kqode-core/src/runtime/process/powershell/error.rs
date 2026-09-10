use std::{fmt, io, path::PathBuf};

/// A shell could not be resolved or its script could not be transported safely.
#[derive(Debug)]
pub enum PowerShellError {
    UnsupportedPlatform,
    ExecutableNotFound,
    InvalidExecutablePath(PathBuf),
    InspectExecutable { path: PathBuf, source: io::Error },
    EmptyCommand,
    CommandTooLong { max_utf16_units: usize },
}

impl fmt::Display for PowerShellError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedPlatform => write!(f, "native PowerShell execution requires Windows"),
            Self::ExecutableNotFound => {
                write!(
                    f,
                    "native PowerShell was not found; install PowerShell or configure its absolute executable path"
                )
            }
            Self::InvalidExecutablePath(path) => write!(
                f,
                "`{}` must be an absolute path to a pwsh.exe or powershell.exe file",
                path.display(),
            ),
            Self::InspectExecutable { path, source } => {
                write!(
                    f,
                    "inspect PowerShell executable `{}`: {source}",
                    path.display()
                )
            }
            Self::EmptyCommand => write!(f, "PowerShell command must not be blank"),
            Self::CommandTooLong { max_utf16_units } => write!(
                f,
                "PowerShell command exceeds the transport limit of {max_utf16_units} UTF-16 code units",
            ),
        }
    }
}

impl std::error::Error for PowerShellError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InspectExecutable { source, .. } => Some(source),
            _ => None,
        }
    }
}
