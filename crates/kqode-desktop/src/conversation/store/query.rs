use rusqlite::{OptionalExtension, params};

use super::{
    Conversation, ConversationListItem, ConversationStore, StoreError, StoredMessage,
    StoredMessageRole,
};

impl ConversationStore {
    /// Lists conversation metadata without loading messages, newest first.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot read the stored records.
    pub fn list_conversations(&self) -> Result<Vec<ConversationListItem>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, updated_at
             FROM conversations
             WHERE archived = 0
             ORDER BY updated_at DESC, id ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ConversationListItem {
                id: row.get(0)?,
                title: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub(crate) fn find_empty_conversation(&self) -> Result<Option<Conversation>, StoreError> {
        let id = self
            .connection
            .query_row(
                "SELECT c.id
                 FROM conversations c
                 WHERE c.archived = 0
                   AND NOT EXISTS (
                       SELECT 1 FROM messages m WHERE m.conversation_id = c.id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM pending_turns p WHERE p.conversation_id = c.id
                   )
                 ORDER BY c.updated_at DESC, c.id ASC
                 LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        id.map(|id| self.load_conversation(&id))
            .transpose()
            .map(Option::flatten)
    }

    /// Loads one conversation and its messages.
    ///
    /// # Errors
    ///
    /// Returns an error when SQLite cannot read the conversation or a stored
    /// provider or message role is unsupported.
    pub fn load_conversation(&self, id: &str) -> Result<Option<Conversation>, StoreError> {
        let conversation = self
            .connection
            .query_row(
                "SELECT id, title, updated_at, workspace_path, provider, model
                 FROM conversations
                 WHERE id = ?1 AND archived = 0",
                [id],
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
        let Some((id, title, updated_at, workspace_path, provider, model)) = conversation else {
            return Ok(None);
        };

        self.hydrate_conversation(id, title, updated_at, workspace_path, provider, model)
            .map(Some)
    }

    fn hydrate_conversation(
        &self,
        id: String,
        title: String,
        updated_at: i64,
        workspace_path: Option<String>,
        provider: Option<String>,
        model: Option<String>,
    ) -> Result<Conversation, StoreError> {
        Ok(Conversation {
            messages: self.load_messages(&id)?,
            pending_turns: self.load_pending_turns(&id)?,
            id,
            title,
            updated_at,
            workspace_path,
            provider: provider
                .map(|value| kqode_provider::Provider::parse(&value))
                .transpose()
                .map_err(StoreError::InvalidProvider)?,
            model,
        })
    }

    fn load_messages(&self, conversation_id: &str) -> Result<Vec<StoredMessage>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, role, content, model
             FROM messages
             WHERE conversation_id = ?1
             ORDER BY position ASC",
        )?;
        let mut rows = statement.query(params![conversation_id])?;
        let mut messages = Vec::new();

        while let Some(row) = rows.next()? {
            let role = row.get::<_, String>(1)?;
            messages.push(StoredMessage {
                id: row.get(0)?,
                role: StoredMessageRole::parse(&role)
                    .ok_or_else(|| StoreError::InvalidRole(role))?,
                content: row.get(2)?,
                model: row.get(3)?,
            });
        }
        Ok(messages)
    }
}
