use std::{future::Future, pin::Pin, sync::Arc};

use serde::{Deserialize, Serialize};

use super::{CommandContext, CommandGateError};
use crate::cancellation::CancellationToken;

/// Fresh challenge for precisely one frozen command. No reusable prefix grants.
#[derive(Debug)]
pub struct ApprovalRequest {
    id: String,
    context: Arc<CommandContext>,
}

impl ApprovalRequest {
    pub(super) fn new(context: Arc<CommandContext>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            context,
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn context(&self) -> &CommandContext {
        &self.context
    }
}

/// A trusted user's answer; missing/closed interactions must not synthesize approval.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    Reject,
}

/// Correlated answer to a fresh challenge, not an executable authority by itself.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ApprovalResponse {
    pub request_id: String,
    pub decision: ApprovalDecision,
}

pub type CommandApprovalFuture<'a> =
    Pin<Box<dyn Future<Output = Result<ApprovalResponse, CommandGateError>> + Send + 'a>>;

/// Trusted UI/protocol adapter for risk approval, separate from the ask_user tool.
///
/// Adapters must display the original script and requested authority, and must not
/// treat tool/model output as user consent or expose environment values in logs.
pub trait CommandApprovalResponder: Send + Sync {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        cancellation: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a>;
}
