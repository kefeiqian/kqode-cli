//! Memory item model: scopes, types, provenance, and validation helpers.

use serde::{Deserialize, Serialize};

use super::MemoryError;

/// Maximum length of a memory id slug.
const MAX_ID_LEN: usize = 128;
/// Maximum length of a single-line memory title.
const MAX_TITLE_LEN: usize = 200;

/// Where a remembered fact applies.
///
/// A `team`/shared scope is intentionally reserved for future work and is not
/// constructed in v1; the serialized `snake_case` string space leaves room for
/// it without a schema change (R2).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScope {
    /// Applies to the user across every workspace.
    User,
    /// Applies to one repository/project identity.
    Repo,
    /// Applies to a folder/subtree within a repository.
    Folder,
    /// Applies only to the originating session.
    Session,
}

/// Classification of a remembered fact (R3).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryType {
    /// A durable user preference or working convention.
    User,
    /// Feedback/correction the user gave about KQode's behavior.
    Feedback,
    /// Repo or folder project context.
    Project,
    /// A recorded project decision.
    Decision,
    /// A recurring failure case worth avoiding.
    Badcase,
    /// An external reference (doc, link, spec).
    Reference,
}

/// How a memory item was authored.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemorySource {
    /// An explicit `/memory` command or memory tool call.
    Manual,
    /// A lifecycle-extraction proposal accepted into the corpus.
    Extraction,
    /// Discovered from an out-of-band edit to a memory file.
    External,
}

/// Provenance recorded for every item and every automatic change (R4).
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
pub struct MemoryProvenance {
    /// The authoring path that produced this item.
    pub source: MemorySource,
    /// Session that originated the item, when known.
    #[serde(default)]
    pub source_session_id: Option<String>,
    /// Inclusive start of the source turn range, when known.
    #[serde(default)]
    pub source_turn_start: Option<u64>,
    /// Inclusive end of the source turn range, when known.
    #[serde(default)]
    pub source_turn_end: Option<u64>,
    /// Creation timestamp (epoch ms).
    pub created_at_ms: i64,
    /// Last-update timestamp (epoch ms).
    pub updated_at_ms: i64,
}

/// A single remembered fact.
///
/// The topic markdown file is its durable truth; this is the in-memory
/// projection of that file's frontmatter (metadata) plus its markdown body.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemoryItem {
    /// Stable slug id; also the topic filename stem.
    pub id: String,
    /// Scope kind this item applies to.
    pub scope: MemoryScope,
    /// Opaque scope identity for repo/folder/session; `None` for user-global.
    pub scope_id: Option<String>,
    /// Item classification.
    pub memory_type: MemoryType,
    /// Single-line human title.
    pub title: String,
    /// Markdown body content.
    pub body: String,
    /// Whether this is active memory (vs an inactive candidate).
    pub active: bool,
    /// Provenance and timestamps.
    pub provenance: MemoryProvenance,
    /// Stable content hash of metadata+body, filled on read/serialize.
    pub content_hash: String,
}

/// Validates a memory id is a safe slug so it cannot escape a scope root.
///
/// # Errors
/// Returns [`MemoryError::InvalidId`] when the id is empty, too long, or
/// contains any character outside `[A-Za-z0-9_-]` (which also rejects `.`, `/`,
/// `\\`, and `..` traversal attempts).
pub fn validate_id(id: &str) -> Result<(), MemoryError> {
    if id.is_empty() {
        return Err(MemoryError::InvalidId("id must not be empty"));
    }
    if id.len() > MAX_ID_LEN {
        return Err(MemoryError::InvalidId("id exceeds the maximum length"));
    }
    if !id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(MemoryError::InvalidId("id must contain only [A-Za-z0-9_-]"));
    }
    Ok(())
}

/// Validates a memory title is non-empty, single-line, and bounded.
///
/// # Errors
/// Returns [`MemoryError::InvalidTitle`] when the title is blank, too long, or
/// contains a line break (which would break the single-line frontmatter title).
pub fn validate_title(title: &str) -> Result<(), MemoryError> {
    if title.trim().is_empty() {
        return Err(MemoryError::InvalidTitle("title must not be empty"));
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Err(MemoryError::InvalidTitle(
            "title exceeds the maximum length",
        ));
    }
    if title.contains('\n') || title.contains('\r') {
        return Err(MemoryError::InvalidTitle("title must be a single line"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_and_type_serialize_as_snake_case_strings() {
        assert_eq!(
            serde_json::to_string(&MemoryScope::Repo).unwrap(),
            "\"repo\""
        );
        assert_eq!(
            serde_json::to_string(&MemoryType::Badcase).unwrap(),
            "\"badcase\""
        );
    }

    #[test]
    fn valid_ids_pass_and_traversal_ids_fail() {
        assert!(validate_id("user-pref_1").is_ok());
        for bad in ["", "../evil", "a/b", "a\\b", "a.b", "space id"] {
            assert!(validate_id(bad).is_err(), "expected {bad:?} to be rejected");
        }
    }

    #[test]
    fn titles_must_be_single_line_and_nonempty() {
        assert!(validate_title("A decision").is_ok());
        assert!(validate_title("   ").is_err());
        assert!(validate_title("line one\nline two").is_err());
        assert!(validate_title(&"x".repeat(MAX_TITLE_LEN + 1)).is_err());
    }
}
