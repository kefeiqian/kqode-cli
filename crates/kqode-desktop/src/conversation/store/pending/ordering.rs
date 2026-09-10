use rusqlite::{Transaction, params};

use super::super::StoreError;

pub(super) fn prioritized_ids(
    mut ids: Vec<String>,
    active_turn_id: Option<&str>,
    turn_id: &str,
) -> Option<Vec<String>> {
    let target_index = ids.iter().position(|id| id == turn_id)?;
    let target = ids.remove(target_index);
    let mut ordered = Vec::with_capacity(ids.len() + 1);
    if let Some(active_id) = active_turn_id
        && active_id != turn_id
        && let Some(active_index) = ids.iter().position(|id| id == active_id)
    {
        ordered.push(ids.remove(active_index));
    }
    ordered.push(target);
    ordered.append(&mut ids);
    Some(ordered)
}

pub(super) fn persist_positions(
    transaction: &Transaction<'_>,
    conversation_id: &str,
    ordered: &[String],
) -> Result<(), StoreError> {
    for (position, id) in ordered.iter().enumerate() {
        transaction.execute(
            "UPDATE pending_turns SET position = ?1
             WHERE conversation_id = ?2 AND id = ?3",
            params![temporary_position(position), conversation_id, id],
        )?;
    }
    for (position, id) in ordered.iter().enumerate() {
        transaction.execute(
            "UPDATE pending_turns SET position = ?1
             WHERE conversation_id = ?2 AND id = ?3",
            params![position as i64, conversation_id, id],
        )?;
    }
    Ok(())
}

pub(crate) fn compact_positions(
    transaction: &Transaction<'_>,
    conversation_id: &str,
) -> Result<(), StoreError> {
    transaction.execute(
        "UPDATE pending_turns
         SET position = (
             SELECT COUNT(*) - 1
             FROM pending_turns earlier
             WHERE earlier.conversation_id = pending_turns.conversation_id
               AND earlier.position <= pending_turns.position
         )
         WHERE conversation_id = ?1",
        [conversation_id],
    )?;
    Ok(())
}

fn temporary_position(position: usize) -> i64 {
    -i64::try_from(position).unwrap_or(i64::MAX) - 1
}
