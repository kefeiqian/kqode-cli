ALTER TABLE pending_turns ADD COLUMN status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running'));

CREATE INDEX pending_turns_status_position
    ON pending_turns (status, conversation_id, position);
