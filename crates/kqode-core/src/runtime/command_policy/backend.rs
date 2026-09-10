use std::{future::Future, pin::Pin, sync::Arc};

use super::{CommandContext, CommandGateError, SandboxCapabilities};
use crate::{cancellation::CancellationToken, runtime::ProcessOutput};

/// Ephemeral launch authority created only by the command gate.
///
/// This is deliberately neither Clone nor deserializable. A backend receives one
/// borrowed authority for one launch and must not cache or replay it.
#[derive(Debug)]
pub struct AuthorizedCommand {
    context: Arc<CommandContext>,
}

impl AuthorizedCommand {
    pub(super) fn new(context: Arc<CommandContext>) -> Self {
        Self { context }
    }
    pub fn context(&self) -> &CommandContext {
        &self.context
    }
}

pub type SandboxFuture<'a> =
    Pin<Box<dyn Future<Output = Result<ProcessOutput, CommandGateError>> + Send + 'a>>;

/// Trusted, enforcing platform adapter; a shell or plain supervisor is not one.
///
/// `execute` must not spawn until its future is polled. It must use the frozen
/// environment and launch context, enforce the requested limits/permissions before
/// spawning, and own descendant cleanup on cancellation or future disposal.
/// If capability availability changes after approval, fail closed at launch.
/// SnapshotWorkspace support additionally requires respecting the source/copy
/// distinction: never grant source access or publish changes as part of dispatch.
/// Returning full capabilities is a backend obligation, not proof provided by this
/// interface; production backends need real isolation acceptance tests.
pub trait SandboxBackend: Send + Sync {
    fn capabilities(&self) -> SandboxCapabilities;
    fn execute<'a>(
        &'a self,
        command: &'a AuthorizedCommand,
        cancellation: &'a CancellationToken,
    ) -> SandboxFuture<'a>;
}
