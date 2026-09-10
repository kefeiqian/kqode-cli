use rusqlite::{Transaction, params};
use uuid::Uuid;

use super::{
    super::{
        Conversation, ConversationStore, PendingTurn, StoreError, StoredMessage, StoredMessageRole,
        mutation::{current_timestamp, replace_messages},
    },
    ordering::{compact_positions, persist_positions, prioritized_ids},
};

const INTERRUPTED_RESPONSE_ERROR: &str =
    "The previous response was interrupted before it completed. Retry to send this message again.";

impl ConversationStore {
    /// Converts turns left pending by an interrupted application run into
    /// retryable transcript errors.
    ///
    /// # Errors
    ///
    /// Returns an error when pending turns or messages cannot be read or the
    /// recovery transaction cannot be committed.
    pub(crate) fn recover_interrupted_turns(&mut self) -> Result<usize, StoreError> {
        let conversation_ids = {
            let mut statement = self.connection.prepare(
                "SELECT DISTINCT conversation_id
                 FROM pending_turns
                 ORDER BY conversation_id",
            )?;
            let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut recovered = 0;
        for conversation_id in conversation_ids {
            let Some(mut conversation) = self.load_conversation(&conversation_id)? else {
                continue;
            };
            let pending_turns = std::mem::take(&mut conversation.pending_turns);
            if pending_turns.is_empty() {
                continue;
            }

            for pending in &pending_turns {
                if pending.retry_error_id.as_deref().is_some_and(|error_id| {
                    conversation.messages.iter().any(|message| {
                        message.id == error_id && message.role == StoredMessageRole::Error
                    })
                }) {
                    recovered += 1;
                    continue;
                }

                let user_index = if pending.retry_error_id.is_some() {
                    conversation.messages.iter().rposition(|message| {
                        message.role == StoredMessageRole::User
                            && message.content == pending.content
                    })
                } else {
                    conversation.messages.iter().position(|message| {
                        message.id == pending.id && message.role == StoredMessageRole::User
                    })
                };

                if let Some(user_index) = user_index {
                    conversation.messages.truncate(user_index + 1);
                } else {
                    conversation.messages.push(StoredMessage {
                        id: pending.id.clone(),
                        role: StoredMessageRole::User,
                        content: pending.content.clone(),
                        model: None,
                    });
                }
                conversation.messages.push(StoredMessage {
                    id: Uuid::new_v4().to_string(),
                    role: StoredMessageRole::Error,
                    content: INTERRUPTED_RESPONSE_ERROR.to_owned(),
                    model: None,
                });
                recovered += 1;
            }

            let transaction = self.connection.transaction()?;
            replace_messages(&transaction, &conversation.id, &conversation.messages)?;
            transaction.execute(
                "DELETE FROM pending_turns WHERE conversation_id = ?1",
                [&conversation.id],
            )?;
            touch_conversation(&transaction, &conversation.id)?;
            transaction.commit()?;
        }
        Ok(recovered)
    }

    pub(crate) fn enqueue_pending_turn(
        &mut self,
        conversation_id: &str,
        turn: &PendingTurn,
    ) -> Result<Conversation, StoreError> {
        let transaction = self.connection.transaction()?;
        insert_pending_turn(&transaction, conversation_id, turn)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        self.load_conversation(conversation_id)?
            .ok_or_else(|| missing_conversation(conversation_id))
    }

    #[cfg(test)]
    pub(crate) fn save_messages_and_remove_pending_turn(
        &mut self,
        conversation: &mut Conversation,
        turn_id: &str,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        replace_messages(&transaction, &conversation.id, &conversation.messages)?;
        transaction.execute(
            "DELETE FROM pending_turns WHERE conversation_id = ?1 AND id = ?2",
            params![conversation.id, turn_id],
        )?;
        compact_positions(&transaction, &conversation.id)?;
        touch_conversation(&transaction, &conversation.id)?;
        transaction.commit()?;
        *conversation = self
            .load_conversation(&conversation.id)?
            .ok_or_else(|| missing_conversation(&conversation.id))?;
        Ok(())
    }

    pub(crate) fn delete_pending_turn(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<Option<Conversation>, StoreError> {
        let transaction = self.connection.transaction()?;
        let changed = transaction.execute(
            "DELETE FROM pending_turns WHERE conversation_id = ?1 AND id = ?2",
            params![conversation_id, turn_id],
        )?;
        if changed == 0 {
            return Ok(None);
        }
        compact_positions(&transaction, conversation_id)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        self.load_conversation(conversation_id)
    }

    pub(crate) fn prioritize_pending_turn(
        &mut self,
        conversation_id: &str,
        active_turn_id: Option<&str>,
        turn_id: &str,
    ) -> Result<Option<Conversation>, StoreError> {
        let ids = self
            .load_pending_turns(conversation_id)?
            .into_iter()
            .map(|turn| turn.id)
            .collect::<Vec<_>>();
        let Some(ordered) = prioritized_ids(ids, active_turn_id, turn_id) else {
            return Ok(None);
        };
        let transaction = self.connection.transaction()?;
        persist_positions(&transaction, conversation_id, &ordered)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        self.load_conversation(conversation_id)
    }
}

fn insert_pending_turn(
    transaction: &Transaction<'_>,
    conversation_id: &str,
    turn: &PendingTurn,
) -> Result<(), StoreError> {
    transaction.execute(
        "INSERT INTO pending_turns (
            id, conversation_id, position, content, retry_error_id
         )
         VALUES (
            ?1, ?2,
            COALESCE((SELECT MAX(position) + 1 FROM pending_turns WHERE conversation_id = ?2), 0),
            ?3, ?4
         )",
        params![turn.id, conversation_id, turn.content, turn.retry_error_id],
    )?;
    Ok(())
}

fn touch_conversation(
    transaction: &Transaction<'_>,
    conversation_id: &str,
) -> Result<(), StoreError> {
    let updated_at = current_timestamp()?;
    transaction.execute(
        "UPDATE conversations
         SET updated_at = CASE
             WHEN updated_at >= ?2 THEN updated_at + 1
             ELSE ?2
         END
         WHERE id = ?1",
        params![conversation_id, updated_at],
    )?;
    Ok(())
}

fn missing_conversation(conversation_id: &str) -> StoreError {
    StoreError::MissingConversation(conversation_id.to_owned())
}
