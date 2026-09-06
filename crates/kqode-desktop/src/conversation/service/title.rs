use std::sync::Mutex;

use serde_json::json;

use super::{
    constants::TITLE_CHARACTER_LIMIT,
    error::ConversationServiceError,
    state::{lock_conversations, require_conversation},
};
use crate::{
    conversation::store::{Conversation, ConversationStore},
    inference::{ChatMessage, ChatMode, ChatRole},
    llm::LlmService,
    settings::Provider,
};

const TITLE_USER_CHARACTER_LIMIT: usize = 400;
const TITLE_ASSISTANT_CHARACTER_LIMIT: usize = 300;

/// Captures the immutable input needed by a background title request.
#[derive(Debug)]
pub(crate) struct TitleGenerationRequest {
    conversation_id: String,
    expected_title: String,
    provider: Option<Provider>,
    model: Option<String>,
    user_message: String,
    assistant_message: String,
}

impl TitleGenerationRequest {
    pub(super) fn new(
        conversation: &Conversation,
        expected_title: String,
        user_message: String,
        assistant_message: String,
    ) -> Self {
        Self {
            conversation_id: conversation.id.clone(),
            expected_title,
            provider: conversation.provider,
            model: conversation.model.clone(),
            user_message,
            assistant_message,
        }
    }
}

/// Generates a title with the conversation's selected model and applies it atomically.
///
/// # Errors
///
/// Returns an error when the title request fails or conversation storage cannot
/// be read or updated.
pub(crate) async fn generate_conversation_title(
    request: TitleGenerationRequest,
    store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
) -> Result<Option<Conversation>, ConversationServiceError> {
    let completion = llm_service
        .chat(
            request.provider,
            request.model,
            vec![ChatMessage {
                role: ChatRole::User,
                content: title_prompt(&request.user_message, &request.assistant_message),
            }],
            ChatMode::Complete,
        )
        .await?;
    let Some(title) = normalize_generated_title(&completion.message) else {
        return Ok(None);
    };

    let store = lock_conversations(store)?;
    if !store.update_title_if_matches(&request.conversation_id, &request.expected_title, &title)? {
        return Ok(None);
    }
    require_conversation(&store, &request.conversation_id).map(Some)
}

pub(super) fn provisional_title(content: &str) -> String {
    content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(TITLE_CHARACTER_LIMIT)
        .collect()
}

fn title_prompt(user_message: &str, assistant_message: &str) -> String {
    let excerpt = json!({
        "user": truncate(user_message, TITLE_USER_CHARACTER_LIMIT),
        "assistant": truncate(assistant_message, TITLE_ASSISTANT_CHARACTER_LIMIT),
    });
    format!(
        "Generate a concise title for this coding conversation. \
Use the user's language, preserve important technical terms, and describe the main task. \
Return only one plain-text line with at most {TITLE_CHARACTER_LIMIT} characters. \
Do not answer the conversation and do not use quotes, Markdown, or trailing punctuation.\n\n\
Conversation excerpt (JSON):\n{excerpt}"
    )
}

fn normalize_generated_title(response: &str) -> Option<String> {
    let first_line = response.lines().find(|line| !line.trim().is_empty())?;
    let normalized = first_line
        .trim()
        .trim_matches(|character| {
            matches!(
                character,
                '"' | '\'' | '`' | '#' | '*' | '“' | '”' | '‘' | '’'
            )
        })
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', '?', '!', '。', '？', '！'])
        .trim()
        .chars()
        .take(TITLE_CHARACTER_LIMIT)
        .collect::<String>();
    (!normalized.is_empty()).then_some(normalized)
}

fn truncate(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::{normalize_generated_title, provisional_title};

    #[test]
    fn creates_a_single_line_provisional_title() {
        assert_eq!(
            provisional_title("  Fix the\nlogin\tflow  "),
            "Fix the login flow"
        );
    }

    #[test]
    fn normalizes_generated_titles() {
        assert_eq!(
            normalize_generated_title("  \"修复  login\n流程！\"  "),
            Some("修复 login".to_owned())
        );
    }

    #[test]
    fn rejects_empty_generated_titles() {
        assert_eq!(normalize_generated_title(" \n\t "), None);
    }
}
