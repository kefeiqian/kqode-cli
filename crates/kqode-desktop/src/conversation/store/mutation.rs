use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Transaction, params};

use super::{Conversation, ConversationStore, StoreError, StoredMessage};

impl ConversationStore {
    /// Inserts or replaces one conversation and its ordered messages.
    ///
    /// # Errors
    ///
    /// Returns an error when the transaction cannot be written or the system
    /// clock cannot produce an update timestamp.
    pub fn save_conversation(&mut self, conversation: &mut Conversation) -> Result<(), StoreError> {
        let updated_at = current_timestamp()?;
        let transaction = self.connection.transaction()?;

        transaction.execute(
            "INSERT INTO conversations (
                id, title, workspace_path, provider, model, archived, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                workspace_path = excluded.workspace_path,
                provider = excluded.provider,
                model = excluded.model,
                updated_at = CASE
                    WHEN conversations.updated_at >= excluded.updated_at
                    THEN conversations.updated_at + 1
                    ELSE excluded.updated_at
                END",
            params![
                conversation.id,
                conversation.title,
                conversation.workspace_path,
                conversation.provider.map(|provider| provider.as_str()),
                conversation.model,
                updated_at
            ],
        )?;
        replace_messages(&transaction, &conversation.id, &conversation.messages)?;
        conversation.updated_at = load_updated_at(&transaction, &conversation.id)?;
        transaction.commit()?;
        Ok(())
    }

    /// Replaces only the ordered messages while preserving current metadata.
    ///
    /// # Errors
    ///
    /// Returns an error when the transaction cannot be written or the system
    /// clock cannot produce an update timestamp.
    pub fn save_messages(&mut self, conversation: &mut Conversation) -> Result<(), StoreError> {
        let updated_at = current_timestamp()?;
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "UPDATE conversations
             SET updated_at = CASE
                 WHEN updated_at >= ?2 THEN updated_at + 1
                 ELSE ?2
             END
             WHERE id = ?1",
            params![conversation.id, updated_at],
        )?;
        replace_messages(&transaction, &conversation.id, &conversation.messages)?;
        conversation.updated_at = load_updated_at(&transaction, &conversation.id)?;
        transaction.commit()?;
        Ok(())
    }

    /// Updates a title only when it still matches the expected provisional title.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot update the conversation or the system
    /// clock cannot produce an update timestamp.
    pub fn update_title_if_matches(
        &self,
        conversation_id: &str,
        expected_title: &str,
        title: &str,
    ) -> Result<bool, StoreError> {
        let updated_at = current_timestamp()?;
        let changed = self.connection.execute(
            "UPDATE conversations
             SET title = ?1,
                 updated_at = CASE
                     WHEN updated_at >= ?2 THEN updated_at + 1
                     ELSE ?2
                 END
             WHERE id = ?3 AND title = ?4 AND archived = 0",
            params![title, updated_at, conversation_id, expected_title],
        )?;
        Ok(changed == 1)
    }

    /// Archives one conversation without deleting its messages.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot update the conversation.
    pub fn archive_conversation(&self, conversation_id: &str) -> Result<(), StoreError> {
        self.connection.execute(
            "UPDATE conversations SET archived = 1 WHERE id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }
}

pub(super) fn current_timestamp() -> Result<i64, StoreError> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| StoreError::Time)?;
    i64::try_from(elapsed.as_millis()).map_err(|_| StoreError::TimestampOverflow)
}

pub(super) fn replace_messages(
    transaction: &Transaction<'_>,
    conversation_id: &str,
    messages: &[StoredMessage],
) -> Result<(), StoreError> {
    transaction.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    )?;

    for (position, message) in messages.iter().enumerate() {
        transaction.execute(
            "INSERT INTO messages
                (id, conversation_id, position, role, content, model)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                message.id,
                conversation_id,
                position as i64,
                message.role.as_str(),
                message.content,
                message.model
            ],
        )?;
    }
    Ok(())
}

fn load_updated_at(
    transaction: &Transaction<'_>,
    conversation_id: &str,
) -> Result<i64, StoreError> {
    transaction
        .query_row(
            "SELECT updated_at FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .map_err(StoreError::from)
}
