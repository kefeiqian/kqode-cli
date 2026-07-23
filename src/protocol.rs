use serde::{Deserialize, Serialize};

/// Hidden argument that starts the internal JSON-RPC backend loop.
pub const BACKEND_MODE_ARG: &str = "--__kqode-json-rpc-backend";

/// JSON-RPC notification the backend emits exactly once, immediately after its
/// stdio transport is live and before it handles any request.
///
/// It signals "I am listening and speaking JSON-RPC," so a client can bound
/// startup readiness on this notification instead of the OS process-spawn event
/// (a backend that spawns but never speaks would otherwise slip past the startup
/// timeout). The mirrored TypeScript constant lives in
/// `tui/src/contracts/backend/messages.ts` (`BACKEND_READY_METHOD`).
pub const BACKEND_READY_METHOD: &str = "kqode.backend.ready";

/// `status` value when a submit cannot run because no API key is configured.
pub const SUBMIT_STATUS_NEEDS_CONFIGURATION: &str = "needsConfiguration";

/// JSON-RPC code for method lookup failures.
pub const JSON_RPC_METHOD_NOT_FOUND: i32 = -32601;

/// JSON-RPC code for requests whose params do not match the method contract.
pub const JSON_RPC_INVALID_PARAMS: i32 = -32602;

/// KQode-owned JSON-RPC methods supported by this slice.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RpcMethod {
    MessageSubmit,
    GitStatus,
    PullRequest,
}

impl RpcMethod {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MessageSubmit => "kqode.message.submit",
            Self::GitStatus => "kqode.git.status",
            Self::PullRequest => "kqode.git.pullRequest",
        }
    }

    /// Resolves a wire method name to its [`RpcMethod`], or `None` when the
    /// backend does not implement it (yielding a method-not-found response).
    #[must_use]
    pub fn from_method(method: &str) -> Option<Self> {
        [Self::MessageSubmit, Self::GitStatus, Self::PullRequest]
            .into_iter()
            .find(|candidate| candidate.as_str() == method)
    }
}

/// Params for `kqode.message.submit`.
///
/// Carries only the prompt `text` in this bootstrap slice. Kept in lockstep with
/// the TypeScript `MessageSubmitParams`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MessageSubmitParams {
    pub text: String,
}

/// Result for `kqode.message.submit`: an immediate ack.
///
/// `status` is [`SUBMIT_STATUS_NEEDS_CONFIGURATION`] in this bootstrap slice
/// because no provider is wired yet.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSubmitResult {
    pub status: &'static str,
}

/// Result for `kqode.git.status`: the formatted working-tree label (e.g.
/// `⎇ main*`), or `null` when the workspace is not a git repository (or `git`
/// could not be queried).
///
/// This is a fast, local query refreshed after every turn; the branch's pull
/// request is a separate, network-bound `kqode.git.pullRequest` call
/// ([`PullRequestResult`]) fetched once per session. Kept in lockstep with the
/// TypeScript `GitStatusResult`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub label: Option<String>,
}

/// Result for `kqode.git.pullRequest`: the current branch's GitHub PR as a
/// display `label` (e.g. `#3`) and web `url`, or both `null` when there is no PR
/// (or `gh` could not be queried).
///
/// Fetched once at session bootstrap because a branch's PR is static for the
/// session, and kept separate from [`GitStatusResult`] so the per-turn status
/// refresh never incurs the `gh` network round-trip. Kept in lockstep with the
/// TypeScript `PullRequestResult`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestResult {
    pub label: Option<String>,
    pub url: Option<String>,
}
