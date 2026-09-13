use super::{AccountStoreBoundary, CommandContext, CommandGateError};
use crate::{cancellation::CancellationToken, runtime::windows_file::open_directory};

/// Rechecks all explicit filesystem scopes; no profile or approval bypasses this guard.
pub(super) fn check(
    boundary: &AccountStoreBoundary,
    context: &CommandContext,
    cancellation: &CancellationToken,
) -> Result<(), CommandGateError> {
    boundary
        .verify(context.timeout(), cancellation)
        .map_err(CommandGateError::AccountStorage)?;
    let workspace = context.workspace_binding();
    for path in [
        workspace.source_root(),
        workspace.source_cwd(),
        workspace.execution_root(),
        workspace.execution_cwd(),
    ]
    .into_iter()
    .chain(
        context
            .permissions()
            .extra_roots
            .iter()
            .map(|root| root.as_path()),
    ) {
        if cancellation.is_cancelled() {
            return Err(CommandGateError::Cancelled);
        }
        let file =
            open_directory(path, false).map_err(|source| CommandGateError::NativeSandbox {
                operation: "open command scope for storage protection",
                source,
            })?;
        boundary
            .check_directory(&file)
            .map_err(CommandGateError::AccountStorage)?;
    }
    Ok(())
}

pub(super) fn prepare(
    context: &CommandContext,
    cancellation: &CancellationToken,
) -> Result<AccountStoreBoundary, CommandGateError> {
    let boundary = AccountStoreBoundary::resolve(context.timeout(), cancellation)
        .map_err(CommandGateError::AccountStorage)?;
    check(&boundary, context, cancellation)?;
    Ok(boundary)
}
