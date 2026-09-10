use rusqlite::{OptionalExtension, Transaction, params};
use uuid::Uuid;

use super::{
    ConversationStore, PendingTurn, StoreError, StoredMessage, StoredMessageRole,
    StoredMessageStatus,
    mutation::{current_timestamp, load_updated_at},
    pending::ordering::compact_positions,
};

impl ConversationStore {
    pub(crate) fn enqueue_message_turn(
        &mut self,
        conversation_id: &str,
        turn: &PendingTurn,
        user_message: &StoredMessage,
        provisional_title: Option<&str>,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        insert_pending_turn(&transaction, conversation_id, turn)?;
        insert_message(
            &transaction,
            conversation_id,
            user_message,
            Some(&turn.id),
            StoredMessageStatus::Complete,
        )?;
        if let Some(title) = provisional_title {
            transaction.execute(
                "UPDATE conversations SET title = ?1 WHERE id = ?2",
                params![title, conversation_id],
            )?;
        }
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        Ok(())
    }

    pub(crate) fn begin_pending_turn(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
        retry_error_id: Option<&str>,
        assistant_message_id: &str,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        if let Some(error_id) = retry_error_id {
            transaction.execute(
                "DELETE FROM messages WHERE conversation_id = ?1 AND id = ?2",
                params![conversation_id, error_id],
            )?;
            compact_message_positions(&transaction, conversation_id)?;
        } else {
            transaction.execute(
                "UPDATE messages
                 SET position = COALESCE(
                     (SELECT MAX(existing.position) + 1
                      FROM messages existing
                      WHERE existing.conversation_id = ?1),
                     0
                 )
                 WHERE conversation_id = ?1
                   AND id = ?2
                   AND role = 'user'",
                params![conversation_id, turn_id],
            )?;
        }
        insert_message(
            &transaction,
            conversation_id,
            &StoredMessage {
                id: assistant_message_id.to_owned(),
                role: StoredMessageRole::Assistant,
                content: String::new(),
                model: None,
            },
            Some(turn_id),
            StoredMessageStatus::Streaming,
        )?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        Ok(())
    }

    pub(crate) fn update_streaming_message(
        &self,
        conversation_id: &str,
        message_id: &str,
        content: &str,
        model: Option<&str>,
    ) -> Result<i64, StoreError> {
        let changed = self.connection.execute(
            "UPDATE messages
             SET content = ?1,
                 model = COALESCE(?2, model),
                 revision = revision + 1
             WHERE conversation_id = ?3
               AND id = ?4
               AND status = 'streaming'",
            params![content, model, conversation_id, message_id],
        )?;
        if changed == 0 {
            return Err(StoreError::MissingMessage(message_id.to_owned()));
        }
        self.connection
            .query_row(
                "SELECT revision FROM messages WHERE id = ?1",
                [message_id],
                |row| row.get(0),
            )
            .map_err(StoreError::from)
    }

    pub(crate) fn finish_pending_turn(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
        assistant_message_id: &str,
        role: StoredMessageRole,
        content: &str,
        model: Option<&str>,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        let changed = transaction.execute(
            "UPDATE messages
             SET role = ?1,
                 content = ?2,
                 model = ?3,
                 status = 'complete',
                 revision = revision + 1
             WHERE conversation_id = ?4 AND id = ?5",
            params![
                role.as_str(),
                content,
                model,
                conversation_id,
                assistant_message_id
            ],
        )?;
        if changed == 0 {
            return Err(StoreError::MissingMessage(assistant_message_id.to_owned()));
        }
        remove_pending_turn(&transaction, conversation_id, turn_id)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        Ok(())
    }

    pub(crate) fn discard_pending_stream(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
        assistant_message_id: &str,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "DELETE FROM messages WHERE conversation_id = ?1 AND id = ?2",
            params![conversation_id, assistant_message_id],
        )?;
        compact_message_positions(&transaction, conversation_id)?;
        remove_pending_turn(&transaction, conversation_id, turn_id)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        Ok(())
    }

    pub(crate) fn fail_pending_turn(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
        error: &str,
    ) -> Result<bool, StoreError> {
        let transaction = self.connection.transaction()?;
        let retry_error_id = transaction
            .query_row(
                "SELECT retry_error_id
                 FROM pending_turns
                 WHERE conversation_id = ?1 AND id = ?2",
                params![conversation_id, turn_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?;
        let Some(retry_error_id) = retry_error_id else {
            return Ok(false);
        };
        let streaming_message_id = transaction
            .query_row(
                "SELECT id
                 FROM messages
                 WHERE conversation_id = ?1
                   AND request_id = ?2
                   AND status = 'streaming'",
                params![conversation_id, turn_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(message_id) = streaming_message_id {
            transaction.execute(
                "UPDATE messages
                 SET role = 'error',
                     content = ?1,
                     model = NULL,
                     status = 'complete',
                     revision = revision + 1
                 WHERE id = ?2",
                params![error, message_id],
            )?;
        } else if retry_error_id.is_none() {
            insert_message(
                &transaction,
                conversation_id,
                &StoredMessage {
                    id: Uuid::new_v4().to_string(),
                    role: StoredMessageRole::Error,
                    content: error.to_owned(),
                    model: None,
                },
                Some(turn_id),
                StoredMessageStatus::Complete,
            )?;
        }
        remove_pending_turn(&transaction, conversation_id, turn_id)?;
        touch_conversation(&transaction, conversation_id)?;
        transaction.commit()?;
        Ok(true)
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

fn insert_message(
    transaction: &Transaction<'_>,
    conversation_id: &str,
    message: &StoredMessage,
    request_id: Option<&str>,
    status: StoredMessageStatus,
) -> Result<(), StoreError> {
    transaction.execute(
        "INSERT INTO messages (
            id, conversation_id, position, role, content, model, request_id, status, revision
         )
         VALUES (
            ?1, ?2,
            COALESCE((SELECT MAX(position) + 1 FROM messages WHERE conversation_id = ?2), 0),
            ?3, ?4, ?5, ?6, ?7, 0
         )",
        params![
            message.id,
            conversation_id,
            message.role.as_str(),
            message.content,
            message.model,
            request_id,
            status.as_str()
        ],
    )?;
    Ok(())
}

fn remove_pending_turn(
    transaction: &Transaction<'_>,
    conversation_id: &str,
    turn_id: &str,
) -> Result<(), StoreError> {
    transaction.execute(
        "DELETE FROM pending_turns WHERE conversation_id = ?1 AND id = ?2",
        params![conversation_id, turn_id],
    )?;
    compact_positions(transaction, conversation_id)
}

pub(super) fn compact_message_positions(
    transaction: &Transaction<'_>,
    conversation_id: &str,
) -> Result<(), StoreError> {
    let ordered = {
        let mut statement = transaction.prepare(
            "SELECT id
             FROM messages
             WHERE conversation_id = ?1
             ORDER BY position ASC",
        )?;
        let rows = statement.query_map([conversation_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for (position, id) in ordered.iter().enumerate() {
        transaction.execute(
            "UPDATE messages SET position = ?1
             WHERE conversation_id = ?2 AND id = ?3",
            params![
                -i64::try_from(position).unwrap_or(i64::MAX) - 1,
                conversation_id,
                id
            ],
        )?;
    }
    for (position, id) in ordered.iter().enumerate() {
        transaction.execute(
            "UPDATE messages SET position = ?1
             WHERE conversation_id = ?2 AND id = ?3",
            params![position as i64, conversation_id, id],
        )?;
    }
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
    let _ = load_updated_at(transaction, conversation_id)?;
    Ok(())
}
