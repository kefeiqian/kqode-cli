//! Wire contract for backend-owned `/memory` APIs.
//!
//! Mirrored in `tui/src/contracts/backend/memoryMessages.ts`. Params use
//! `deny_unknown_fields` + camelCase; scope/type/status/action travel as strings
//! (parsed and validated backend-side) so this layer stays decoupled from the
//! `crate::memory` domain enums.

use serde::{Deserialize, Serialize};

/// JSON-RPC method listing memory items visible in the current workspace.
pub const MEMORY_LIST_METHOD: &str = "kqode.memory.list";
/// JSON-RPC method returning one memory item including its body.
pub const MEMORY_SHOW_METHOD: &str = "kqode.memory.show";
/// JSON-RPC method adding an active memory item.
pub const MEMORY_ADD_METHOD: &str = "kqode.memory.add";
/// JSON-RPC method editing an existing memory item.
pub const MEMORY_EDIT_METHOD: &str = "kqode.memory.edit";
/// JSON-RPC method forgetting (removing) a memory item.
pub const MEMORY_FORGET_METHOD: &str = "kqode.memory.forget";
/// JSON-RPC method rebuilding the memory index from file + event-log truth.
pub const MEMORY_RELOAD_METHOD: &str = "kqode.memory.reload";
/// JSON-RPC method listing inbox entries (candidates + automatic audits).
pub const MEMORY_INBOX_LIST_METHOD: &str = "kqode.memory.inbox.list";
/// JSON-RPC method applying a review action to an inbox entry.
pub const MEMORY_INBOX_APPLY_METHOD: &str = "kqode.memory.inbox.apply";
/// JSON-RPC method undoing an applied automatic memory update.
pub const MEMORY_INBOX_UNDO_METHOD: &str = "kqode.memory.inbox.undo";

/// Metadata projection of one memory item (never the body; see [`MemoryShowResult`]).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItemWire {
    pub id: String,
    pub scope: String,
    pub scope_id: Option<String>,
    pub memory_type: String,
    pub title: String,
    pub active: bool,
    pub source: String,
    pub source_session_id: Option<String>,
    pub source_turn_start: Option<u64>,
    pub source_turn_end: Option<u64>,
    pub content_hash: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Review metadata for one inbox entry (never a raw memory body or rollback payload).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInboxEntryWire {
    pub id: String,
    pub status: String,
    pub scope: String,
    pub scope_id: Option<String>,
    pub target_item_id: Option<String>,
    pub memory_type: Option<String>,
    pub title: Option<String>,
    pub confidence: Option<f64>,
    pub reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Params for `kqode.memory.list`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryListParams {
    /// Optional scope filter (`user`/`repo`/`folder`/`session`); all when absent.
    #[serde(default)]
    pub scope: Option<String>,
    /// When true, exclude inactive candidates.
    #[serde(default)]
    pub active_only: Option<bool>,
}

/// Result for `kqode.memory.list` and `kqode.memory.reload`.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryListResult {
    pub items: Vec<MemoryItemWire>,
}

/// Params for `kqode.memory.show`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryShowParams {
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub id: String,
}

/// Result for `kqode.memory.show`.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryShowResult {
    pub item: MemoryItemWire,
    pub body: String,
}

/// Params for `kqode.memory.add`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryAddParams {
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub memory_type: String,
    pub title: String,
    pub body: String,
}

/// Params for `kqode.memory.edit`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryEditParams {
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
}

/// Params for `kqode.memory.forget`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryForgetParams {
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub id: String,
}

/// Result for `kqode.memory.add` and `kqode.memory.edit`.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMutationResult {
    pub item: MemoryItemWire,
}

/// Result for `kqode.memory.forget`.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryForgetResult {
    pub id: String,
    pub forgotten: bool,
}

/// Params for `kqode.memory.inbox.list`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryInboxListParams {
    #[serde(default)]
    pub status: Option<String>,
}

/// Result for `kqode.memory.inbox.list`.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInboxListResult {
    pub entries: Vec<MemoryInboxEntryWire>,
}

/// Params for `kqode.memory.inbox.apply` (`action`: approve/reject/stale).
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryInboxApplyParams {
    pub entry_id: String,
    pub action: String,
}

/// Result for `kqode.memory.inbox.apply`.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInboxApplyResult {
    pub entry: MemoryInboxEntryWire,
}

/// Params for `kqode.memory.inbox.undo`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MemoryInboxUndoParams {
    pub entry_id: String,
}

/// Result for `kqode.memory.inbox.undo`.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInboxUndoResult {
    pub entry: MemoryInboxEntryWire,
    pub restored: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::RpcMethod;

    #[test]
    fn memory_method_constants_round_trip_through_rpc_method() {
        for method in [
            MEMORY_LIST_METHOD,
            MEMORY_SHOW_METHOD,
            MEMORY_ADD_METHOD,
            MEMORY_EDIT_METHOD,
            MEMORY_FORGET_METHOD,
            MEMORY_RELOAD_METHOD,
            MEMORY_INBOX_LIST_METHOD,
            MEMORY_INBOX_APPLY_METHOD,
            MEMORY_INBOX_UNDO_METHOD,
        ] {
            let resolved = RpcMethod::from_method(method).expect("known memory method");
            assert_eq!(resolved.as_str(), method);
        }
    }

    #[test]
    fn add_params_reject_unknown_fields() {
        let value = serde_json::json!({
            "scope": "user",
            "memoryType": "user",
            "title": "t",
            "body": "b",
            "unexpected": true
        });
        assert!(serde_json::from_value::<MemoryAddParams>(value).is_err());
    }
}
