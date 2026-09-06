# KQode Desktop Frontend

This folder contains the React/Vite frontend for the `kqode-desktop` crate.
The parent directory owns the Tauri Rust application, configuration, permissions,
and package assets.

## Development

From the repository root, install dependencies as needed and start the app:

```powershell
cargo xtask desktop-dev
```

Run focused frontend checks from this directory:

```powershell
bun run typecheck
bun run build
```

Open Settings from the gear beside the KQode logo, enter a Kimi API key, select
one of the supported built-in Kimi models, and save. Provider settings and
conversation history are persisted in the local SQLite application database.
