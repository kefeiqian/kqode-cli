//! Local memory system: file-truth memory items with a rebuildable index.
//!
//! Topic markdown files under KQode-controlled roots are the durable truth for
//! remembered facts (KTD1); `MEMORY.md` is a rebuildable index. This module
//! (U1) provides the foundation: the item model, opaque workspace-scoped roots
//! under the KQode home, atomic topic-file corpus operations, and content
//! validation that keeps secrets out of storage and quarantines
//! injection-shaped text from prompt loading.

pub mod corpus;
pub mod event_log;
pub mod inbox;
pub mod index;
pub mod model;
pub mod paths;
pub mod prompt;
pub mod security;

use std::fmt;
use std::io;

pub use event_log::{InboxProposal, InboxStatus, MemoryEvent, MemoryOp};
pub use inbox::InboxAction;
pub use index::MemoryService;
pub use model::{MemoryItem, MemoryProvenance, MemoryScope, MemorySource, MemoryType};
pub use paths::ScopeRoots;
pub use prompt::MemoryContext;
pub use security::{PromptSafety, SensitiveVerdict};

/// Errors from memory model, path, corpus, and validation operations.
///
/// Variants deliberately carry only structural detail or static reason labels,
/// never raw memory content or secret values, so error surfaces cannot become a
/// second copy of sensitive data (R18).
#[derive(Debug)]
pub enum MemoryError {
    /// The KQode home directory could not be resolved.
    NoHome,
    /// A memory id was not a safe slug.
    InvalidId(&'static str),
    /// A memory title was empty, multi-line, or too long.
    InvalidTitle(&'static str),
    /// A topic file's frontmatter could not be parsed (structural detail only).
    InvalidFrontmatter(String),
    /// A resolved item path escaped its scope root after normalization.
    PathEscape,
    /// Repo/folder workspace identity could not be canonicalized; fail closed.
    ScopeAmbiguous,
    /// Content was refused because it looked like a secret/credential.
    BlockedSensitive(&'static str),
    /// A requested memory item does not exist.
    NotFound,
    /// A request/response payload exceeded its size cap.
    PayloadTooLarge(&'static str),
    /// A SQLite index operation failed (message carries no memory content).
    Store(String),
    /// A filesystem operation failed.
    Io(io::Error),
    /// Frontmatter (de)serialization failed.
    Serialize(serde_json::Error),
}

impl fmt::Display for MemoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoHome => write!(f, "could not resolve the KQode home directory"),
            Self::InvalidId(reason) => write!(f, "invalid memory id: {reason}"),
            Self::InvalidTitle(reason) => write!(f, "invalid memory title: {reason}"),
            Self::InvalidFrontmatter(detail) => write!(f, "invalid memory frontmatter: {detail}"),
            Self::PathEscape => write!(f, "memory path escaped its scope root"),
            Self::ScopeAmbiguous => write!(f, "workspace memory scope identity is ambiguous"),
            Self::BlockedSensitive(reason) => {
                write!(f, "memory content blocked as sensitive: {reason}")
            }
            Self::NotFound => write!(f, "memory item not found"),
            Self::PayloadTooLarge(what) => write!(f, "memory payload too large: {what}"),
            Self::Store(detail) => write!(f, "memory index error: {detail}"),
            Self::Io(err) => write!(f, "memory filesystem error: {err}"),
            Self::Serialize(err) => write!(f, "memory serialization error: {err}"),
        }
    }
}

impl std::error::Error for MemoryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            Self::Serialize(err) => Some(err),
            _ => None,
        }
    }
}

/// A stable 128-bit FNV-1a hash rendered as 32 lowercase hex chars.
///
/// Hand-rolled (no hashing crate) to keep the dependency surface small and,
/// unlike `std::hash::DefaultHasher`, to guarantee the same value across Rust
/// releases and platforms — memory scope roots and content hashes persist on
/// disk and must stay stable across KQode upgrades. Used for opaque scope ids
/// and for accidental-divergence/crash detection, not as a cryptographic MAC.
#[must_use]
pub fn stable_hash_hex(bytes: &[u8]) -> String {
    const OFFSET_BASIS: u128 = 0x6c62_272e_07bb_0142_62b8_2175_6295_c58d;
    const PRIME: u128 = 0x0000_0000_0100_0000_0000_0000_0000_013b;
    let mut hash = OFFSET_BASIS;
    for &byte in bytes {
        hash ^= u128::from(byte);
        hash = hash.wrapping_mul(PRIME);
    }
    format!("{hash:032x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_hash_is_deterministic_and_distinguishes_inputs() {
        assert_eq!(stable_hash_hex(b"kqode"), stable_hash_hex(b"kqode"));
        assert_ne!(stable_hash_hex(b"kqode"), stable_hash_hex(b"kqode2"));
        assert_eq!(stable_hash_hex(b"kqode").len(), 32);
    }

    #[test]
    fn errors_never_echo_raw_content() {
        // Sensitive/invalid variants carry only static labels, so formatting an
        // error can never leak the offending memory body or secret value.
        let blocked = MemoryError::BlockedSensitive("api_token").to_string();
        assert!(blocked.contains("api_token"));
        assert!(!blocked.contains("sk-"));
    }
}
