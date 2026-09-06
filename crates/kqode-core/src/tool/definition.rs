use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Model-facing metadata and runtime policy for one canonical tool.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolDefinition {
    pub canonical_name: String,
    pub display_name: String,
    pub description: String,
    pub input_schema: Value,
    pub effects: ToolEffects,
    pub exposure: ToolExposure,
    pub execution_mode: ToolExecutionMode,
    pub limits: ToolLimits,
    pub source: ToolSource,
}

/// Declares observable side effects expected from a tool.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolEffects {
    pub process: bool,
    pub network: bool,
    pub filesystem_read: bool,
    pub filesystem_write: bool,
    pub user_interaction: bool,
}

/// Controls whether a tool is sent to the model.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExposure {
    Direct,
    Hidden,
    Deferred,
}

/// Declares scheduler compatibility without enabling parallel execution.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExecutionMode {
    Sequential,
    ParallelSafe,
}

/// Optional per-call limits interpreted by the eventual real handler.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolLimits {
    pub timeout_ms: Option<u64>,
    pub max_output_bytes: Option<usize>,
}

/// Identifies where a tool registration originated.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "name")]
pub enum ToolSource {
    Builtin,
    Extension(String),
}
