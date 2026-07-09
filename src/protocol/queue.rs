use serde::{Deserialize, Serialize};

/// Server→client notification emitted when a turn enters the backend queue.
/// Mirrored in `tui/src/contracts/backend/messages.ts`.
pub const TURN_ENQUEUED_METHOD: &str = "kqode/turnEnqueued";

/// Server→client notification emitted when a pending turn becomes active.
/// Mirrored in `tui/src/contracts/backend/messages.ts`.
pub const TURN_ACTIVATED_METHOD: &str = "kqode/turnActivated";

/// Server→client notification emitted when a turn reaches a terminal result.
/// Mirrored in `tui/src/contracts/backend/messages.ts`.
pub const TURN_SETTLED_METHOD: &str = "kqode/turnSettled";

/// Server→client notification toggling the "Auto compacting…" status while a
/// turn's hidden compaction runs. Mirrored in `tui/src/contracts/backend/messages.ts`.
pub const COMPACTION_STATUS_METHOD: &str = "kqode/compactionStatus";

/// Queue state for a turn that became the active head immediately on enqueue.
pub const TURN_STATE_ACTIVE: &str = "active";

/// Queue state for a turn waiting behind an active turn.
pub const TURN_STATE_PENDING: &str = "pending";

/// Settled result kind for a successfully completed turn.
pub const SETTLED_KIND_COMPLETED: &str = "completed";

/// Settled result kind for a turn that could not run until configured.
pub const SETTLED_KIND_NEEDS_CONFIGURATION: &str = "needsConfiguration";

/// Settled result kind for a turn that failed.
pub const SETTLED_KIND_ERROR: &str = "error";

/// Settled result kind for a turn abandoned before completion.
pub const SETTLED_KIND_CANCELLED: &str = "cancelled";

/// Payload for [`TURN_ENQUEUED_METHOD`].
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueuedParams {
    pub turn_id: String,
    pub seq: u64,
    pub state: &'static str,
}

/// Payload for [`TURN_ACTIVATED_METHOD`].
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivatedParams {
    pub turn_id: String,
}

/// Payload for [`COMPACTION_STATUS_METHOD`].
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionStatusParams {
    pub turn_id: String,
    pub active: bool,
}

/// Payload for [`TURN_SETTLED_METHOD`].
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettledParams {
    pub turn_id: String,
    pub result: TurnResult,
}

/// Terminal result carried by [`TURN_SETTLED_METHOD`].
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnResult {
    pub kind: &'static str,
    pub text: Option<String>,
    pub finish_reason: Option<String>,
    pub error_kind: Option<String>,
    pub message: Option<String>,
}

impl<'de> Deserialize<'de> for EnqueuedParams {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Wire {
            turn_id: String,
            seq: u64,
            state: String,
        }

        let wire = Wire::deserialize(deserializer)?;
        let state = match wire.state.as_str() {
            TURN_STATE_ACTIVE => TURN_STATE_ACTIVE,
            TURN_STATE_PENDING => TURN_STATE_PENDING,
            other => {
                return Err(serde::de::Error::custom(format!(
                    "unknown turn state `{other}`"
                )));
            }
        };
        Ok(Self {
            turn_id: wire.turn_id,
            seq: wire.seq,
            state,
        })
    }
}

impl<'de> Deserialize<'de> for TurnResult {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Wire {
            kind: String,
            text: Option<String>,
            finish_reason: Option<String>,
            error_kind: Option<String>,
            message: Option<String>,
        }

        let wire = Wire::deserialize(deserializer)?;
        let kind = match wire.kind.as_str() {
            SETTLED_KIND_COMPLETED => SETTLED_KIND_COMPLETED,
            SETTLED_KIND_NEEDS_CONFIGURATION => SETTLED_KIND_NEEDS_CONFIGURATION,
            SETTLED_KIND_ERROR => SETTLED_KIND_ERROR,
            SETTLED_KIND_CANCELLED => SETTLED_KIND_CANCELLED,
            other => {
                return Err(serde::de::Error::custom(format!(
                    "unknown settled kind `{other}`"
                )));
            }
        };
        Ok(Self {
            kind,
            text: wire.text,
            finish_reason: wire.finish_reason,
            error_kind: wire.error_kind,
            message: wire.message,
        })
    }
}

/// Params for `kqode.conversation.clear`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ConversationClearParams {}

/// Result for `kqode.conversation.clear`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationClearResult {
    pub ok: bool,
}

/// Params for `kqode.turn.cancel`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TurnCancelParams {
    pub turn_id: String,
}

/// Result for `kqode.turn.cancel`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnCancelResult {
    pub ok: bool,
}
