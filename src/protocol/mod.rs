use serde::{Deserialize, Serialize};

mod memory;
mod providers;
mod queue;
mod sessions;
#[cfg(test)]
mod tests;
mod themes;
pub use memory::*;
pub use providers::*;
pub use queue::*;
pub use sessions::*;
pub use themes::*;

/// Hidden argument that starts the internal JSON-RPC backend loop.
pub const BACKEND_MODE_ARG: &str = "--__kqode-json-rpc-backend";

/// Headless one-shot flag: `kqode --prompt <text>` resolves the active provider,
/// prints a single completion, and exits. With no inline value (or the value
/// `-`), the prompt is read from stdin. Rust-only (not part of the JSON-RPC
/// protocol), so it has no TypeScript mirror.
pub const PROMPT_FLAG: &str = "--prompt";

/// Headless machine-readable output flag, paired with [`PROMPT_FLAG`]: emit one
/// JSON object with the completion text, finish reason, model, and token usage
/// (never the provider key). Rust-only, no TypeScript mirror.
pub const JSON_FLAG: &str = "--json";

/// Subcommand that runs the public-benchmark eval baseline (`kqode eval ...`).
/// Rust-only, no TypeScript mirror.
pub const EVAL_SUBCOMMAND: &str = "eval";

/// JSON-RPC notification the backend emits exactly once, immediately after its
/// stdio transport is live and before it handles any request.
///
/// It signals "I am listening and speaking JSON-RPC," so a client can bound
/// startup readiness on this notification instead of the OS process-spawn event
/// (a backend that spawns but never speaks would otherwise slip past the startup
/// timeout). The mirrored TypeScript constant lives in
/// `tui/src/contracts/backend/messages.ts` (`BACKEND_READY_METHOD`).
pub const BACKEND_READY_METHOD: &str = "kqode.backend.ready";

/// Server→client notification carrying one chunk of streamed assistant text.
/// Mirrored in `tui/src/contracts/backend/messages.ts`.
pub const TOKEN_DELTA_METHOD: &str = "kqode/tokenDelta";

/// JSON-RPC code for method lookup failures.
pub const JSON_RPC_METHOD_NOT_FOUND: i32 = -32601;

/// JSON-RPC code for requests whose params do not match the method contract.
pub const JSON_RPC_INVALID_PARAMS: i32 = -32602;

/// KQode-owned JSON-RPC methods supported by this slice.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RpcMethod {
    MessageSubmit,
    ConversationClear,
    TurnCancel,
    TurnStop,
    GitStatus,
    ProviderList,
    SelectionGet,
    SelectionSet,
    ProviderClearKey,
    ProviderSetKey,
    ProviderModels,
    ThemeGet,
    ThemeSet,
    SessionList,
    SessionResume,
    MemoryList,
    MemoryShow,
    MemoryAdd,
    MemoryEdit,
    MemoryForget,
    MemoryReload,
    MemoryInboxList,
    MemoryInboxApply,
    MemoryInboxUndo,
}

impl RpcMethod {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MessageSubmit => "kqode.message.submit",
            Self::ConversationClear => "kqode.conversation.clear",
            Self::TurnCancel => "kqode.turn.cancel",
            Self::TurnStop => "kqode.turn.stop",
            Self::GitStatus => "kqode.git.status",
            Self::ProviderList => PROVIDER_LIST_METHOD,
            Self::SelectionGet => SELECTION_GET_METHOD,
            Self::SelectionSet => SELECTION_SET_METHOD,
            Self::ProviderClearKey => PROVIDER_CLEAR_KEY_METHOD,
            Self::ProviderSetKey => PROVIDER_SET_KEY_METHOD,
            Self::ProviderModels => PROVIDER_MODELS_METHOD,
            Self::ThemeGet => THEME_GET_METHOD,
            Self::ThemeSet => THEME_SET_METHOD,
            Self::SessionList => SESSION_LIST_METHOD,
            Self::SessionResume => SESSION_RESUME_METHOD,
            Self::MemoryList => MEMORY_LIST_METHOD,
            Self::MemoryShow => MEMORY_SHOW_METHOD,
            Self::MemoryAdd => MEMORY_ADD_METHOD,
            Self::MemoryEdit => MEMORY_EDIT_METHOD,
            Self::MemoryForget => MEMORY_FORGET_METHOD,
            Self::MemoryReload => MEMORY_RELOAD_METHOD,
            Self::MemoryInboxList => MEMORY_INBOX_LIST_METHOD,
            Self::MemoryInboxApply => MEMORY_INBOX_APPLY_METHOD,
            Self::MemoryInboxUndo => MEMORY_INBOX_UNDO_METHOD,
        }
    }

    /// Resolves a wire method name to its [`RpcMethod`], or `None` when the
    /// backend does not implement it (yielding a method-not-found response).
    #[must_use]
    pub fn from_method(method: &str) -> Option<Self> {
        [
            Self::MessageSubmit,
            Self::ConversationClear,
            Self::TurnCancel,
            Self::TurnStop,
            Self::GitStatus,
            Self::ProviderList,
            Self::SelectionGet,
            Self::SelectionSet,
            Self::ProviderClearKey,
            Self::ProviderSetKey,
            Self::ProviderModels,
            Self::ThemeGet,
            Self::ThemeSet,
            Self::SessionList,
            Self::SessionResume,
            Self::MemoryList,
            Self::MemoryShow,
            Self::MemoryAdd,
            Self::MemoryEdit,
            Self::MemoryForget,
            Self::MemoryReload,
            Self::MemoryInboxList,
            Self::MemoryInboxApply,
            Self::MemoryInboxUndo,
        ]
        .into_iter()
        .find(|candidate| candidate.as_str() == method)
    }
}

/// Params for `kqode.message.submit`.
///
/// `turnId` is generated by the client so it can register notification handlers
/// before sending, correlating streamed events without depending on ack
/// ordering. Kept in lockstep with the TypeScript `MessageSubmitParams`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MessageSubmitParams {
    pub text: String,
    pub turn_id: String,
}

/// Result for `kqode.message.submit`: an immediate accepted ack.
///
/// `turnId` echoes the client's id. Terminal outcomes, including missing
/// provider configuration, are delivered through `kqode/turnSettled`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSubmitResult {
    pub turn_id: String,
}

/// Payload for [`BACKEND_READY_METHOD`].
///
/// Carries the backend-minted session id so the client can scope its own
/// per-session log to the same session. Kept in lockstep with the TypeScript
/// `BackendReadyParams`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendReadyParams {
    pub session_id: String,
}

/// Payload for [`TOKEN_DELTA_METHOD`].
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenDeltaParams {
    pub turn_id: String,
    pub delta: String,
}

/// Result for `kqode.git.status`: the formatted working-tree label, or `null`
/// when the workspace is not a git repository (or `git` could not be queried).
/// The backend owns parsing and formatting; the client renders `label` verbatim.
/// Kept in lockstep with the TypeScript `GitStatusResult`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub label: Option<String>,
}
