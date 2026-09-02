ALTER TABLE sessions ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN canonical_workspace_cwd TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN first_prompt_summary TEXT;

CREATE INDEX idx_sessions_modified_created
    ON sessions(modified_at DESC, created_at DESC, id DESC);

CREATE UNIQUE INDEX idx_turns_session_seq
    ON turns(session_id, seq);
