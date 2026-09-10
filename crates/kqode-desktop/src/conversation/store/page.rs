use rusqlite::{OptionalExtension, Row, params};

use super::{ConversationStore, PendingTurn, StoreError, StoredMessage, StoredMessageRole};
use crate::settings::Provider;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StoredMessageStatus {
    Streaming,
    Complete,
}

impl StoredMessageStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Streaming => "streaming",
            Self::Complete => "complete",
        }
    }

    fn parse(value: &str) -> Result<Self, StoreError> {
        match value {
            "streaming" => Ok(Self::Streaming),
            "complete" => Ok(Self::Complete),
            _ => Err(StoreError::InvalidMessageStatus(value.to_owned())),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StoredMessageRecord {
    pub(crate) message: StoredMessage,
    pub(crate) position: i64,
    pub(crate) request_id: Option<String>,
    pub(crate) status: StoredMessageStatus,
    pub(crate) revision: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MessagePage {
    pub(crate) messages: Vec<StoredMessageRecord>,
    pub(crate) has_more: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ConversationHeader {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) updated_at: i64,
    pub(crate) workspace_path: Option<String>,
    pub(crate) provider: Option<Provider>,
    pub(crate) model: Option<String>,
    pub(crate) pending_turns: Vec<PendingTurn>,
}

impl ConversationStore {
    pub(crate) fn load_conversation_header(
        &self,
        conversation_id: &str,
    ) -> Result<Option<ConversationHeader>, StoreError> {
        let header = self
            .connection
            .query_row(
                "SELECT id, title, updated_at, workspace_path, provider, model
                 FROM conversations
                 WHERE id = ?1 AND archived = 0",
                [conversation_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((id, title, updated_at, workspace_path, provider, model)) = header else {
            return Ok(None);
        };
        Ok(Some(ConversationHeader {
            pending_turns: self.load_pending_turns(&id)?,
            id,
            title,
            updated_at,
            workspace_path,
            provider: provider
                .map(|value| Provider::parse(&value))
                .transpose()
                .map_err(StoreError::InvalidProvider)?,
            model,
        }))
    }

    pub(crate) fn load_message_page(
        &self,
        conversation_id: &str,
        before_position: Option<i64>,
        limit: usize,
    ) -> Result<MessagePage, StoreError> {
        let limit = i64::try_from(limit).map_err(|_| StoreError::PositionOverflow)?;
        let mut statement = self.connection.prepare(
            "SELECT id, role, content, model, position, request_id, status, revision
             FROM messages
             WHERE conversation_id = ?1
               AND (?2 IS NULL OR position < ?2)
             ORDER BY position DESC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![conversation_id, before_position, limit + 1],
            message_record,
        )?;
        let mut messages = rows.collect::<Result<Vec<_>, _>>()?;
        let has_more = messages.len() > limit as usize;
        if has_more {
            messages.pop();
        }
        messages.reverse();
        Ok(MessagePage { messages, has_more })
    }

    pub(crate) fn load_message_record(
        &self,
        conversation_id: &str,
        message_id: &str,
    ) -> Result<Option<StoredMessageRecord>, StoreError> {
        self.connection
            .query_row(
                "SELECT id, role, content, model, position, request_id, status, revision
                 FROM messages
                 WHERE conversation_id = ?1 AND id = ?2",
                params![conversation_id, message_id],
                message_record,
            )
            .optional()
            .map_err(StoreError::from)
    }

    pub(crate) fn prepare_retry_user(
        &self,
        conversation_id: &str,
        error_message_id: &str,
    ) -> Result<Option<(String, String)>, StoreError> {
        let linked = self
            .connection
            .query_row(
                "SELECT user.id, user.content
                 FROM messages error
                 JOIN messages user
                   ON user.conversation_id = error.conversation_id
                  AND user.id = error.request_id
                  AND user.role = 'user'
                 WHERE error.conversation_id = ?1
                   AND error.id = ?2
                   AND error.role = 'error'",
                params![conversation_id, error_message_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if linked.is_some() {
            return Ok(linked);
        }
        let fallback = self
            .connection
            .query_row(
                "SELECT user.id, user.content
                  FROM messages error
                  JOIN messages user
                   ON user.conversation_id = error.conversation_id
                  AND user.position = error.position - 1
                  AND user.role = 'user'
                 WHERE error.conversation_id = ?1
                   AND error.id = ?2
                   AND error.role = 'error'",
                params![conversation_id, error_message_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((user_id, _)) = fallback.as_ref() {
            self.connection.execute(
                "UPDATE messages
                 SET request_id = ?1
                 WHERE conversation_id = ?2 AND id = ?3",
                params![user_id, conversation_id, error_message_id],
            )?;
        }
        Ok(fallback)
    }
}

fn message_record(row: &Row<'_>) -> rusqlite::Result<StoredMessageRecord> {
    let role = row.get::<_, String>(1)?;
    let status = row.get::<_, String>(6)?;
    Ok(StoredMessageRecord {
        message: StoredMessage {
            id: row.get(0)?,
            role: StoredMessageRole::parse(&role).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    format!("unsupported message role {role}").into(),
                )
            })?,
            content: row.get(2)?,
            model: row.get(3)?,
        },
        position: row.get(4)?,
        request_id: row.get(5)?,
        status: StoredMessageStatus::parse(&status).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                error.to_string().into(),
            )
        })?,
        revision: row.get(7)?,
    })
}
