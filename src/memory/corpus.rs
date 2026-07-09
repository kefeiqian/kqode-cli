//! Topic-file corpus operations: serialize/parse memory items, atomic writes,
//! path-safety, content hashing, and the rebuildable `MEMORY.md` index.
//!
//! Each item is one markdown file: a `---`-fenced JSON frontmatter block
//! (metadata) followed by the markdown body. JSON frontmatter is used instead of
//! YAML to avoid a new dependency while staying inspectable and round-trippable;
//! a bare `---` line only ever appears as a fence (JSON never emits one), so a
//! body may safely contain markdown horizontal rules.

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

use super::model::{self, MemoryItem, MemoryProvenance, MemoryScope, MemoryType};
use super::{MemoryError, stable_hash_hex};

const FENCE: &str = "---";
const TOPIC_EXTENSION: &str = "md";
const INDEX_FILENAME: &str = "MEMORY.md";

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Serializable projection of a [`MemoryItem`]'s frontmatter (everything but the
/// markdown body).
#[derive(Serialize, Deserialize)]
struct TopicFrontmatter {
    id: String,
    scope: MemoryScope,
    #[serde(default)]
    scope_id: Option<String>,
    #[serde(rename = "type")]
    memory_type: MemoryType,
    title: String,
    active: bool,
    provenance: MemoryProvenance,
    content_hash: String,
}

impl TopicFrontmatter {
    fn from_item(item: &MemoryItem, content_hash: String) -> Self {
        Self {
            id: item.id.clone(),
            scope: item.scope,
            scope_id: item.scope_id.clone(),
            memory_type: item.memory_type,
            title: item.title.clone(),
            active: item.active,
            provenance: item.provenance.clone(),
            content_hash,
        }
    }

    fn into_item(self, body: String) -> MemoryItem {
        MemoryItem {
            id: self.id,
            scope: self.scope,
            scope_id: self.scope_id,
            memory_type: self.memory_type,
            title: self.title,
            body,
            active: self.active,
            provenance: self.provenance,
            content_hash: self.content_hash,
        }
    }
}

/// Computes the stable content hash over an item's metadata + body.
///
/// The hash covers the frontmatter with an empty `content_hash` plus the body,
/// so it is self-consistent: rewriting an unchanged item reproduces it, and any
/// external body/metadata edit changes it (crash/edit detection for later units).
fn compute_content_hash(item: &MemoryItem) -> Result<String, MemoryError> {
    let front = TopicFrontmatter::from_item(item, String::new());
    let json = serde_json::to_string(&front).map_err(MemoryError::Serialize)?;
    Ok(stable_hash_hex(format!("{json}\n{}", item.body).as_bytes()))
}

/// Renders an item to its on-disk topic-file text (frontmatter + body).
///
/// # Errors
/// Returns [`MemoryError`] when the id/title are invalid or serialization fails.
pub fn serialize_item(item: &MemoryItem) -> Result<String, MemoryError> {
    model::validate_id(&item.id)?;
    model::validate_title(&item.title)?;
    let hash = compute_content_hash(item)?;
    let front = TopicFrontmatter::from_item(item, hash);
    let json = serde_json::to_string_pretty(&front).map_err(MemoryError::Serialize)?;
    Ok(format!("{FENCE}\n{json}\n{FENCE}\n{}\n", item.body))
}

/// Parses topic-file text back into a [`MemoryItem`].
///
/// # Errors
/// Returns [`MemoryError::InvalidFrontmatter`] when the fences or JSON metadata
/// are malformed. The on-disk file is never mutated or deleted by parsing.
pub fn parse_item(text: &str) -> Result<MemoryItem, MemoryError> {
    let (first, mut offset) = read_line(text, 0);
    if first.trim_end_matches('\r') != FENCE {
        return Err(MemoryError::InvalidFrontmatter(
            "missing opening frontmatter fence".to_owned(),
        ));
    }
    let mut json = String::new();
    let mut body_start = None;
    while offset < text.len() {
        let (line, next) = read_line(text, offset);
        if line.trim_end_matches('\r') == FENCE {
            body_start = Some(next);
            break;
        }
        json.push_str(line);
        json.push('\n');
        offset = next;
    }
    let Some(body_start) = body_start else {
        return Err(MemoryError::InvalidFrontmatter(
            "missing closing frontmatter fence".to_owned(),
        ));
    };
    // Preserve body bytes exactly — do NOT normalize CRLF via `lines()`, which
    // would silently rewrite a CRLF body to LF and make its content hash falsely
    // diverge on the next read. Strip only the single trailing newline that
    // `serialize_item` appends after the body.
    let body = text[body_start..]
        .strip_suffix('\n')
        .unwrap_or(&text[body_start..])
        .to_owned();
    let front: TopicFrontmatter = serde_json::from_str(&json)
        .map_err(|err| MemoryError::InvalidFrontmatter(err.to_string()))?;
    Ok(front.into_item(body))
}

