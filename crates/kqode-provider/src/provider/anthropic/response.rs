use serde::Deserialize;
use serde_json::Value;

use crate::{
    inference::{AssistantAction, AssistantResponse, ChatCompletion, ChatError},
    tools::ToolCall,
};

#[derive(Deserialize)]
struct CompletionResponse {
    model: String,
    content: Vec<Content>,
}

#[derive(Deserialize)]
struct Content {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    id: Option<String>,
    name: Option<String>,
    input: Option<Value>,
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<Model>,
}

#[derive(Deserialize)]
struct Model {
    id: String,
}

pub fn parse_completion(body: &str) -> Result<ChatCompletion, ChatError> {
    parse_response(body)?.into_completion()
}

pub(in crate::provider) fn parse_response(body: &str) -> Result<AssistantResponse, ChatError> {
    let response: CompletionResponse = serde_json::from_str(body)
        .map_err(|error| ChatError::Response(format!("decode Anthropic response: {error}")))?;
    let tool_calls = response
        .content
        .iter()
        .filter(|content| content.kind == "tool_use")
        .map(parse_tool_call)
        .collect::<Result<Vec<_>, _>>()?;
    let action = if tool_calls.is_empty() {
        let message = response
            .content
            .into_iter()
            .filter(|content| content.kind == "text")
            .filter_map(|content| content.text)
            .collect::<Vec<_>>()
            .join("\n");
        if message.trim().is_empty() {
            return Err(ChatError::Response(
                "Anthropic returned an empty response".to_owned(),
            ));
        }

        AssistantAction::Message(message)
    } else {
        AssistantAction::ToolCalls(tool_calls)
    };
    Ok(AssistantResponse {
        action,
        model: response.model,
    })
}

pub(crate) fn parse_models(body: &str) -> Result<Vec<String>, ChatError> {
    let response: ModelsResponse = serde_json::from_str(body)
        .map_err(|error| ChatError::Response(format!("decode model list: {error}")))?;
    let mut models = response
        .data
        .into_iter()
        .map(|model| model.id)
        .filter(|model| !model.trim().is_empty())
        .collect::<Vec<_>>();
    if models.is_empty() {
        return Err(ChatError::Response(
            "Anthropic API returned an empty model list".to_owned(),
        ));
    }
    models.sort_by_key(|model| model.to_ascii_lowercase());
    Ok(models)
}

fn parse_tool_call(content: &Content) -> Result<ToolCall, ChatError> {
    let id = content
        .id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| {
            ChatError::Response("Anthropic returned a tool use without an id".to_owned())
        })?;
    let name = content
        .name
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| {
            ChatError::Response("Anthropic returned a tool use without a name".to_owned())
        })?;
    Ok(ToolCall {
        id: id.to_owned(),
        canonical_name: name.to_owned(),
        arguments: content
            .input
            .clone()
            .unwrap_or_else(|| Value::Object(Default::default())),
        argument_error: None,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::parse_response;
    use crate::inference::AssistantAction;

    #[test]
    fn normalizes_tool_use() {
        let response = parse_response(
            r#"{"model":"claude-test","content":[{
                "type":"tool_use","id":"toolu-1","name":"run_command","input":{"command":"pwd"}
            }]}"#,
        )
        .unwrap();
        let AssistantAction::ToolCalls(calls) = response.action else {
            panic!("expected tool calls");
        };
        assert_eq!(calls[0].id, "toolu-1");
        assert_eq!(calls[0].canonical_name, "run_command");
        assert_eq!(calls[0].arguments, json!({"command": "pwd"}));
    }
}
