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
 * KQode-owned JSON-RPC method returning the workspace git/PR status.
 *
 * Must match `RpcMethod::GitStatus` (via `RpcMethod::as_str`) in
 * `src/protocol.rs`. The backend runs git/GitHub status commands in the
 * workspace and formats the returned display segments.
 */
export const GIT_STATUS_METHOD = 'kqode.git.status';

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

/** `status` value when a submit cannot run because no API key is configured. */
export const SUBMIT_STATUS_NEEDS_CONFIGURATION = 'needsConfiguration';

/**
 * Params for `kqode.message.submit`.
 *
 * `turnId` is a client-generated identity for the turn that the backend echoes
 * back in its ack. The streaming notification channel that will correlate on
 * this id lands with the provider PR; today it simply travels with the request.
 * The Rust backend deserializes this with `#[serde(deny_unknown_fields)]`
 * (`MessageSubmitParams` in `src/protocol.rs`), so keep the two shapes in
 * lockstep.
 */
export type MessageSubmitParams = {
  text: string;
  turnId: string;
};

/**
 * Result for `kqode.message.submit`: an immediate ack. `status` is
 * {@link SUBMIT_STATUS_NEEDS_CONFIGURATION} in this bootstrap slice because no
 * provider is wired yet; streaming statuses arrive with the provider PR.
 */
export type MessageSubmitResult = {
  turnId: string;
  status: string;
};

/**
 * Result for `kqode.git.status`: the formatted working-tree label (e.g.
 * `⎇ main*`), or `null` when the workspace is not a git repository or `git`
 * could not be queried. `pullRequestLabel` is an optional GitHub PR segment
 * such as `#3`, and `pullRequestUrl` is that PR's web URL when available (so the
 * TUI can render the label as a hyperlink). The Rust backend owns parsing and
 * formatting (`GitStatusResult` in `src/protocol.rs`); keep the two shapes in
 * lockstep.
 */
export type GitStatusResult = {
  label: string | null;
  pullRequestLabel: string | null;
  pullRequestUrl: string | null;
};
