use serde::{Deserialize, Serialize};

use crate::tool::{ToolCallState, ToolResult};

use super::{ModelStep, TurnOutcome};

/// Provider-neutral event emitted by the runtime and translated by frontends.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum RuntimeEvent {
    ModelStepReceived {
        session_id: String,
        turn_id: String,
        step_id: String,
        step: ModelStep,
    },
    ToolCallStateChanged {
        session_id: String,
        turn_id: String,
        step_id: String,
        call_id: String,
        canonical_name: String,
        state: ToolCallState,
    },
    ToolResultProduced {
        session_id: String,
        turn_id: String,
        step_id: String,
        result: ToolResult,
    },
    TurnFinished {
        session_id: String,
        turn_id: String,
        outcome: TurnOutcome,
    },
}
