use serde::{Deserialize, Serialize};

use crate::protocol::{
    SETTLED_KIND_CANCELLED, SETTLED_KIND_COMPLETED, SETTLED_KIND_ERROR,
    SETTLED_KIND_NEEDS_CONFIGURATION,
};

/// JSON-RPC method returning resumable local sessions.
pub const SESSION_LIST_METHOD: &str = "kqode.session.list";

/// JSON-RPC method loading and attaching a resumable local session.
pub const SESSION_RESUME_METHOD: &str = "kqode.session.resume";

/// Resume-table status when the row is attached to the active runtime.
pub const SESSION_STATUS_CURRENT: &str = "Current";
/// Resume-table status when the row is not attached to the active runtime.
pub const SESSION_STATUS_IDLE: &str = "Idle";

/// One resumable session row for the `/resume` surface.
#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryWire {
    pub session_id: String,
    pub summary: String,
    pub status: &'static str,
    pub modified_at: i64,
    pub created_at: i64,
    pub folder: String,
}

/// Result for `kqode.session.list`.
#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResult {
    pub sessions: Vec<SessionSummaryWire>,
}

/// Params for `kqode.session.resume`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SessionResumeParams {
    pub session_id: String,
}

/// One resumed turn restored from durable session history.
#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResumedTurnWire {
    pub turn_id: String,
    pub seq: u64,
    pub prompt: String,
    pub result: SessionTurnResultWire,
}

/// Terminal turn result returned when rehydrating a durable session.
#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurnResultWire {
    pub kind: &'static str,
    pub text: Option<String>,
    pub finish_reason: Option<String>,
    pub error_kind: Option<String>,
    pub message: Option<String>,
}

impl SessionTurnResultWire {
    #[must_use]
    pub fn completed(text: Option<String>, finish_reason: Option<String>) -> Self {
        Self {
            kind: SETTLED_KIND_COMPLETED,
            text,
            finish_reason,
            error_kind: None,
            message: None,
        }
    }

    #[must_use]
    pub fn needs_configuration(message: Option<String>) -> Self {
        Self {
            kind: SETTLED_KIND_NEEDS_CONFIGURATION,
            text: None,
            finish_reason: None,
            error_kind: Some(SETTLED_KIND_NEEDS_CONFIGURATION.to_owned()),
            message,
        }
    }

    #[must_use]
    pub fn error(error_kind: Option<String>, message: Option<String>) -> Self {
        Self {
            kind: SETTLED_KIND_ERROR,
            text: None,
            finish_reason: None,
            error_kind,
            message,
        }
    }

    #[must_use]
    pub fn cancelled() -> Self {
        Self {
            kind: SETTLED_KIND_CANCELLED,
            text: None,
            finish_reason: None,
            error_kind: Some(SETTLED_KIND_CANCELLED.to_owned()),
            message: Some("turn cancelled".to_owned()),
        }
    }

    #[must_use]
    pub fn interrupted() -> Self {
        Self {
            kind: SETTLED_KIND_ERROR,
            text: None,
            finish_reason: None,
            error_kind: Some("interrupted".to_owned()),
            message: Some("turn interrupted before resume".to_owned()),
        }
    }
}

/// Result for `kqode.session.resume`.
#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionResumeResult {
    pub session_id: String,
    pub workspace_cwd: String,
    pub canonical_workspace_cwd: String,
    pub turns: Vec<ResumedTurnWire>,
}
