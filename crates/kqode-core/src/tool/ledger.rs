use std::{collections::HashMap, fmt};

use serde::{Deserialize, Serialize};

use super::ToolCall;

/// Lifecycle state for one accepted tool call.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallState {
    Received,
    Validated,
    Running,
    Succeeded,
    Failed,
    Cancelled,
    Skipped,
}

impl ToolCallState {
    /// Returns whether no further transition is permitted.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Succeeded | Self::Failed | Self::Cancelled | Self::Skipped
        )
    }
}

/// Ledger record for one unique call ID.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LedgerEntry {
    pub call_id: String,
    pub canonical_name: String,
    pub state: ToolCallState,
}

/// Strict per-run call ledger.
#[derive(Default)]
pub struct ToolCallLedger {
    entries: HashMap<String, LedgerEntry>,
}

impl ToolCallLedger {
    /// Atomically accepts a batch after validating all call IDs.
    ///
    /// # Errors
    ///
    /// Returns an error without changing the ledger when an ID is empty or has
    /// already appeared in this run or the current batch.
    pub fn receive_batch(&mut self, calls: &[ToolCall]) -> Result<(), LedgerError> {
        let mut batch_ids = std::collections::HashSet::new();
        for call in calls {
            if call.id.trim().is_empty() {
                return Err(LedgerError::new(
                    LedgerErrorKind::EmptyCallId,
                    call.id.clone(),
                    "tool call ID cannot be empty",
                ));
            }
            if self.entries.contains_key(&call.id) || !batch_ids.insert(call.id.clone()) {
                return Err(LedgerError::new(
                    LedgerErrorKind::DuplicateCallId,
                    call.id.clone(),
                    format!("duplicate tool call ID: {}", call.id),
                ));
            }
        }
        for call in calls {
            self.entries.insert(
                call.id.clone(),
                LedgerEntry {
                    call_id: call.id.clone(),
                    canonical_name: call.canonical_name.clone(),
                    state: ToolCallState::Received,
                },
            );
        }
        Ok(())
    }

    /// Moves a call through the strict lifecycle.
    pub fn transition(
        &mut self,
        call_id: &str,
        canonical_name: &str,
        next: ToolCallState,
    ) -> Result<(), LedgerError> {
        let entry = self.entries.get_mut(call_id).ok_or_else(|| {
            LedgerError::new(
                LedgerErrorKind::UnknownCallId,
                call_id,
                format!("tool call result arrived before call: {call_id}"),
            )
        })?;
        if entry.canonical_name != canonical_name {
            return Err(LedgerError::new(
                LedgerErrorKind::NameMismatch,
                call_id,
                format!(
                    "tool call `{call_id}` changed name from `{}` to `{canonical_name}`",
                    entry.canonical_name
                ),
            ));
        }
        if !valid_transition(entry.state, next) {
            return Err(LedgerError::new(
                LedgerErrorKind::InvalidTransition,
                call_id,
                format!(
                    "tool call `{call_id}` cannot transition from {:?} to {next:?}",
                    entry.state
                ),
            ));
        }
        entry.state = next;
        Ok(())
    }

    /// Returns one ledger entry by call ID.
    pub fn get(&self, call_id: &str) -> Option<&LedgerEntry> {
        self.entries.get(call_id)
    }

    /// Returns a deterministic snapshot of all accepted calls.
    pub fn entries(&self) -> Vec<LedgerEntry> {
        let mut entries = self.entries.values().cloned().collect::<Vec<_>>();
        entries.sort_by(|left, right| left.call_id.cmp(&right.call_id));
        entries
    }

    /// Returns true when every accepted call has settled.
    pub fn all_terminal(&self) -> bool {
        self.entries.values().all(|entry| entry.state.is_terminal())
    }
}

fn valid_transition(current: ToolCallState, next: ToolCallState) -> bool {
    use ToolCallState::{Cancelled, Failed, Received, Running, Skipped, Succeeded, Validated};
    matches!(
        (current, next),
        (Received, Validated | Failed | Cancelled | Skipped)
            | (Validated, Running | Failed | Cancelled | Skipped)
            | (Running, Succeeded | Failed | Cancelled)
    )
}

/// Category of a ledger invariant violation.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LedgerErrorKind {
    EmptyCallId,
    DuplicateCallId,
    UnknownCallId,
    NameMismatch,
    InvalidTransition,
}

/// Run-level protocol failure raised by the call ledger.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LedgerError {
    pub kind: LedgerErrorKind,
    pub call_id: String,
    pub message: String,
}

impl LedgerError {
    fn new(kind: LedgerErrorKind, call_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            kind,
            call_id: call_id.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for LedgerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for LedgerError {}
