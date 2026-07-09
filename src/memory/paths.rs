//! Opaque, workspace-scoped memory roots under the KQode home.
//!
//! Scope roots are keyed by opaque ids derived from *canonical* workspace
//! identity, never raw local paths (KTD4). Two workspaces whose names collide
//! but whose real locations differ get isolated repo roots, and a workspace
//! whose canonical identity cannot be resolved yields no repo/folder id so the
//! caller fails closed instead of guessing a shared root.

use std::path::{Path, PathBuf};

use super::{MemoryError, stable_hash_hex};

const USER_SUBDIR: &str = "user";
const REPO_SUBDIR: &str = "repo";
const FOLDER_SUBDIR: &str = "folder";
const SESSION_SUBDIR: &str = "session";

/// Resolves scope roots under an explicit memory base directory.
///
/// Constructed from the KQode home in production via [`ScopeRoots::from_home`],
/// or from a temp base in tests.
#[derive(Clone, Debug)]
pub struct ScopeRoots {
    base: PathBuf,
}

impl ScopeRoots {
    /// Creates a resolver rooted at `base` (`<...>/memory`).
    #[must_use]
    pub fn new(base: PathBuf) -> Self {
        Self { base }
    }

    /// Creates a resolver rooted at `<kqode_home>/memory`.
    ///
    /// # Errors
    /// Returns [`MemoryError::NoHome`] when the KQode home cannot be resolved.
    pub fn from_home() -> Result<Self, MemoryError> {
        Ok(Self::new(
            crate::paths::memory_dir().ok_or(MemoryError::NoHome)?,
        ))
    }

    /// The memory base directory.
    #[must_use]
    pub fn base(&self) -> &Path {
        &self.base
    }

    /// The user-global scope root (`<memory>/user`).
    #[must_use]
    pub fn user(&self) -> PathBuf {
        self.base.join(USER_SUBDIR)
    }

    /// The repo scope root for an opaque repo id (`<memory>/repo/<repo_id>`).
    #[must_use]
    pub fn repo(&self, repo_id: &str) -> PathBuf {
        self.base.join(REPO_SUBDIR).join(repo_id)
    }

    /// The folder scope root nested under its repo
    /// (`<memory>/repo/<repo_id>/folder/<folder_id>`).
    #[must_use]
    pub fn folder(&self, repo_id: &str, folder_id: &str) -> PathBuf {
        self.base
            .join(REPO_SUBDIR)
            .join(repo_id)
            .join(FOLDER_SUBDIR)
            .join(folder_id)
    }

    /// The session scope root (`<memory>/session/<session_id>`).
    #[must_use]
    pub fn session(&self, session_id: &str) -> PathBuf {
        self.base.join(SESSION_SUBDIR).join(session_id)
    }
}

/// Derives an opaque repo scope id from a workspace directory.
///
/// Canonicalizes the path first so symlinks and `.`/`..` segments collapse to
/// one real identity. Returns `None` when the path cannot be canonicalized
/// (e.g. it does not exist), signalling the caller to fail closed (KTD4).
#[must_use]
pub fn repo_scope_id(workspace_cwd: &Path) -> Option<String> {
    let canonical = std::fs::canonicalize(workspace_cwd).ok()?;
    Some(stable_hash_hex(canonical.as_os_str().as_encoded_bytes()))
}

/// Derives an opaque folder scope id from a repo-relative subpath.
///
/// The subpath is normalized to forward slashes so the same folder hashes
/// identically regardless of the host path separator.
#[must_use]
pub fn folder_scope_id(repo_relative_subpath: &str) -> String {
    let normalized = repo_relative_subpath.replace('\\', "/");
    stable_hash_hex(normalized.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_and_repo_roots_are_distinct() {
        let roots = ScopeRoots::new(PathBuf::from("/tmp/mem"));
        let user = roots.user();
        let repo = roots.repo("abc");
        assert_ne!(user, repo);
        assert!(repo.ends_with(PathBuf::from("repo").join("abc")));
        assert!(roots.folder("abc", "def").starts_with(roots.repo("abc")));
    }

    #[test]
    fn similar_named_workspaces_get_isolated_repo_ids() {
        let dir = tempfile::tempdir().unwrap();
        let one = dir.path().join("proj");
        let two = dir.path().join("nested").join("proj");
        std::fs::create_dir_all(&one).unwrap();
        std::fs::create_dir_all(&two).unwrap();

        let id_one = repo_scope_id(&one).expect("canonical id");
        let id_two = repo_scope_id(&two).expect("canonical id");
        assert_ne!(id_one, id_two, "same basename must not share a repo root");
        assert_eq!(id_one, repo_scope_id(&one).unwrap(), "id is stable");
    }

    #[test]
    fn unresolvable_workspace_yields_no_repo_id() {
        let missing = Path::new("/definitely/not/a/real/kqode/path/xyz");
        assert!(repo_scope_id(missing).is_none());
    }

    #[test]
    fn folder_ids_are_separator_independent() {
        assert_eq!(
            folder_scope_id("src/memory"),
            folder_scope_id("src\\memory")
        );
    }
}
