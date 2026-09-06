use serde::{Deserialize, Serialize};

use crate::tool::LedgerEntry;

use super::BudgetTracker;

/// Terminal status for one runtime turn.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    Completed,
    Blocked,
    Cancelled,
    BudgetExceeded,
    Failed,
}

/// Machine-readable reason the runtime stopped.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum StopReason {
    FinalAssistantMessage,
    UserInputUnavailable,
    ApprovalUnavailable,
    CancelledByUser,
    Budget(String),
    Provider(String),
    Protocol(String),
    Infrastructure(String),
    ToolRequestedStop(String),
}

/// Completed runtime state returned after the final event is emitted.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TurnReport {
    pub outcome: TurnOutcome,
    pub ledger: Vec<LedgerEntry>,
    pub budget: BudgetTracker,
}

/// Final result consumed by desktop, CLI, trace, and ACP adapters.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TurnOutcome {
    pub status: TurnStatus,
    pub stop_reason: StopReason,
    pub final_message: Option<String>,
}

impl TurnOutcome {
    /// Creates a successfully completed turn.
    pub fn completed(message: impl Into<String>) -> Self {
        Self {
            status: TurnStatus::Completed,
            stop_reason: StopReason::FinalAssistantMessage,
            final_message: Some(message.into()),
        }
    }
}
