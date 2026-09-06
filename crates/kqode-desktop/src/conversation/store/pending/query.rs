use rusqlite::{OptionalExtension, params};

use super::super::{ConversationStore, PendingTurn, StoreError};

impl ConversationStore {
    pub(crate) fn load_pending_turn(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<Option<PendingTurn>, StoreError> {
        self.connection
            .query_row(
                "SELECT id, content, retry_error_id
                 FROM pending_turns
                 WHERE conversation_id = ?1 AND id = ?2",
                params![conversation_id, turn_id],
                |row| {
                    Ok(PendingTurn {
                        id: row.get(0)?,
                        content: row.get(1)?,
                        retry_error_id: row.get(2)?,
                        is_active: false,
                    })
                },
            )
            .optional()
            .map_err(StoreError::from)
    }

    pub(crate) fn load_pending_turns(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<PendingTurn>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, content, retry_error_id
             FROM pending_turns
             WHERE conversation_id = ?1
             ORDER BY position",
        )?;
        let rows = statement.query_map([conversation_id], |row| {
            Ok(PendingTurn {
                id: row.get(0)?,
                content: row.get(1)?,
                retry_error_id: row.get(2)?,
                is_active: false,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }
}
