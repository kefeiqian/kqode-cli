use serde::Serialize;

use crate::{
    conversation::store::{
        ConversationHeader, MessagePage, PendingTurn, StoredMessageRecord, StoredMessageRole,
        StoredMessageStatus,
    },
    settings::Provider,
};

pub(crate) const MESSAGE_PAGE_SIZE: usize = 50;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MessageView {
    pub(crate) id: String,
    pub(crate) role: StoredMessageRole,
    pub(crate) content: String,
    pub(crate) model: Option<String>,
    pub(crate) request_id: Option<String>,
    pub(crate) streaming: bool,
    pub(crate) revision: i64,
    pub(crate) position: i64,
}

impl From<StoredMessageRecord> for MessageView {
    fn from(record: StoredMessageRecord) -> Self {
        Self {
            id: record.message.id,
            role: record.message.role,
            content: record.message.content,
            model: record.message.model,
            request_id: record.request_id,
            streaming: record.status == StoredMessageStatus::Streaming,
            revision: record.revision,
            position: record.position,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MessagePageView {
    pub(crate) messages: Vec<MessageView>,
    pub(crate) has_more_messages: bool,
    pub(crate) oldest_message_position: Option<i64>,
}

impl From<MessagePage> for MessagePageView {
    fn from(page: MessagePage) -> Self {
        let messages = page
            .messages
            .into_iter()
            .map(MessageView::from)
            .collect::<Vec<_>>();
        Self {
            oldest_message_position: messages.first().map(|message| message.position),
            messages,
            has_more_messages: page.has_more,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationView {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) updated_at: i64,
    pub(crate) workspace_path: Option<String>,
    pub(crate) provider: Option<Provider>,
    pub(crate) model: Option<String>,
    pub(crate) messages: Vec<MessageView>,
    pub(crate) pending_turns: Vec<PendingTurn>,
    pub(crate) has_more_messages: bool,
    pub(crate) oldest_message_position: Option<i64>,
}

impl ConversationView {
    pub(crate) fn new(header: ConversationHeader, page: MessagePageView) -> Self {
        Self {
            id: header.id,
            title: header.title,
            updated_at: header.updated_at,
            workspace_path: header.workspace_path,
            provider: header.provider,
            model: header.model,
            messages: page.messages,
            pending_turns: header.pending_turns,
            has_more_messages: page.has_more_messages,
            oldest_message_position: page.oldest_message_position,
        }
    }
}
