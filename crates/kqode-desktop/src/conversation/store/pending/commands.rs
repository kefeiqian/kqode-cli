use rusqlite::{Transaction, params};

use super::{
    super::{
        Conversation, ConversationStore, PendingTurn, StoreError,
        mutation::{current_timestamp, replace_messages},
    },
    ordering::{compact_positions, persist_positions, prioritized_ids},
};

impl ConversationStore {
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
