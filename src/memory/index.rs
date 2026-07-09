//! Backend memory service: composes corpus writes, the event log, and the
//! SQLite index into cohesive item operations (add/edit/forget/list/show/reload).
//!
//! The backend is the only component that mutates memory truth (KTD6/KTD12).
//! Every mutation records a durable operation intent before its atomic file
//! write so a crash between the two is reconcilable, and a rollback snapshot so
//! a later change can be undone.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::event_log::{self, MemoryEvent, MemoryOp};
use super::{
    MemoryError, MemoryItem, MemoryProvenance, MemoryScope, MemorySource, MemoryType, ScopeRoots,
    corpus, model, paths, security,
};
use crate::store::{Store, StoredMemoryItem};

/// One global lifecycle log lives under the top-level memory root.
pub(super) const MEMORY_EVENTS_FILENAME: &str = "memory_events.jsonl";
/// Max title length accepted over the wire (bytes).
const MAX_TITLE_BYTES: usize = 400;
/// Max body length accepted over the wire (bytes).
const MAX_BODY_BYTES: usize = 32 * 1024;
/// Max slug length derived from a title for an item id.
const MAX_ID_SLUG: usize = 80;

static OP_COUNTER: AtomicU64 = AtomicU64::new(0);
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Backend-owned memory operations for one workspace context.
pub struct MemoryService {
    store: Store,
    roots: ScopeRoots,
    event_log_path: PathBuf,
    repo_scope_id: Option<String>,
    session_id: Option<String>,
}

impl MemoryService {
    /// Builds a service whose memory root sits beside the store DB
    /// (`<store_dir>/memory`, matching [`Store::reindex_memory_from_files`]),
    /// resolving the current workspace's opaque repo scope id (fails closed later
    /// if ambiguous, KTD4).
    ///
    /// # Errors
    /// Returns [`MemoryError::NoHome`] when the store path has no parent
    /// directory to anchor the memory root.
    pub fn new(
        store: Store,
        workspace_cwd: &Path,
        session_id: Option<String>,
    ) -> Result<Self, MemoryError> {
        let base = store
            .path()
            .parent()
            .map(|dir| dir.join("memory"))
            .ok_or(MemoryError::NoHome)?;
        let roots = ScopeRoots::new(base);
        Ok(Self::with_roots(
            store,
            roots,
            paths::repo_scope_id(workspace_cwd),
            session_id,
        ))
    }

    /// Builds a service against explicit roots (test-friendly).
    #[must_use]
    pub fn with_roots(
        store: Store,
        roots: ScopeRoots,
        repo_scope_id: Option<String>,
        session_id: Option<String>,
    ) -> Self {
        let event_log_path = roots.base().join(MEMORY_EVENTS_FILENAME);
        Self {
            store,
            roots,
            event_log_path,
            repo_scope_id,
            session_id,
        }
    }

    /// The event-log path this service appends to.
    #[must_use]
    pub fn event_log_path(&self) -> &Path {
        &self.event_log_path
    }

    pub(super) fn store(&self) -> &Store {
        &self.store
    }

    /// Resolves a scope to its stored scope id and on-disk root, failing closed
    /// when a repo/folder identity is required but unavailable (KTD4).
    pub(super) fn resolve(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
    ) -> Result<(Option<String>, PathBuf), MemoryError> {
        match scope {
            MemoryScope::User => Ok((None, self.roots.user())),
            MemoryScope::Repo => {
                let id = scope_id
                    .map(str::to_owned)
                    .or_else(|| self.repo_scope_id.clone())
                    .ok_or(MemoryError::ScopeAmbiguous)?;
                let root = self.roots.repo(&id);
                Ok((Some(id), root))
            }
            MemoryScope::Session => {
                let id = scope_id
                    .map(str::to_owned)
                    .or_else(|| self.session_id.clone())
                    .ok_or(MemoryError::ScopeAmbiguous)?;
                let root = self.roots.session(&id);
                Ok((Some(id), root))
            }
            MemoryScope::Folder => {
                let repo = self
                    .repo_scope_id
                    .clone()
                    .ok_or(MemoryError::ScopeAmbiguous)?;
                let folder = scope_id.ok_or(MemoryError::ScopeAmbiguous)?.to_owned();
                let root = self.roots.folder(&repo, &folder);
                Ok((Some(folder), root))
            }
        }
    }

