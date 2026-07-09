-- Theme preference (theme command plan, U2). Numbered V4 because V2/V3 already
-- ship the session-resume and memory indexes.
--
-- A user-global singleton (id = 1, CHECK-pinned like active_selection) storing
-- only the selected built-in theme id -- never palette values. TypeScript owns
-- the catalog, display names, and unknown-id fallback, so Rust persists an
-- opaque, well-formed id and an unknown-but-valid id round-trips unchanged. A
-- NULL theme_id (or no row) means "use the default theme". Additive and
-- forward-only per the store migration contract.
CREATE TABLE ui_preferences (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    theme_id   TEXT,
    updated_at INTEGER NOT NULL
);
