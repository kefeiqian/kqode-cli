use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    inference::{ChatError, ChatMessage, ChatMode, ChatRole, SYSTEM_PROMPT},
    provider::Provider,
    tools::{ToolDefinition, ToolResult},
};

#[derive(Serialize)]
pub(in crate::provider) struct CompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ProviderMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt_cache_key: Option<&'a str>,
    #[serde(skip_serializing_if = "is_false")]
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAiTool<'a>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'static str>,
}

#[derive(Serialize)]
struct ProviderMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct OpenAiTool<'a> {
    r#type: &'static str,
    function: ToolFunction<'a>,
}

#[derive(Serialize)]
struct ToolFunction<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a Value,
}

pub(in crate::provider) fn build_request<'a>(
    provider: Provider,
    model: &'a str,
    messages: &'a [ChatMessage],
    mode: ChatMode,
    prompt_cache_key: Option<&'a str>,
    tools: &'a [ToolDefinition],
) -> CompletionRequest<'a> {
    let mut provider_messages = vec![ProviderMessage {
        role: "system",
        content: SYSTEM_PROMPT,
    }];
    provider_messages.extend(messages.iter().map(|message| ProviderMessage {
        role: role_name(message.role),
        content: &message.content,
    }));
    let supports_tools = provider.supports_native_tool_descriptions();
    CompletionRequest {
        model,
        messages: provider_messages,
        prompt_cache_key: provider
            .supports_prompt_cache_key()
            .then_some(prompt_cache_key)
            .flatten(),
        stream: mode == ChatMode::Streaming,
        tools: supports_tools.then(|| {
            tools
                .iter()
                .map(|tool| OpenAiTool {
                    r#type: "function",
                    function: ToolFunction {
                        name: &tool.canonical_name,
                        description: &tool.description,
                        parameters: &tool.input_schema,
                    },
                })
                .collect()
        }),
        tool_choice: supports_tools.then_some("none"),
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
        "role": "tool",
        "tool_call_id": result.call_id,
        "content": content
    }))
}

#[cfg(test)]
mod tests {
    use serde_json::{json, to_value};

    use super::build_request;
    use crate::{
        inference::{ChatMessage, ChatMode, ChatRole},
        provider::Provider,
        tools::{ToolCall, ToolErrorKind, ToolRegistry, ToolResult},
    };

    fn message() -> [ChatMessage; 1] {
        [ChatMessage {
            role: ChatRole::User,
            content: "Hello".to_owned(),
        }]
    }

    #[test]
    fn serializes_streaming_tools_and_prompt_cache_by_capability() {
        let messages = message();
        let tools = ToolRegistry::builtins().definitions();
        let openai = to_value(build_request(
            Provider::Openai,
            "gpt-test",
            &messages,
            ChatMode::Streaming,
            Some("cache-key"),
            &tools,
        ))
        .unwrap();
        assert_eq!(openai["stream"], true);
        assert_eq!(openai["prompt_cache_key"], "cache-key");
        assert_eq!(openai["tool_choice"], "none");
        assert_eq!(openai["tools"].as_array().unwrap().len(), 3);

        let custom = to_value(build_request(
            Provider::Custom,
            "custom-test",
            &messages,
            ChatMode::Complete,
            Some("cache-key"),
            &tools,
        ))
        .unwrap();
        assert!(custom.get("stream").is_none());
        assert!(custom.get("prompt_cache_key").is_none());
        assert!(custom.get("tools").is_none());
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
        assert_eq!(message["tool_call_id"], "call-1");
    }

    #[test]
    fn serializes_successful_tool_results() {
        let call = ToolCall {
            id: "call-1".to_owned(),
            canonical_name: "fetch_web_url".to_owned(),
            arguments: json!({"url": "https://example.com"}),
            argument_error: None,
        };
        let result = ToolResult::success(
            &call,
            "Fetched example",
            json!({"status": 200, "text": "Example"}),
        );
        let message = super::build_tool_result_message(&result).unwrap();
        assert_eq!(message["role"], "tool");
        assert_eq!(message["tool_call_id"], "call-1");
    }
}