    /// Adds a new active memory item and projects it into the index.
    ///
    /// # Errors
    /// Returns [`MemoryError`] on ambiguous scope, oversized/secret content, or
    /// filesystem/index failure.
    pub fn add(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        memory_type: MemoryType,
        title: String,
        body: String,
    ) -> Result<StoredMemoryItem, MemoryError> {
        // Validate fully up front (title validity, size, secrets) so a refused
        // write never appends a durable operation intent (no orphan pending op).
        model::validate_title(&title)?;
        enforce_sizes(&title, &body)?;
        security::validate_for_write(&title, &body)?;
        let (resolved, root) = self.resolve(scope, scope_id)?;
        let now = now_ms();
        let mut item = MemoryItem {
            id: new_item_id(&title),
            scope,
            scope_id: resolved,
            memory_type,
            title,
            body,
            active: true,
            provenance: MemoryProvenance {
                source: MemorySource::Manual,
                source_session_id: self.session_id.clone(),
                source_turn_start: None,
                source_turn_end: None,
                created_at_ms: now,
                updated_at_ms: now,
            },
            content_hash: String::new(),
        };
        self.persist(&new_op_id(), &root, &mut item, MemoryOp::Write)
    }

    /// Edits an existing item's title/body, recording a rollback snapshot first.
    ///
    /// # Errors
    /// Returns [`MemoryError::NotFound`] for an unknown id, or other
    /// [`MemoryError`] on oversized/secret content or filesystem/index failure.
    pub fn edit(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        id: &str,
        title: Option<String>,
        body: Option<String>,
    ) -> Result<StoredMemoryItem, MemoryError> {
        let (resolved, root) = self.resolve(scope, scope_id)?;
        let mut item = corpus::read_item(&root, id)?;
        let prior = item.clone();
        if let Some(title) = title {
            item.title = title;
        }
        if let Some(body) = body {
            item.body = body;
        }
        // Validate the edited content fully before appending any event, so a bad
        // edit orphans neither a RollbackPoint nor an OperationStarted.
        model::validate_title(&item.title)?;
        enforce_sizes(&item.title, &item.body)?;
        security::validate_for_write(&item.title, &item.body)?;
        item.provenance.updated_at_ms = now_ms();
        let op_id = new_op_id();
        self.record_rollback(&op_id, &prior, resolved.as_deref())?;
        self.persist(&op_id, &root, &mut item, MemoryOp::Write)
    }

    /// Forgets (removes) an item, recording a rollback snapshot so it can be
    /// restored. Returns whether a topic file was actually removed.
    ///
    /// # Errors
    /// Returns [`MemoryError`] on ambiguous scope or filesystem/index failure.
    pub fn forget(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        id: &str,
    ) -> Result<bool, MemoryError> {
        let (resolved, root) = self.resolve(scope, scope_id)?;
        let prior = corpus::read_item(&root, id).ok();
        let op_id = new_op_id();
        if let Some(prior) = &prior {
            self.record_rollback(&op_id, prior, resolved.as_deref())?;
        }
        self.append(&MemoryEvent::OperationStarted {
            operation_id: op_id.clone(),
            item_id: id.to_owned(),
            scope,
            scope_id: resolved.clone(),
            op: MemoryOp::Forget,
            base_hash: prior.as_ref().map(|item| item.content_hash.clone()),
            result_hash: None,
            at_ms: now_ms(),
        })?;
        let removed = corpus::remove_item(&root, id)?;
        self.append(&MemoryEvent::OperationApplied {
            operation_id: op_id,
            at_ms: now_ms(),
        })?;
        self.store
            .delete_memory_item(scope, resolved.as_deref(), id)
            .map_err(store_err)?;
        Ok(removed)
    }

