-- Local memory index (U2). SQLite is a rebuildable projection of file truth:
-- memory_items projects the topic markdown files; the inbox, cursor, and
-- correction tables project the append-only memory_events.jsonl lifecycle log.
-- Additive and forward-only per the store migration contract.

-- Projected metadata for each active/candidate memory topic file.
CREATE TABLE memory_items (
    id                TEXT NOT NULL,
    scope             TEXT NOT NULL,
    -- '' for user-global; opaque scope id for repo/folder/session.
    scope_id          TEXT NOT NULL DEFAULT '',
    memory_type       TEXT NOT NULL,
    title             TEXT NOT NULL,
    active            INTEGER NOT NULL DEFAULT 1,
    source            TEXT NOT NULL,
    source_session_id TEXT,
    source_turn_start INTEGER,
    source_turn_end   INTEGER,
    content_hash      TEXT NOT NULL,
    file_path         TEXT NOT NULL,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    PRIMARY KEY (scope, scope_id, id)
);

CREATE INDEX idx_memory_items_scope_active_updated
    ON memory_items(scope, scope_id, active, updated_at DESC);

-- Inbox entries: audit rows for automatic active updates and inactive
-- candidates. Rollback/diff payloads live in memory_events.jsonl (truth); this
-- projection carries only references and non-content review metadata.
CREATE TABLE memory_inbox_entries (
    id                TEXT PRIMARY KEY NOT NULL,
    status            TEXT NOT NULL,
    scope             TEXT NOT NULL,
    scope_id          TEXT NOT NULL DEFAULT '',
    target_item_id    TEXT,
    memory_type       TEXT,
    title             TEXT,
    confidence        REAL,
    source_session_id TEXT,
    source_turn_start INTEGER,
    source_turn_end   INTEGER,
    operation_id      TEXT,
    base_hash         TEXT,
    result_hash       TEXT,
    reason            TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_memory_inbox_status
    ON memory_inbox_entries(status, updated_at DESC);

-- Per-session extraction cursor: only completed settled turns with a seq above
-- last_extracted_seq are eligible for extraction.
CREATE TABLE memory_cursors (
    session_id         TEXT PRIMARY KEY NOT NULL,
    last_extracted_seq INTEGER NOT NULL DEFAULT -1,
    updated_at         INTEGER NOT NULL
);

-- Correction suppression: normalized keys (never raw rejected content) that
-- prevent recreating a memory a user has rejected/undone.
CREATE TABLE memory_corrections (
    suppression_key TEXT PRIMARY KEY NOT NULL,
    scope           TEXT NOT NULL,
    scope_id        TEXT NOT NULL DEFAULT '',
    reason          TEXT,
    created_at      INTEGER NOT NULL
);
