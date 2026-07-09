//! Inbox review operations: list, apply (approve/reject/stale), and undo.
//!
//! U3 provides the review surface and a functional undo that restores an item
//! from its rollback snapshot when no later conflicting edit exists; U7 deepens
//! the state machine (candidate activation, richer rollback-conflict handling,
//! and sensitive purge).

use super::event_log::{self, InboxStatus, MemoryEvent, MemoryOp};
use super::index::MemoryService;
use super::index::{new_op_id, now_ms, store_err};
use super::{MemoryError, MemoryItem, MemoryProvenance, MemorySource};
use crate::store::StoredInboxEntry;

/// A review action applied to an inbox entry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InboxAction {
    /// Confirm an automatic update or accept a candidate.
    Approve,
    /// Reject the entry and suppress recreating it.
    Reject,
    /// Mark the entry stale (superseded / no longer relevant).
    Stale,
}

impl InboxAction {
    /// Parses a wire action string, or `None` if unrecognized.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "approve" => Some(Self::Approve),
            "reject" => Some(Self::Reject),
            "stale" => Some(Self::Stale),
            _ => None,
        }
    }
}

impl MemoryService {
    /// Lists inbox entries, optionally filtered by status.
    ///
    /// # Errors
    /// Returns [`MemoryError::Store`] on an index query failure.
    pub fn inbox_list(
        &self,
        status: Option<InboxStatus>,
    ) -> Result<Vec<StoredInboxEntry>, MemoryError> {
        self.store().list_inbox_entries(status).map_err(store_err)
    }

    /// Applies a review action to an inbox entry, suppressing recreation on reject.
    ///
    /// # Errors
    /// Returns [`MemoryError::NotFound`] for an unknown entry, or
    /// [`MemoryError::Store`] on an index failure.
    pub fn inbox_apply(
        &self,
        entry_id: &str,
        action: InboxAction,
    ) -> Result<StoredInboxEntry, MemoryError> {
        let entry = self.inbox_entry(entry_id)?;
        let now = now_ms();
        let status = match action {
            InboxAction::Approve => InboxStatus::Approved,
            InboxAction::Reject => InboxStatus::Rejected,
            InboxAction::Stale => InboxStatus::Stale,
        };
        self.mark_status(entry_id, status, None, now)?;
        if action == InboxAction::Reject {
            self.record_correction(&entry, "rejected candidate", now)?;
        }
        self.inbox_entry(entry_id)
    }

    /// Undoes an applied automatic update, restoring the target item's prior
    /// content from its rollback snapshot. Returns `(entry, restored)`, where
    /// `restored` is false when the item changed since the update (rollback
    /// conflict) or no snapshot exists.
    ///
    /// # Errors
    /// Returns [`MemoryError`] for an unknown/undoable entry, ambiguous scope, or
    /// filesystem/index failure.
    pub fn inbox_undo(&self, entry_id: &str) -> Result<(StoredInboxEntry, bool), MemoryError> {
        let entry = self.inbox_entry(entry_id)?;
        let (Some(op_id), Some(target_id)) =
            (entry.operation_id.clone(), entry.target_item_id.clone())
        else {
            return Err(MemoryError::NotFound);
        };
        let (resolved, root) = self.resolve(entry.scope, entry.scope_id.as_deref())?;
        let current = super::corpus::read_item(&root, &target_id).ok();

        if self.has_later_conflict(&current, entry.result_hash.as_deref()) {
            let now = now_ms();
            self.mark_status(
                entry_id,
                InboxStatus::Failed,
                Some("rollback conflict: item changed since the update"),
                now,
            )?;
            return Ok((self.inbox_entry(entry_id)?, false));
        }

        let Some(snapshot) = latest_rollback(self.event_log_path(), &op_id) else {
            return Ok((entry, false));
        };
        let now = now_ms();
        let mut restored = MemoryItem {
            id: target_id,
            scope: entry.scope,
            scope_id: resolved,
            memory_type: snapshot.memory_type,
            title: snapshot.title,
            body: snapshot.body,
            active: snapshot.active,
            provenance: MemoryProvenance {
                source: MemorySource::Manual,
                source_session_id: None,
                source_turn_start: None,
                source_turn_end: None,
                created_at_ms: now,
                updated_at_ms: now,
            },
            content_hash: String::new(),
        };
        self.persist(&new_op_id(), &root, &mut restored, MemoryOp::Write)?;
        self.mark_status(entry_id, InboxStatus::Undone, None, now)?;
        self.record_correction(&entry, "undone update", now)?;
        Ok((self.inbox_entry(entry_id)?, true))
    }

    fn inbox_entry(&self, entry_id: &str) -> Result<StoredInboxEntry, MemoryError> {
        self.store()
            .inbox_entry(entry_id)
            .map_err(store_err)?
            .ok_or(MemoryError::NotFound)
    }

    fn mark_status(
        &self,
        entry_id: &str,
        status: InboxStatus,
        reason: Option<&str>,
        at_ms: i64,
    ) -> Result<(), MemoryError> {
        self.append(&MemoryEvent::InboxReviewed {
            entry_id: entry_id.to_owned(),
            status,
            reason: reason.map(str::to_owned),
            at_ms,
        })?;
        self.store()
            .set_inbox_status(entry_id, status, at_ms)
            .map_err(store_err)
    }

    fn record_correction(
        &self,
        entry: &StoredInboxEntry,
        reason: &str,
        at_ms: i64,
    ) -> Result<(), MemoryError> {
        let Some(key) = suppression_key(entry) else {
            return Ok(());
        };
        self.append(&MemoryEvent::CorrectionRecorded {
            suppression_key: key.clone(),
            scope: entry.scope,
            scope_id: entry.scope_id.clone(),
            reason: Some(reason.to_owned()),
            at_ms,
        })?;
        self.store()
            .upsert_memory_correction(
                &key,
                entry.scope,
                entry.scope_id.as_deref(),
                Some(reason),
                at_ms,
            )
            .map_err(store_err)
    }

    fn has_later_conflict(&self, current: &Option<MemoryItem>, result_hash: Option<&str>) -> bool {
        match (current, result_hash) {
            (Some(current), Some(result_hash)) => current.content_hash != result_hash,
            _ => false,
        }
    }
}

struct RollbackSnapshot {
    memory_type: super::MemoryType,
    title: String,
    body: String,
    active: bool,
}

/// Finds the most recent rollback snapshot recorded for `op_id`.
fn latest_rollback(log: &std::path::Path, op_id: &str) -> Option<RollbackSnapshot> {
    event_log::read_events(log)
        .into_iter()
        .rev()
        .find_map(|event| match event {
            MemoryEvent::RollbackPoint {
                operation_id,
                memory_type,
                title,
                body,
                active,
                ..
            } if operation_id == op_id => Some(RollbackSnapshot {
                memory_type,
                title,
                body,
                active,
            }),
            _ => None,
        })
}

/// A normalized, opaque suppression key that never stores raw rejected content:
/// it hashes the item's scope/type/title identity so recreation is blocked
/// without persisting the sensitive text itself (R11/R18).
fn suppression_key(entry: &StoredInboxEntry) -> Option<String> {
    let title = entry.title.as_deref()?;
    let identity = format!(
        "{}|{}|{}|{}",
        entry.scope.as_str(),
        entry.scope_id.as_deref().unwrap_or(""),
        entry.memory_type.map_or("", super::MemoryType::as_str),
        title.to_lowercase(),
    );
    Some(super::stable_hash_hex(identity.as_bytes()))
}
