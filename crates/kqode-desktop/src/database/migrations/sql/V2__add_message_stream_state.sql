ALTER TABLE messages ADD COLUMN request_id TEXT;
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('streaming', 'complete'));
ALTER TABLE messages ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX messages_conversation_position_desc
    ON messages (conversation_id, position DESC);
CREATE INDEX messages_request_id
    ON messages (request_id);
