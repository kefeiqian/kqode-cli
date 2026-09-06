use reqwest::Response;
use serde::Deserialize;

use crate::inference::{
    ChatCancellationToken, ChatCompletion, ChatDelta, ChatDeltaHandler, ChatError,
};

use super::{
    super::shared::{
        http::response_body,
        sse::SseEvent,
        stream::{consume_sse, is_event_stream},
    },
    response::parse_completion,
};

pub(super) async fn parse_stream(
    response: Response,
    fallback_model: &str,
    cancellation: ChatCancellationToken,
    on_delta: Option<ChatDeltaHandler>,
) -> Result<ChatCompletion, ChatError> {
    if !response.status().is_success() {
        return response_body(response).await.and_then(|_| {
            Err(ChatError::Response(
                "LLM returned an unexpected successful error response".to_owned(),
            ))
        });
    }
    if !is_event_stream(&response) {
        let body = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            body = response_body(response) => body?,
        };
        return parse_completion(&body);
    }

    let mut state = StreamState::new(fallback_model);
    consume_sse(response, cancellation, |event| {
        consume_event(event, &mut state, on_delta.as_ref())
    })
    .await?;
    state.finish()
}

fn consume_event(
    event: SseEvent,
    state: &mut StreamState,
    on_delta: Option<&ChatDeltaHandler>,
) -> Result<bool, ChatError> {
    let chunk: AnthropicChunk = serde_json::from_str(&event.data)
        .map_err(|error| ChatError::Response(format!("decode Anthropic stream event: {error}")))?;
    if chunk.kind == "error" {
        let message = chunk
            .error
            .map(|error| error.message)
            .unwrap_or_else(|| "unknown streaming error".to_owned());
        return Err(ChatError::Api(format!("LLM API error: {message}")));
    }
    if let Some(model) = chunk
        .message
        .and_then(|message| message.model)
        .filter(|model| !model.trim().is_empty())
    {
        state.model = model;
    }
    if chunk.kind == "content_block_delta"
        && let Some(content) = chunk.delta.and_then(|delta| delta.text)
        && !content.is_empty()
    {
        state.push(content, on_delta);
    }
    Ok(chunk.kind == "message_stop" || event.event.as_deref() == Some("message_stop"))
}

struct StreamState {
    content: String,
    model: String,
}

impl StreamState {
    fn new(fallback_model: &str) -> Self {
        Self {
            content: String::new(),
            model: fallback_model.to_owned(),
        }
    }

    fn push(&mut self, content: String, on_delta: Option<&ChatDeltaHandler>) {
        self.content.push_str(&content);
        if let Some(handler) = on_delta {
            handler(ChatDelta {
                content,
                model: Some(self.model.clone()),
            });
        }
    }

    fn finish(self) -> Result<ChatCompletion, ChatError> {
        if self.content.trim().is_empty() {
            return Err(ChatError::Response(
                "LLM returned an empty response".to_owned(),
            ));
        }
        Ok(ChatCompletion {
            message: self.content,
            model: self.model,
        })
    }
}

#[derive(Deserialize)]
struct AnthropicChunk {
    #[serde(rename = "type")]
    kind: String,
    message: Option<AnthropicMessage>,
    delta: Option<AnthropicDelta>,
    error: Option<StreamError>,
}

#[derive(Deserialize)]
struct AnthropicMessage {
    model: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicDelta {
    text: Option<String>,
}

#[derive(Deserialize)]
struct StreamError {
    message: String,
}

#[cfg(test)]
mod tests {
    use super::{StreamState, consume_event};
    use crate::provider::shared::sse::SseEvent;

    #[test]
    fn collects_anthropic_text_deltas() {
        let mut state = StreamState::new("fallback");
        consume_event(
            SseEvent {
                event: Some("content_block_delta".to_owned()),
                data: r#"{"type":"content_block_delta","delta":{"text":"Hello"}}"#.to_owned(),
            },
            &mut state,
            None,
        )
        .unwrap();
        let completion = state.finish().unwrap();
        assert_eq!(completion.message, "Hello");
        assert_eq!(completion.model, "fallback");
    }
}
