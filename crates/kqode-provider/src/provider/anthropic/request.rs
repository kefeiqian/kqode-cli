use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    inference::{ChatError, ChatMessage, ChatMode, ChatRole, SYSTEM_PROMPT},
    tools::{ToolDefinition, ToolResult},
};

const MAX_TOKENS: u32 = 8_192;

#[derive(Serialize)]
pub(super) struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<ProviderMessage<'a>>,
    #[serde(skip_serializing_if = "is_false")]
    stream: bool,
    tools: Vec<AnthropicTool<'a>>,
    tool_choice: AnthropicToolChoice,
}

#[derive(Serialize)]
struct ProviderMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct AnthropicTool<'a> {
    name: &'a str,
    description: &'a str,
    input_schema: &'a Value,
}

#[derive(Serialize)]
struct AnthropicToolChoice {
    r#type: &'static str,
}

pub(super) fn build_request<'a>(
    model: &'a str,
    messages: &'a [ChatMessage],
    mode: ChatMode,
    tools: &'a [ToolDefinition],
) -> AnthropicRequest<'a> {
    AnthropicRequest {
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: messages
            .iter()
            .map(|message| ProviderMessage {
                role: role_name(message.role),
                content: &message.content,
            })
            .collect(),
        stream: mode == ChatMode::Streaming,
        tools: tools
            .iter()
            .map(|tool| AnthropicTool {
                name: &tool.canonical_name,
                description: &tool.description,
                input_schema: &tool.input_schema,
            })
            .collect(),
        tool_choice: AnthropicToolChoice { r#type: "none" },
    }
}

fn is_false(value: &bool) -> bool {
    !value
}

fn role_name(role: ChatRole) -> &'static str {
    match role {
        ChatRole::User => "user",
        ChatRole::Assistant => "assistant",
    }
}

#[cfg_attr(
    not(test),
    allow(
        dead_code,
        reason = "tool results are serialized only after production tool execution is enabled"
    )
)]
pub(in crate::provider) fn build_tool_result_message(
    result: &ToolResult,
) -> Result<Value, ChatError> {
    let content = serde_json::to_string(result)
        .map_err(|error| ChatError::Response(format!("encode tool result: {error}")))?;
    Ok(json!({
        "role": "user",
        "content": [{
            "type": "tool_result",
            "tool_use_id": result.call_id,
            "content": content,
            "is_error": !result.success
        }]
    }))
}

#[cfg(test)]
mod tests {
    use serde_json::{json, to_value};

    use super::build_request;
    use crate::{
        inference::{ChatMessage, ChatMode, ChatRole, SYSTEM_PROMPT},
        tools::{ToolCall, ToolErrorKind, ToolRegistry, ToolResult},
    };

    #[test]
    fn serializes_anthropic_system_tools_and_streaming() {
        let messages = [ChatMessage {
            role: ChatRole::User,
            content: "Hello".to_owned(),
        }];
        let tools = ToolRegistry::builtins().definitions();
        let request = to_value(build_request(
            "claude-test",
            &messages,
            ChatMode::Streaming,
            &tools,
        ))
        .unwrap();
        assert_eq!(request["system"], SYSTEM_PROMPT);
        assert_eq!(request["stream"], true);
        assert_eq!(request["tool_choice"]["type"], "none");
        assert_eq!(request["tools"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn serializes_failed_tool_results() {
        let call = ToolCall {
            id: "call-1".to_owned(),
            canonical_name: "missing".to_owned(),
            arguments: json!({}),
            argument_error: None,
        };
        let result = ToolResult::failure(
            &call,
            crate::tools::ToolCallError {
                kind: ToolErrorKind::UnknownTool,
                message: "missing".to_owned(),
            },
        );
        let message = super::build_tool_result_message(&result).unwrap();
        assert_eq!(message["content"][0]["tool_use_id"], "call-1");
        assert_eq!(message["content"][0]["is_error"], true);
    }
}
