/**
 * Hidden argument that switches the `kqode` binary into JSON-RPC backend mode.
 *
 * Must match the `BACKEND_MODE_ARG` constant in `src/protocol.rs`.
 */
export const BACKEND_MODE_ARG = '--__kqode-json-rpc-backend';

/** Cargo bin target name for the Rust backend. */
export const CARGO_BINARY_NAME = 'kqode';

/** Cargo launcher command resolved from the hardened `PATH`. */
export const CARGO_COMMAND = 'cargo';

/** Default ceiling for a source-mode Cargo build before it is treated as hung. */
export const DEFAULT_BUILD_TIMEOUT_MS = 180_000;

/** Default ceiling for the spawned backend to signal JSON-RPC readiness. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;

/** Default ceiling for a single message-submit round trip. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** Captured Cargo stderr is capped so a noisy build cannot exhaust memory. */
export const BUILD_STDERR_CAP_BYTES = 16 * 1024;
