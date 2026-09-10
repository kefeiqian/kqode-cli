use rusqlite::params;

use super::super::{ConversationStore, StoreError};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PendingWork {
    pub(crate) conversation_id: String,
    pub(crate) turn_id: String,
}

impl ConversationStore {
    pub(crate) fn load_queued_work(&self) -> Result<Vec<PendingWork>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT p.conversation_id, p.id
             FROM pending_turns p
             JOIN conversations c ON c.id = p.conversation_id
             WHERE p.status = 'queued' AND c.archived = 0
             ORDER BY c.updated_at ASC, p.position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(PendingWork {
                conversation_id: row.get(0)?,
                turn_id: row.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub(crate) fn mark_pending_turn_running(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<bool, StoreError> {
        Ok(self.connection.execute(
            "UPDATE pending_turns
             SET status = 'running'
             WHERE conversation_id = ?1 AND id = ?2 AND status = 'queued'",
            params![conversation_id, turn_id],
        )? == 1)
    }
}
