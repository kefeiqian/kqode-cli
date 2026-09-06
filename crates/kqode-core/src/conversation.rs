use serde::{Deserialize, Serialize};

/// A persisted conversation whose provider identity is supplied by an adapter layer.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Conversation<P> {
    pub id: String,
    pub title: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(default, rename = "workspacePath")]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub provider: Option<P>,
    #[serde(default)]
    pub model: Option<String>,
    pub messages: Vec<StoredMessage>,
    #[serde(default, rename = "pendingTurns")]
    pub pending_turns: Vec<PendingTurn>,
}

/// Summary metadata used when listing conversations.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ConversationListItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

impl<P> From<&Conversation<P>> for ConversationListItem {
    fn from(conversation: &Conversation<P>) -> Self {
        Self {
            id: conversation.id.clone(),
            title: conversation.title.clone(),
            updated_at: conversation.updated_at,
        }
    }
}

/// A user turn waiting to enter the runtime.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PendingTurn {
    pub id: String,
    pub content: String,
    #[serde(default, rename = "retryErrorId")]
    pub retry_error_id: Option<String>,
    #[serde(default, rename = "isActive", skip_deserializing)]
    pub is_active: bool,
}

/// A message stored in a conversation transcript.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct StoredMessage {
    pub id: String,
    pub role: StoredMessageRole,
    pub content: String,
    pub model: Option<String>,
}

/// Role of a persisted conversation message.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StoredMessageRole {
    User,
    Assistant,
    Error,
}

impl StoredMessageRole {
    /// Returns the stable persistence representation.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
            Self::Error => "error",
        }
    }

    /// Parses a stable persistence representation.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "user" => Some(Self::User),
            "assistant" => Some(Self::Assistant),
            "error" => Some(Self::Error),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Conversation, ConversationListItem, StoredMessageRole};

    #[test]
    fn derives_a_list_item_without_provider_knowledge() {
        let conversation = Conversation {
            id: "conversation-1".to_owned(),
            title: "Example".to_owned(),
            updated_at: 42,
            workspace_path: None,
            provider: Some("provider-id"),
            model: None,
            messages: Vec::new(),
            pending_turns: Vec::new(),
        };

        assert_eq!(
            ConversationListItem::from(&conversation),
            ConversationListItem {
                id: "conversation-1".to_owned(),
                title: "Example".to_owned(),
                updated_at: 42,
            }
        );
    }

    #[test]
    fn parses_only_supported_stored_roles() {
        assert_eq!(
            StoredMessageRole::parse("assistant"),
            Some(StoredMessageRole::Assistant)
        );
        assert_eq!(StoredMessageRole::parse("system"), None);
    }
}