/// Returns the line at `start` (excluding its `\n`) and the byte offset just past
/// the terminating `\n` (or end of text). A trailing `\r` is kept in the slice so
/// the caller can strip it for fence comparison while body bytes stay verbatim.
fn read_line(text: &str, start: usize) -> (&str, usize) {
    let rest = &text[start..];
    match rest.find('\n') {
        Some(index) => (&rest[..index], start + index + 1),
        None => (rest, text.len()),
    }
}

/// Whether an item's stored content hash matches its current metadata + body.
///
/// A `false` result means the file was edited out of band; the file stays the
/// source of truth (never deleted), and callers decide how to reconcile.
#[must_use]
pub fn content_hash_matches(item: &MemoryItem) -> bool {
    compute_content_hash(item).is_ok_and(|hash| hash == item.content_hash)
}

/// Resolves the topic-file path for `id` under `root`, guarding against escape.
///
/// # Errors
/// Returns [`MemoryError::InvalidId`] for unsafe ids and
/// [`MemoryError::PathEscape`] if the normalized path leaves `root`.
pub fn item_path(root: &Path, id: &str) -> Result<PathBuf, MemoryError> {
    model::validate_id(id)?;
    let path = root.join(format!("{id}.{TOPIC_EXTENSION}"));
    ensure_within_root(root, &path)?;
    Ok(path)
}

/// Writes an item atomically to its topic file under `root`.
///
/// # Errors
/// Returns [`MemoryError`] on invalid id/title, serialization failure, path
/// escape, or filesystem errors.
pub fn write_item(root: &Path, item: &MemoryItem) -> Result<PathBuf, MemoryError> {
    // Refuse secret-shaped content before anything touches disk (R14/R16); the
    // write primitive is fail-closed so no caller can persist a credential.
    super::security::validate_for_write(&item.title, &item.body)?;
    let path = item_path(root, &item.id)?;
    let text = serialize_item(item)?;
    fs::create_dir_all(root).map_err(MemoryError::Io)?;
    write_atomic(&path, text.as_bytes())?;
    Ok(path)
}

/// Reads and parses an item from its topic file under `root`.
///
/// # Errors
/// Returns [`MemoryError`] on invalid id, filesystem errors, or malformed
/// frontmatter.
pub fn read_item(root: &Path, id: &str) -> Result<MemoryItem, MemoryError> {
    let path = item_path(root, id)?;
    let text = fs::read_to_string(&path).map_err(MemoryError::Io)?;
    parse_item(&text)
}

/// Renders the rebuildable `MEMORY.md` index for a set of items.
#[must_use]
pub fn render_index(items: &[MemoryItem]) -> String {
    let mut out = String::from(
        "# KQode memory index\n\n<!-- Generated from topic files; edit the topic files, not this index. -->\n\n",
    );
    if items.is_empty() {
        out.push_str("_No memory items._\n");
        return out;
    }
    for item in items {
        let state = if item.active { "active" } else { "candidate" };
        out.push_str(&format!(
            "- `{}` [{}] {} — updated {}ms ({state})\n",
            item.id,
            memory_type_label(item.memory_type),
            item.title,
            item.provenance.updated_at_ms,
        ));
    }
    out
}

/// Writes `MEMORY.md` atomically under `root`.
///
/// # Errors
/// Returns [`MemoryError::Io`] when the directory or file cannot be written.
pub fn write_index(root: &Path, items: &[MemoryItem]) -> Result<PathBuf, MemoryError> {
    fs::create_dir_all(root).map_err(MemoryError::Io)?;
    let path = root.join(INDEX_FILENAME);
    write_atomic(&path, render_index(items).as_bytes())?;
    Ok(path)
}

fn memory_type_label(memory_type: MemoryType) -> &'static str {
    match memory_type {
        MemoryType::User => "user",
        MemoryType::Feedback => "feedback",
        MemoryType::Project => "project",
        MemoryType::Decision => "decision",
        MemoryType::Badcase => "badcase",
        MemoryType::Reference => "reference",
    }
}

