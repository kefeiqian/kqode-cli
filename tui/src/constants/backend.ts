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

/**
 * Env var that enables backend debug logging (LLM request/response transcripts
 * under `~/.kqode/logs/`). Mirrors `KQODE_DEBUG_VAR` in `src/debug_log.rs`; the
 * `--debug` CLI flag sets it for the spawned backend.
 */
export const KQODE_DEBUG_ENV_VAR = 'KQODE_DEBUG';

/** Env var overriding the backend log directory. Mirrors `KQODE_LOG_DIR_VAR`. */
export const KQODE_LOG_DIR_ENV_VAR = 'KQODE_LOG_DIR';

/** Default ceiling for a source-mode Cargo build before it is treated as hung. */
export const DEFAULT_BUILD_TIMEOUT_MS = 180_000;

/** Default ceiling for the spawned backend to signal JSON-RPC readiness. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;

/** Default ceiling for a single message-submit round trip. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Ceiling for provider validation/model-list requests. Must remain non-fatal:
 * callers convert timeout into provider-domain failure results.
 */
export const VALIDATION_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Ceiling for the pre-render saved-theme read. Long enough for a warm (prebuilt)
 * backend to answer `kqode.theme.get`, but short enough that a cold start (Cargo
 * build) does not stall the first frame: on timeout the default theme is seeded
 * and normal backend startup continues.
 */
export const INITIAL_THEME_READ_DEADLINE_MS = 1_500;

/** Captured Cargo stderr is capped so a noisy build cannot exhaust memory. */
export const BUILD_STDERR_CAP_BYTES = 16 * 1024;

/** Captured backend stderr is capped so a crashing backend cannot exhaust memory. */
export const BACKEND_STDERR_CAP_BYTES = 16 * 1024;

/** Backend process exit code for fail-closed store startup failures. */
export const STORE_FAILURE_EXIT_CODE = 75;

/** Stable stderr prefix emitted by store startup failures. */
export const STORE_FATAL_SENTINEL = 'KQODE_STORE_FATAL:';

/**
 * Trailing-edge flush ceiling for streamed assistant tokens: the transcript
 * re-renders at most once per this many ms (~15fps) rather than once per token.
 * Windows with no new tokens emit nothing, so the effective rate floats down to
 * the token arrival rate — a max-fps cap, not a forced cadence. See
 * `createDeltaCoalescer`.
 */
export const STREAM_RENDER_FLUSH_MS = 66;
