use std::{fmt, io, path::PathBuf};

/// Failure while validating a workspace or requested working directory.
#[derive(Debug)]
pub enum WorkspaceError {
    Canonicalize {
        path: PathBuf,
        source: io::Error,
    },
    NotDirectory(PathBuf),
    OutsideWorkspace {
        workspace: PathBuf,
        requested: PathBuf,
    },
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Canonicalize { path, source } => {
                write!(formatter, "canonicalize `{}`: {source}", path.display())
            }
            Self::NotDirectory(path) => {
                write!(formatter, "`{}` is not a directory", path.display())
            }
            Self::OutsideWorkspace {
                workspace,
                requested,
            } => write!(
                formatter,
                "working directory `{}` escapes workspace `{}`",
                requested.display(),
                workspace.display()
            ),
        }
    }
}

impl std::error::Error for WorkspaceError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Canonicalize { source, .. } => Some(source),
            Self::NotDirectory(_) | Self::OutsideWorkspace { .. } => None,
        }
    }
}

/// Infrastructure failure while preparing or supervising a child process.
#[derive(Debug)]
pub enum ProcessError {
    Workspace(WorkspaceError),
    InvalidLimit(&'static str),
    Spawn(io::Error),
    Supervision(io::Error),
    MissingPipe(&'static str),
}

impl fmt::Display for ProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Workspace(error) => error.fmt(formatter),
            Self::InvalidLimit(name) => write!(formatter, "`{name}` must be greater than zero"),
            Self::Spawn(error) => write!(formatter, "spawn process: {error}"),
            Self::Supervision(error) => write!(formatter, "supervise process: {error}"),
            Self::MissingPipe(name) => write!(formatter, "child process did not expose {name}"),
        }
    }
}

impl std::error::Error for ProcessError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Workspace(error) => Some(error),
            Self::Spawn(error) | Self::Supervision(error) => Some(error),
            Self::InvalidLimit(_) | Self::MissingPipe(_) => None,
        }
    }
}

impl From<WorkspaceError> for ProcessError {
    fn from(error: WorkspaceError) -> Self {
        Self::Workspace(error)
    }
}