/// Writes bytes via a temp file plus rename so readers never see a partial file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), MemoryError> {
    let dir = path.parent().ok_or(MemoryError::PathEscape)?;
    fs::create_dir_all(dir).map_err(MemoryError::Io)?;
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!(".tmp-{}-{counter}", std::process::id()));
    {
        let mut file = fs::File::create(&tmp).map_err(MemoryError::Io)?;
        file.write_all(bytes).map_err(MemoryError::Io)?;
        file.sync_all().map_err(MemoryError::Io)?;
    }
    fs::rename(&tmp, path).map_err(MemoryError::Io)?;
    sync_dir(dir);
    Ok(())
}

/// Best-effort parent-directory fsync so the rename is durable (Unix only).
#[cfg(unix)]
fn sync_dir(dir: &Path) {
    if let Ok(handle) = fs::File::open(dir) {
        let _ = handle.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) {}

/// Rejects any candidate path that escapes `root` after lexical normalization.
fn ensure_within_root(root: &Path, candidate: &Path) -> Result<(), MemoryError> {
    let root_norm = normalize_lexical(root);
    let candidate_norm = normalize_lexical(candidate);
    if candidate_norm.starts_with(&root_norm) {
        Ok(())
    } else {
        Err(MemoryError::PathEscape)
    }
}

/// Collapses `.`/`..`/redundant separators without touching the filesystem, so a
/// non-existent target path can still be safety-checked before creation.
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_item(id: &str) -> MemoryItem {
        MemoryItem {
            id: id.to_owned(),
            scope: MemoryScope::User,
            scope_id: None,
            memory_type: MemoryType::Decision,
            title: "Use tabs in Go".to_owned(),
            body: "Body line one.\n\n---\n\nBody after a horizontal rule.".to_owned(),
            active: true,
            provenance: MemoryProvenance {
                source: super::super::MemorySource::Manual,
                source_session_id: Some("conv-1".to_owned()),
                source_turn_start: Some(0),
                source_turn_end: Some(0),
                created_at_ms: 1_000,
                updated_at_ms: 2_000,
            },
            content_hash: String::new(),
        }
    }

    #[test]
    fn write_then_read_round_trips_including_body_horizontal_rule() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("user");
        let item = sample_item("use-tabs");

        write_item(&root, &item).unwrap();
        let read = read_item(&root, "use-tabs").unwrap();

        assert_eq!(read.title, item.title);
        assert_eq!(read.body, item.body, "body '---' must survive round-trip");
        assert!(content_hash_matches(&read), "stored hash matches content");
        // AGENTS.md and repo files are never touched by memory writes.
        assert!(root.join("use-tabs.md").exists());
    }

    #[test]
    fn crlf_body_bytes_survive_round_trip_and_keep_hash_stable() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("user");
        let mut item = sample_item("crlf");
        item.body = "line one\r\nline two\r\n\r\nafter blank".to_owned();

        write_item(&root, &item).unwrap();
        let read = read_item(&root, "crlf").unwrap();

        assert_eq!(read.body, item.body, "CRLF bytes must not be normalized");
        assert!(
            content_hash_matches(&read),
            "an untouched CRLF item must not report as edited out of band"
        );
    }

    #[test]
    fn invalid_frontmatter_is_reported_without_deleting_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("user");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("broken.md");
        fs::write(&path, "---\nnot json at all\n---\nbody").unwrap();

        assert!(matches!(
            read_item(&root, "broken"),
            Err(MemoryError::InvalidFrontmatter(_))
        ));
        assert!(path.exists(), "invalid file must not be deleted");
    }

    #[test]
    fn traversal_ids_are_rejected_before_touching_disk() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("user");
        for bad in ["../escape", "a/b", ".."] {
            assert!(matches!(
                item_path(&root, bad),
                Err(MemoryError::InvalidId(_))
            ));
        }
    }

    #[test]
    fn external_body_edit_is_detectable_via_hash() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("user");
        write_item(&root, &sample_item("edit-me")).unwrap();

        let mut edited = read_item(&root, "edit-me").unwrap();
        edited.body.push_str("\nsomeone edited this out of band");
        assert!(
            !content_hash_matches(&edited),
            "an out-of-band edit must fail the stored hash check"
        );
    }

    #[test]
    fn index_renders_items_and_empty_state() {
        assert!(render_index(&[]).contains("No memory items"));
        let rendered = render_index(&[sample_item("use-tabs")]);
        assert!(rendered.contains("`use-tabs`"));
        assert!(rendered.contains("[decision]"));
    }
}