    /// Lists items visible in the current workspace (user + repo + session),
    /// newest-updated first, optionally filtered by scope.
    ///
    /// # Errors
    /// Returns [`MemoryError::Store`] on an index query failure.
    pub fn list(
        &self,
        scope_filter: Option<MemoryScope>,
        active_only: bool,
    ) -> Result<Vec<StoredMemoryItem>, MemoryError> {
        let mut items = Vec::new();
        for (scope, scope_id) in self.applicable_scopes() {
            if scope_filter.is_some_and(|filter| filter != scope) {
                continue;
            }
            items.extend(
                self.store
                    .list_memory_items(scope, scope_id.as_deref(), active_only)
                    .map_err(store_err)?,
            );
        }
        items.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then(left.id.cmp(&right.id))
        });
        Ok(items)
    }

    /// Reads one item's metadata + body.
    ///
    /// # Errors
    /// Returns [`MemoryError::NotFound`] for an unknown id in the resolved scope
    /// (which also rejects cross-scope access, since the file is not under this
    /// scope's root), or other [`MemoryError`] on failure.
    pub fn show(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        id: &str,
    ) -> Result<(StoredMemoryItem, String), MemoryError> {
        let (_resolved, root) = self.resolve(scope, scope_id)?;
        let item = corpus::read_item(&root, id)?;
        let body = item.body.clone();
        let path = corpus::item_path(&root, id)?.display().to_string();
        Ok((StoredMemoryItem::from_item(item, path), body))
    }

    /// Rebuilds the index from file + event-log truth, then lists.
    ///
    /// # Errors
    /// Returns [`MemoryError::Store`] on a reindex/query failure.
    pub fn reload(&self) -> Result<Vec<StoredMemoryItem>, MemoryError> {
        self.store.reindex_memory_from_files().map_err(store_err)?;
        self.list(None, false)
    }

    fn applicable_scopes(&self) -> Vec<(MemoryScope, Option<String>)> {
        let mut scopes = vec![(MemoryScope::User, None)];
        if let Some(repo) = &self.repo_scope_id {
            scopes.push((MemoryScope::Repo, Some(repo.clone())));
        }
        if let Some(session) = &self.session_id {
            scopes.push((MemoryScope::Session, Some(session.clone())));
        }
        scopes
    }

    fn record_rollback(
        &self,
        op_id: &str,
        item: &MemoryItem,
        scope_id: Option<&str>,
    ) -> Result<(), MemoryError> {
        self.append(&MemoryEvent::RollbackPoint {
            operation_id: op_id.to_owned(),
            item_id: item.id.clone(),
            scope: item.scope,
            scope_id: scope_id.map(str::to_owned),
            memory_type: item.memory_type,
            title: item.title.clone(),
            body: item.body.clone(),
            active: item.active,
            at_ms: now_ms(),
        })
    }

    pub(super) fn persist(
        &self,
        op_id: &str,
        root: &Path,
        item: &mut MemoryItem,
        op: MemoryOp,
    ) -> Result<StoredMemoryItem, MemoryError> {
        let hash = corpus::content_hash(item)?;
        item.content_hash = hash.clone();
        self.append(&MemoryEvent::OperationStarted {
            operation_id: op_id.to_owned(),
            item_id: item.id.clone(),
            scope: item.scope,
            scope_id: item.scope_id.clone(),
            op,
            base_hash: None,
            result_hash: Some(hash),
            at_ms: now_ms(),
        })?;
        let path = match corpus::write_item(root, item) {
            Ok(path) => path,
            Err(error) => {
                // Keep the operation self-contained: a failed write settles its
                // own intent so no dangling OperationStarted survives.
                let _ = self.append(&MemoryEvent::OperationFailed {
                    operation_id: op_id.to_owned(),
                    reason: Some("memory write failed".to_owned()),
                    at_ms: now_ms(),
                });
                return Err(error);
            }
        };
        self.append(&MemoryEvent::OperationApplied {
            operation_id: op_id.to_owned(),
            at_ms: now_ms(),
        })?;
        let stored = StoredMemoryItem::from_item(item.clone(), path.display().to_string());
        self.store.upsert_memory_item(&stored).map_err(store_err)?;
        Ok(stored)
    }

    pub(super) fn append(&self, event: &MemoryEvent) -> Result<(), MemoryError> {
        event_log::append_event(&self.event_log_path, event).map_err(MemoryError::Io)
    }
}

pub(super) fn store_err(err: rusqlite::Error) -> MemoryError {
    MemoryError::Store(err.to_string())
}

fn enforce_sizes(title: &str, body: &str) -> Result<(), MemoryError> {
    if title.len() > MAX_TITLE_BYTES {
        return Err(MemoryError::PayloadTooLarge("title"));
    }
    if body.len() > MAX_BODY_BYTES {
        return Err(MemoryError::PayloadTooLarge("body"));
    }
    Ok(())
}

fn new_item_id(title: &str) -> String {
    let slug = slugify(title, MAX_ID_SLUG);
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let seed = format!("{}-{}-{}", now_ms(), std::process::id(), counter);
    let suffix = &super::stable_hash_hex(seed.as_bytes())[..8];
    if slug.is_empty() {
        format!("mem-{suffix}")
    } else {
        format!("{slug}-{suffix}")
    }
}

fn slugify(input: &str, max: usize) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
        if out.len() >= max {
            break;
        }
    }
    out.trim_matches('-').to_owned()
}

pub(super) fn new_op_id() -> String {
    let counter = OP_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("op-{}-{:x}-{counter}", now_ms(), std::process::id())
}

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
