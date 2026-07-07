CREATE TABLE provider_settings (
    provider_id       TEXT PRIMARY KEY NOT NULL,
    base_url          TEXT NOT NULL,
    label             TEXT,
    key_present       INTEGER NOT NULL DEFAULT 0,
    last_connected_at INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);
CREATE TABLE active_selection (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    provider_id TEXT NOT NULL,
    model_id    TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE TABLE sessions (
    id            TEXT PRIMARY KEY NOT NULL,
    created_at    INTEGER NOT NULL,
    workspace_cwd TEXT NOT NULL,
    jsonl_path    TEXT NOT NULL
);
CREATE TABLE turns (
    id         TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
