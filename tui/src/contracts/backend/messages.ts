/**
 * Wire contract for the KQode backend message protocol.
 *
 * This module is a dependency-free seam shared by the `@state` and `@backend`
 * layers: it must not import from either side (or pull in transport libraries
 * such as `vscode-jsonrpc`) so it can never participate in a layer cycle.
 */

/**
 * KQode-owned JSON-RPC method that acknowledges a submitted prompt.
 *
 * Must match `RpcMethod::MessageSubmit` (via `RpcMethod::as_str`) in
 * `src/protocol.rs`.
 */
export const MESSAGE_SUBMIT_METHOD = 'kqode.message.submit';

/**
 * ACK text the first-slice Rust backend returns for a received prompt.
 *
 * Must match the `ACK_MESSAGE` constant in `src/protocol.rs`.
 */
export const ACK_MESSAGE = 'ACK: message received';

/**
 * JSON-RPC notification the backend emits exactly once, as soon as it is
 * listening and speaking JSON-RPC and before it handles any request.
 *
 * Must match the `BACKEND_READY_METHOD` constant in `src/protocol.rs`. The TUI
 * bounds startup readiness on this notification instead of the OS process-spawn
 * event, so a backend that spawns but never speaks is caught by the startup
 * timeout.
 */
export const BACKEND_READY_METHOD = 'kqode.backend.ready';

/**
 * Params for `kqode.message.submit`; intentionally text-only for this slice.
 *
 * The Rust backend deserializes this with serde `#[serde(deny_unknown_fields)]`
 * (`MessageSubmitParams` in `src/protocol.rs`), so adding a field here without
 * updating the Rust struct makes the backend reject the request as invalid
 * params. Keep the two shapes in lockstep.
 */
export type MessageSubmitParams = {
  text: string;
};

/** Result for `kqode.message.submit`. */
export type MessageSubmitResult = {
  message: string;
  receivedText: string;
};
