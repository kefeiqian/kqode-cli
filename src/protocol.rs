use serde::{Deserialize, Serialize};

/// Hidden argument that starts the internal JSON-RPC backend loop.
pub const BACKEND_MODE_ARG: &str = "--__kqode-json-rpc-backend";

/// ACK text returned by the first-slice backend proof.
pub const ACK_MESSAGE: &str = "ACK: message received";

/// JSON-RPC notification the backend emits exactly once, immediately after its
/// stdio transport is live and before it handles any request.
///
/// It signals "I am listening and speaking JSON-RPC," so a client can bound
/// startup readiness on this notification instead of the OS process-spawn event
/// (a backend that spawns but never speaks would otherwise slip past the startup
/// timeout). The mirrored TypeScript constant lives in
/// `tui/src/contracts/backend/messages.ts` (`BACKEND_READY_METHOD`).
pub const BACKEND_READY_METHOD: &str = "kqode.backend.ready";

/// JSON-RPC code for method lookup failures.
pub const JSON_RPC_METHOD_NOT_FOUND: i32 = -32601;

/// JSON-RPC code for requests whose params do not match the method contract.
pub const JSON_RPC_INVALID_PARAMS: i32 = -32602;

/// KQode-owned JSON-RPC methods supported by this slice.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RpcMethod {
    MessageSubmit,
}

impl RpcMethod {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MessageSubmit => "kqode.message.submit",
        }
    }
}

/// Params for `kqode.message.submit`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MessageSubmitParams {
    pub text: String,
}

/// Result for `kqode.message.submit`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSubmitResult {
    pub message: &'static str,
    pub received_text: String,
}

impl From<MessageSubmitParams> for MessageSubmitResult {
    fn from(params: MessageSubmitParams) -> Self {
        Self {
            message: ACK_MESSAGE,
            received_text: params.text,
        }
    }
}
