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
    if event.data.trim() == "[DONE]" {
        return Ok(true);
    }
    let chunk: OpenAiChunk = serde_json::from_str(&event.data)
        .map_err(|error| ChatError::Response(format!("decode LLM stream event: {error}")))?;
    if let Some(error) = chunk.error {
        return Err(ChatError::Api(format!("LLM API error: {}", error.message)));
    }
    if let Some(model) = chunk.model.filter(|model| !model.trim().is_empty()) {
        state.model = model;
    }
    for content in chunk
        .choices
        .into_iter()
        .filter_map(|choice| choice.delta.content)
        .filter(|content| !content.is_empty())
    {
        state.push(content, on_delta);
    }
    Ok(false)
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
struct OpenAiChunk {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
    error: Option<StreamError>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    delta: OpenAiDelta,
}

#[derive(Deserialize)]
struct OpenAiDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct StreamError {
    message: String,
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::{StreamState, consume_event};
    use crate::{inference::ChatDeltaHandler, provider::shared::sse::SseEvent};

    #[test]
    fn collects_and_emits_openai_deltas() {
        let received = Arc::new(Mutex::new(Vec::new()));
        let handler: ChatDeltaHandler = {
            let received = Arc::clone(&received);
            Arc::new(move |delta| received.lock().unwrap().push(delta.content))
        };
        let mut state = StreamState::new("fallback");
        consume_event(
            SseEvent {
                event: None,
                data: r#"{"model":"gpt-test","choices":[{"delta":{"content":"Hi"}}]}"#.to_owned(),
            },
            &mut state,
            Some(&handler),
        )
        .unwrap();
        let completion = state.finish().unwrap();
        assert_eq!(completion.message, "Hi");
        assert_eq!(completion.model, "gpt-test");
        assert_eq!(*received.lock().unwrap(), ["Hi"]);
    }
}
