-- Opaque memory scope-id registry. Caller-supplied scope ids must resolve to a
-- backend-recorded mapping before they are used as filesystem path components.
-- This keeps repo/session/folder memory roots definite instead of trusting raw
-- protocol strings.
CREATE TABLE memory_scope_mappings (
    scope         TEXT NOT NULL,
    scope_id      TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (scope, scope_id)
);

CREATE INDEX idx_memory_scope_mappings_key
    ON memory_scope_mappings(scope, canonical_key);
