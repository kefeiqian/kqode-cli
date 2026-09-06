use crate::model::{ChatError, ChatMessage};

/// Validates provider-neutral chat history before a model request.
///
/// # Errors
///
/// Returns [`ChatError::Configuration`] when the history is empty or contains
/// a message whose content is blank.
pub fn validate_chat_messages(messages: &[ChatMessage]) -> Result<(), ChatError> {
    if messages.is_empty() {
        return Err(ChatError::Configuration(
            "at least one chat message is required".to_owned(),
        ));
    }
    if messages
        .iter()
        .any(|message| message.content.trim().is_empty())
    {
        return Err(ChatError::Configuration(
            "chat messages cannot be empty".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::model::{ChatMessage, ChatRole};

    use super::validate_chat_messages;

    #[test]
    fn rejects_empty_history() {
        let error = validate_chat_messages(&[]).expect_err("empty history should fail");
        assert_eq!(error.to_string(), "at least one chat message is required");
    }

    #[test]
    fn rejects_blank_message_content() {
        let error = validate_chat_messages(&[ChatMessage {
            role: ChatRole::User,
            content: " \n ".to_owned(),
        }])
        .expect_err("blank messages should fail");
        assert_eq!(error.to_string(), "chat messages cannot be empty");
    }
}
