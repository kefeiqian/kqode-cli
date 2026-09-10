use crate::{
    conversation::store::{Conversation, PendingTurn, StoredMessage, StoredMessageRole},
    inference::{ChatMessage, ChatRole},
};

pub(super) fn retry_user_message_id(
    conversation: &Conversation,
    pending: &PendingTurn,
) -> (Option<usize>, String) {
    let retry_error_index = pending.retry_error_id.as_deref().and_then(|error_id| {
        conversation
            .messages
            .iter()
            .position(|message| message.id == error_id)
    });
    let user_message_id = retry_error_index
        .and_then(|index| index.checked_sub(1))
        .and_then(|index| conversation.messages.get(index))
        .filter(|message| message.role == StoredMessageRole::User)
        .map(|message| message.id.clone())
        .unwrap_or_else(|| pending.id.clone());
    (retry_error_index, user_message_id)
}

pub(super) fn chat_messages(
    conversation: &Conversation,
    current_user_message_id: &str,
) -> Vec<ChatMessage> {
    let pending_ids = conversation
        .pending_turns
        .iter()
        .map(|turn| turn.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let mut current_user_message = None;
    let mut messages = conversation
        .messages
        .iter()
        .filter_map(|message| {
            if message.id == current_user_message_id {
                current_user_message = Some(message);
                return None;
            }
            if message.role == StoredMessageRole::User && pending_ids.contains(message.id.as_str())
            {
                return None;
            }
            let role = match message.role {
                StoredMessageRole::User => ChatRole::User,
                StoredMessageRole::Assistant => ChatRole::Assistant,
                StoredMessageRole::Error => return None,
            };
            Some(ChatMessage {
                role,
                content: message.content.clone(),
            })
        })
        .collect::<Vec<_>>();
    if let Some(message) = current_user_message {
        messages.push(ChatMessage {
            role: ChatRole::User,
            content: message.content.clone(),
        });
    }
    messages
}

pub(super) fn stored_message_with_id(
    id: String,
    role: StoredMessageRole,
    content: String,
    model: Option<String>,
) -> StoredMessage {
    StoredMessage {
        id,
        role,
        content,
        model,
    }
}

#[cfg(test)]
mod tests {
    use super::chat_messages;
    use crate::conversation::store::{Conversation, PendingTurn, StoredMessage, StoredMessageRole};

    #[test]
    fn excludes_other_pending_users_and_places_the_current_user_last() {
        let conversation = Conversation {
            id: "conversation-1".to_owned(),
            title: "Example".to_owned(),
            updated_at: 0,
            workspace_path: None,
            provider: None,
            model: None,
            messages: vec![
                message("turn-2", StoredMessageRole::User, "Second"),
                message("turn-3", StoredMessageRole::User, "Third"),
                message("turn-1", StoredMessageRole::User, "First"),
                message(
                    "assistant-1",
                    StoredMessageRole::Assistant,
                    "First response",
                ),
            ],
            pending_turns: vec![pending("turn-2", "Second"), pending("turn-3", "Third")],
        };

        let messages = chat_messages(&conversation, "turn-3");

        assert_eq!(
            messages
                .iter()
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>(),
            vec!["First", "First response", "Third"]
        );
    }

    fn message(id: &str, role: StoredMessageRole, content: &str) -> StoredMessage {
        StoredMessage {
            id: id.to_owned(),
            role,
            content: content.to_owned(),
            model: None,
        }
    }

    fn pending(id: &str, content: &str) -> PendingTurn {
        PendingTurn {
            id: id.to_owned(),
            content: content.to_owned(),
            retry_error_id: None,
            is_active: false,
        }
    }
}
