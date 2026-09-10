use std::{fmt, io, path::PathBuf};

/// Snapshot preparation failures never return a partially prepared workspace.
#[derive(Debug)]
pub enum SnapshotError {
    UnsupportedPlatform,
    InvalidLimit(&'static str),
    DestinationInsideSource,
    UnsupportedEntry {
        path: PathBuf,
        reason: &'static str,
    },
    LimitExceeded(&'static str),
    Cancelled,
    SourceChanged(PathBuf),
    SnapshotMoved,
    Io {
        operation: &'static str,
        source: io::Error,
    },
}

impl SnapshotError {
    pub(super) fn io(operation: &'static str, source: io::Error) -> Self {
        Self::Io { operation, source }
    }
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedPlatform => {
                write!(f, "workspace snapshot preparation requires native Windows")
            }
            Self::InvalidLimit(name) => write!(f, "invalid workspace snapshot limit: {name}"),
            Self::DestinationInsideSource => write!(
                f,
                "snapshot destination must be outside the source workspace"
            ),
            Self::UnsupportedEntry { path, reason } => {
                write!(f, "unsupported snapshot entry {}: {reason}", path.display())
            }
            Self::LimitExceeded(name) => write!(f, "workspace snapshot limit exceeded: {name}"),
            Self::Cancelled => write!(f, "workspace snapshot preparation cancelled"),
            Self::SourceChanged(path) => write!(
                f,
                "source changed while preparing snapshot: {}",
                path.display()
            ),
            Self::SnapshotMoved => write!(
                f,
                "owned workspace snapshot no longer has its prepared location"
            ),
            Self::Io { operation, source } => write!(f, "{operation}: {source}"),
        }
    }
}

impl std::error::Error for SnapshotError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}
