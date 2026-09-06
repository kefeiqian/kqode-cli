use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Provider-neutral tool call selected by a model.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub canonical_name: String,
    pub arguments: Value,
    pub argument_error: Option<MalformedToolArguments>,
}

/// Raw provider arguments that could not be decoded.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MalformedToolArguments {
    pub raw: String,
    pub message: String,
}

/// Stable category for a recoverable tool call failure.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolErrorKind {
    UnknownTool,
    HiddenTool,
    InvalidArguments,
    Denied,
    Unavailable,
    BudgetExceeded,
    RepeatedCall,
    ExecutionFailed,
    Cancelled,
}

/// Typed failure correlated with one tool call.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolCallError {
    pub kind: ToolErrorKind,
    pub message: String,
}

/// Provider-neutral result correlated with one tool call.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolResult {
    pub call_id: String,
    pub canonical_name: String,
    pub success: bool,
    pub should_continue: bool,
    pub summary: String,
    pub content: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<ToolErrorKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

impl ToolResult {
    /// Creates a successful result for `call`.
    pub fn success(call: &ToolCall, summary: impl Into<String>, content: Value) -> Self {
        Self {
            call_id: call.id.clone(),
            canonical_name: call.canonical_name.clone(),
            success: true,
            should_continue: true,
            summary: summary.into(),
            content,
            error_kind: None,
            display: None,
            metadata: None,
        }
    }

    /// Creates a failed result for `call`.
    pub fn failure(call: &ToolCall, error: ToolCallError) -> Self {
        Self {
            call_id: call.id.clone(),
            canonical_name: call.canonical_name.clone(),
            success: false,
            should_continue: true,
            summary: error.message.clone(),
            content: serde_json::json!({ "message": error.message }),
            error_kind: Some(error.kind),
            display: None,
            metadata: None,
        }
    }
}
