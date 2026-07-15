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
 * KQode-owned JSON-RPC method returning the workspace working-tree label.
 *
 * Must match `RpcMethod::GitStatus` (via `RpcMethod::as_str`) in
 * `src/protocol.rs`. The backend runs `git status` in the workspace and formats
 * the returned label; the branch's pull request is a separate
 * {@link PULL_REQUEST_METHOD} call.
 */
export const GIT_STATUS_METHOD = 'kqode.git.status';

/**
 * KQode-owned JSON-RPC method returning the current branch's GitHub pull request.
 *
 * Must match `RpcMethod::PullRequest` (via `RpcMethod::as_str`) in
 * `src/protocol.rs`. The backend runs `gh pr view` (a network call), so the TUI
 * requests it once at bootstrap rather than on every turn.
 */
export const PULL_REQUEST_METHOD = 'kqode.git.pullRequest';

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
 * Carries only the prompt `text` in this bootstrap slice. The Rust backend
 * deserializes this with `#[serde(deny_unknown_fields)]` (`MessageSubmitParams`
 * in `src/protocol.rs`), so keep the two shapes in lockstep.
 */
export type MessageSubmitParams = {
  text: string;
};

/**
 * Result for `kqode.message.submit`: an immediate ack. `status` is
 * {@link SUBMIT_STATUS_NEEDS_CONFIGURATION} in this bootstrap slice because no
 * provider is wired yet; streaming statuses arrive with the provider PR.
 */
export type MessageSubmitResult = {
  status: string;
};

/**
 * Result for `kqode.git.status`: the formatted working-tree label (e.g.
 * `⎇ main*`), or `null` when the workspace is not a git repository or `git`
 * could not be queried. Refreshed after every turn; the branch's pull request is
 * a separate {@link PullRequestResult}. The Rust backend owns parsing and
 * formatting (`GitStatusResult` in `src/protocol.rs`); keep the two shapes in
 * lockstep.
 */
export type GitStatusResult = {
  label: string | null;
};

/**
 * Result for `kqode.git.pullRequest`: the current branch's GitHub PR as a
 * display `label` (e.g. `#3`) and web `url`, or both `null` when there is no PR
 * (or `gh` could not be queried). Fetched once at bootstrap because a branch's
 * PR is static for the session. The Rust backend owns parsing and formatting
 * (`PullRequestResult` in `src/protocol.rs`); keep the two shapes in lockstep.
 */
export type PullRequestResult = {
  label: string | null;
  url: string | null;
};
