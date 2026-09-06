use std::{future::Future, pin::Pin};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cancellation::CancellationToken;

use super::ToolResult;

/// Runtime identity and arguments for one tool dispatch.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolInvocation {
    pub call_id: String,
    pub canonical_name: String,
    pub arguments: Value,
    pub session_id: String,
    pub turn_id: String,
    pub step_id: String,
}

/// Future returned by a provider-neutral tool handler.
pub type ToolHandlerFuture<'a> = Pin<Box<dyn Future<Output = ToolResult> + Send + 'a>>;

/// Executes one registered tool without exposing provider-native types.
pub trait ToolHandler: Send + Sync {
    fn invoke<'a>(
        &'a self,
        invocation: &'a ToolInvocation,
        cancellation: &'a CancellationToken,
    ) -> ToolHandlerFuture<'a>;
}
