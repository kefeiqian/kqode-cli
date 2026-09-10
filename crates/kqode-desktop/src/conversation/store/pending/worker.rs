use rusqlite::params;

use super::super::{ConversationStore, StoreError};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PendingWork {
    pub(crate) conversation_id: String,
    pub(crate) turn_id: String,
}

impl ConversationStore {
    #[cfg(test)]
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

    #[cfg(test)]
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

    pub(crate) fn mark_pending_turn_queued(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<bool, StoreError> {
        Ok(self.connection.execute(
            "UPDATE pending_turns
             SET status = 'queued'
             WHERE conversation_id = ?1 AND id = ?2 AND status = 'running'",
            params![conversation_id, turn_id],
        )? == 1)
    }

    pub(crate) fn claim_queued_work(&mut self) -> Result<Vec<PendingWork>, StoreError> {
        let transaction = self.connection.transaction()?;
        let work = {
            let mut statement = transaction.prepare(
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
            rows.collect::<Result<Vec<_>, _>>()?
        };
        for item in &work {
            transaction.execute(
                "UPDATE pending_turns
                 SET status = 'running'
                 WHERE conversation_id = ?1 AND id = ?2 AND status = 'queued'",
                params![item.conversation_id, item.turn_id],
            )?;
        }
        transaction.commit()?;
        Ok(work)
    }
}
