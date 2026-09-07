CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    workspace_path TEXT,
    provider TEXT,
    model TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'error')),
    content TEXT NOT NULL,
    model TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE (conversation_id, position)
);

CREATE TABLE pending_turns (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    content TEXT NOT NULL,
    retry_error_id TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE (conversation_id, position)
);

CREATE TABLE provider_settings (
    provider TEXT PRIMARY KEY,
    api_base_url TEXT NOT NULL,
    key_present INTEGER NOT NULL DEFAULT 0,
    highlighted_models_json TEXT NOT NULL DEFAULT '[]',
    model TEXT NOT NULL
);

CREATE TABLE model_cache (
    provider TEXT PRIMARY KEY,
    models_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
);
