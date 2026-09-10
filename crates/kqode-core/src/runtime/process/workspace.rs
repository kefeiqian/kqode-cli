use std::path::{Path, PathBuf};

use super::WorkspaceError;

/// Canonical workspace boundary used to validate process working directories.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspacePolicy {
    root: PathBuf,
}

impl WorkspacePolicy {
    /// Creates a policy rooted at an existing directory.
    ///
    /// # Errors
    ///
    /// Returns an error when the root cannot be canonicalized or is not a directory.
    pub fn new(root: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let root = canonical_directory(root.as_ref())?;
        Ok(Self { root })
    }

    /// Returns the canonical workspace root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Resolves an optional absolute or workspace-relative cwd without allowing escape.
    ///
    /// # Errors
    ///
    /// Returns an error when the requested directory does not exist, is not a directory,
    /// or resolves outside the canonical workspace through traversal or a link.
    pub fn resolve_cwd(&self, requested: Option<&Path>) -> Result<PathBuf, WorkspaceError> {
        let requested = requested.unwrap_or_else(|| Path::new(""));
        let candidate = if requested.as_os_str().is_empty() {
            self.root.clone()
        } else if requested.is_absolute() {
            requested.to_owned()
        } else {
            self.root.join(requested)
        };
        let canonical = canonical_directory(&candidate)?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::OutsideWorkspace {
                workspace: self.root.clone(),
                requested: canonical,
            });
        }
        Ok(canonical)
    }
}

fn canonical_directory(path: &Path) -> Result<PathBuf, WorkspaceError> {
    let canonical = path
        .canonicalize()
        .map_err(|source| WorkspaceError::Canonicalize {
            path: path.to_owned(),
            source,
        })?;
    if !canonical.is_dir() {
        return Err(WorkspaceError::NotDirectory(canonical));
    }
    Ok(canonical)
}
