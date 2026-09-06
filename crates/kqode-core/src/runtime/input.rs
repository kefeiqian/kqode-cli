use serde::{Deserialize, Serialize};

use crate::tool::{ToolDefinition, ToolResult};

use super::{ModelStep, TurnBudget};

/// One provider-neutral item in the in-memory turn transcript.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum ModelMessage {
    User {
        content: String,
    },
    Assistant {
        step: ModelStep,
    },
    ToolResults {
        results: Vec<ToolResult>,
    },
    RuntimeNotice {
        kind: RuntimeNoticeKind,
        content: String,
    },
}

/// Runtime-authored message supplied to the provider.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeNoticeKind {
    RepetitionWarning,
    EmptyResponseNudge,
    TextOnlyFinalization,
}

/// Tool-selection mode requested from a provider adapter.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolChoice {
    Auto,
    None,
}

/// Complete input for one provider request.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ModelRequest {
    pub session_id: String,
    pub turn_id: String,
    pub step_id: String,
    pub messages: Vec<ModelMessage>,
    pub tools: Vec<ToolDefinition>,
    pub tool_choice: ToolChoice,
}

/// User input and stable IDs for one runtime turn.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TurnRequest {
    pub session_id: String,
    pub turn_id: String,
    pub content: String,
}

/// Whether this runtime instance may offer and dispatch its bound tools.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum ToolExecution {
    Enabled,
    #[default]
    Disabled,
}

/// Per-runtime configuration.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RuntimeConfig {
    pub budget: TurnBudget,
    pub tool_execution: ToolExecution,
}
