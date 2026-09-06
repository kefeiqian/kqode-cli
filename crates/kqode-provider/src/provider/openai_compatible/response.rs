use serde::Deserialize;

use crate::{
    inference::{AssistantAction, AssistantResponse, ChatCompletion, ChatError},
    tools::{MalformedToolArguments, ToolCall},
};

#[derive(Deserialize)]
struct CompletionResponse {
    model: String,
    choices: Vec<CompletionChoice>,
}

#[derive(Deserialize)]
struct CompletionChoice {
    message: CompletionMessage,
}

#[derive(Deserialize)]
struct CompletionMessage {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiToolCall>>,
}

#[derive(Deserialize)]
struct OpenAiToolCall {
    id: String,
    function: OpenAiFunctionCall,
}

#[derive(Deserialize)]
struct OpenAiFunctionCall {
    name: String,
    arguments: String,
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
        .map_err(|error| ChatError::Response(format!("decode LLM response: {error}")))?;
    let message = response
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message)
        .ok_or_else(|| ChatError::Response("LLM returned an empty response".to_owned()))?;
    let tool_calls = message.tool_calls.unwrap_or_default();
    let action = if tool_calls.is_empty() {
        AssistantAction::Message(
            message
                .content
                .filter(|content| !content.trim().is_empty())
                .ok_or_else(|| ChatError::Response("LLM returned an empty response".to_owned()))?,
        )
    } else {
        AssistantAction::ToolCalls(
            tool_calls
                .into_iter()
                .map(parse_tool_call)
                .collect::<Result<Vec<_>, _>>()?,
        )
    };
    Ok(AssistantResponse {
        action,
        model: response.model,
    })
}

pub fn parse_models(body: &str) -> Result<Vec<String>, ChatError> {
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
            "LLM API returned an empty model list".to_owned(),
        ));
    }
    models.sort_by_key(|model| model.to_ascii_lowercase());
    Ok(models)
}

fn parse_tool_call(call: OpenAiToolCall) -> Result<ToolCall, ChatError> {
    if call.id.trim().is_empty() || call.function.name.trim().is_empty() {
        return Err(ChatError::Response(
            "LLM returned a tool call without an id or name".to_owned(),
        ));
    }
    let (arguments, argument_error) = match serde_json::from_str(&call.function.arguments) {
        Ok(arguments) => (arguments, None),
        Err(error) => (
            serde_json::Value::Null,
            Some(MalformedToolArguments {
                raw: call.function.arguments,
                message: error.to_string(),
            }),
        ),
    };
    Ok(ToolCall {
        id: call.id,
        canonical_name: call.function.name,
        arguments,
        argument_error,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::parse_response;
    use crate::inference::AssistantAction;

    #[test]
    fn normalizes_tool_calls_and_preserves_order() {
        let response = parse_response(
            r#"{"model":"test","choices":[{"message":{"content":null,"tool_calls":[
                {"id":"call-1","function":{"name":"fetch_web_url","arguments":"{\"url\":\"https://example.com\"}"}},
                {"id":"call-2","function":{"name":"ask_user","arguments":"{\"questions\":[]}"}}]}}]}"#,
        )
        .unwrap();
        let AssistantAction::ToolCalls(calls) = response.action else {
            panic!("expected tool calls");
        };
        assert_eq!(
            calls
                .iter()
                .map(|call| call.canonical_name.as_str())
                .collect::<Vec<_>>(),
            ["fetch_web_url", "ask_user"]
        );
        assert_eq!(calls[0].arguments, json!({"url": "https://example.com"}));
    }

    #[test]
    fn accepts_null_tool_calls_as_text() {
        let response = parse_response(
            r#"{"model":"test","choices":[{"message":{"content":"Hello","tool_calls":null}}]}"#,
        )
        .unwrap();
        assert_eq!(
            response.action,
            AssistantAction::Message("Hello".to_owned())
        );
    }

    #[test]
    fn preserves_malformed_tool_arguments_for_correlated_validation() {
        let response = parse_response(
            r#"{"model":"test","choices":[{"message":{"content":null,"tool_calls":[
                {"id":"call-1","function":{"name":"fetch_web_url","arguments":"{not-json}"}}]}}]}"#,
        )
        .unwrap();
        let AssistantAction::ToolCalls(calls) = response.action else {
            panic!("expected tool calls");
        };
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].canonical_name, "fetch_web_url");
        let error = calls[0]
            .argument_error
            .as_ref()
            .expect("malformed arguments should be retained");
        assert_eq!(error.raw, "{not-json}");
        assert!(!error.message.is_empty());
    }
}
