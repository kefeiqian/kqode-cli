use std::collections::HashMap;

use github_copilot_sdk::types::SessionEvent;

use crate::inference::{ChatCompletion, ChatDelta, ChatDeltaHandler, ChatError};

#[derive(Default)]
pub(super) struct EventState {
    content: String,
    emitted_by_message: HashMap<String, String>,
    completed_messages: Vec<String>,
    model: Option<String>,
}

impl EventState {
    pub(super) fn observe(&mut self, event: &SessionEvent, on_delta: Option<&ChatDeltaHandler>) {
        match event.event_type.as_str() {
            "assistant.message_delta" => self.observe_delta(event, on_delta),
            "assistant.message" => self.observe_message(event, on_delta),
            _ => {}
        }
    }

    pub(super) fn finish(
        mut self,
        event: Option<SessionEvent>,
        fallback_model: &str,
        on_delta: Option<&ChatDeltaHandler>,
    ) -> Result<ChatCompletion, ChatError> {
        let event = event.ok_or_else(|| {
            ChatError::Response("GitHub Copilot SDK returned no assistant message".to_owned())
        })?;
        if event.event_type != "assistant.message" {
            return Err(ChatError::Response(format!(
                "GitHub Copilot SDK returned unexpected final event {}",
                event.event_type
            )));
        }
        self.observe_message(&event, on_delta);
        if self.content.trim().is_empty() {
            return Err(ChatError::Response(
                "GitHub Copilot SDK returned an empty response".to_owned(),
            ));
        }
        Ok(ChatCompletion {
            message: self.content,
            model: self.model.unwrap_or_else(|| fallback_model.to_owned()),
        })
    }

    fn observe_delta(&mut self, event: &SessionEvent, on_delta: Option<&ChatDeltaHandler>) {
        let Some(message_id) = event.data.get("messageId").and_then(|value| value.as_str()) else {
            return;
        };
        let Some(content) = event
            .data
            .get("deltaContent")
            .and_then(|value| value.as_str())
        else {
            return;
        };
        if content.is_empty() {
            return;
        }
        self.start_message(message_id, on_delta);
        self.content.push_str(content);
        self.emitted_by_message
            .entry(message_id.to_owned())
            .or_default()
            .push_str(content);
        emit(content, on_delta);
    }

    fn observe_message(&mut self, event: &SessionEvent, on_delta: Option<&ChatDeltaHandler>) {
        let Some(message_id) = event.data.get("messageId").and_then(|value| value.as_str()) else {
            return;
        };
        if self
            .completed_messages
            .iter()
            .any(|completed| completed == message_id)
        {
            return;
        }
        let Some(content) = event.data.get("content").and_then(|value| value.as_str()) else {
            return;
        };
        self.start_message(message_id, on_delta);
        let emitted = self
            .emitted_by_message
            .entry(message_id.to_owned())
            .or_default();
        if let Some(suffix) = content.strip_prefix(emitted.as_str())
            && !suffix.is_empty()
        {
            self.content.push_str(suffix);
            emitted.push_str(suffix);
            emit(suffix, on_delta);
        }
        self.completed_messages.push(message_id.to_owned());
        if let Some(model) = event
            .data
            .get("model")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
        {
            self.model = Some(model.to_owned());
        }
    }

    fn start_message(&mut self, message_id: &str, on_delta: Option<&ChatDeltaHandler>) {
        if self.emitted_by_message.contains_key(message_id) {
            return;
        }
        if !self.content.is_empty() {
            self.content.push_str("\n\n");
            emit("\n\n", on_delta);
        }
        self.emitted_by_message
            .insert(message_id.to_owned(), String::new());
    }
}

fn emit(content: &str, on_delta: Option<&ChatDeltaHandler>) {
    if let Some(handler) = on_delta {
        handler(ChatDelta {
            content: content.to_owned(),
            model: None,
        });
    }
}

#[cfg(test)]
mod tests {
    use github_copilot_sdk::types::SessionEvent;
    use serde_json::json;

    use super::EventState;

    fn event(event_type: &str, data: serde_json::Value) -> SessionEvent {
        serde_json::from_value(json!({
            "id": "event-1",
            "timestamp": "2026-09-06T00:00:00Z",
            "parentId": null,
            "type": event_type,
            "data": data
        }))
        .unwrap()
    }

    #[test]
    fn joins_multiple_assistant_messages_without_duplicating_streamed_content() {
        let mut state = EventState::default();
        state.observe(
            &event(
                "assistant.message_delta",
                json!({"messageId": "message-1", "deltaContent": "First"}),
            ),
            None,
        );
        state.observe(
            &event(
                "assistant.message",
                json!({"messageId": "message-1", "content": "First"}),
            ),
            None,
        );
        state.observe(
            &event(
                "assistant.message_delta",
                json!({"messageId": "message-2", "deltaContent": "Sec"}),
            ),
            None,
        );
        let result = state
            .finish(
                Some(event(
                    "assistant.message",
                    json!({
                        "messageId": "message-2",
                        "content": "Second",
                        "model": "gpt-test"
                    }),
                )),
                "fallback",
                None,
            )
            .unwrap();

        assert_eq!(result.message, "First\n\nSecond");
        assert_eq!(result.model, "gpt-test");
    }
}
