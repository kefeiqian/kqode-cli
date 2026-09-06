use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::tool::ToolCall;

/// Normalized output from one provider request.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ModelStep {
    pub assistant_content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub finish_reason: FinishReason,
    pub usage: Option<ModelUsage>,
    pub provider_metadata: Option<Value>,
}

/// Provider-neutral reason a model request stopped.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    ToolCalls,
    Length,
    ContentFilter,
    Cancelled,
    Other(String),
}

/// Token usage reported by a provider when available.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ModelUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn preserves_mixed_assistant_content_and_tool_calls() {
        let step = ModelStep {
            assistant_content: Some("I will inspect that.".to_owned()),
            tool_calls: vec![ToolCall {
                id: "call-1".to_owned(),
                canonical_name: "run_command".to_owned(),
                arguments: json!({"command": "git status"}),
                argument_error: None,
            }],
            finish_reason: FinishReason::ToolCalls,
            usage: Some(ModelUsage {
                input_tokens: 10,
                output_tokens: 5,
            }),
            provider_metadata: Some(json!({"request_id": "req-1"})),
        };

        assert_eq!(
            step.assistant_content.as_deref(),
            Some("I will inspect that.")
        );
        assert_eq!(step.tool_calls[0].id, "call-1");
        assert_eq!(step.provider_metadata.unwrap()["request_id"], "req-1");
    }
}
