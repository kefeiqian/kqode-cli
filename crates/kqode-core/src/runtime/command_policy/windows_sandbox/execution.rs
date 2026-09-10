use super::{
    super::{CommandContext, CommandGateError},
    identity::Identity,
    native::TokenObservation,
    pipes::Pipes,
    process::NativeProcess,
    runner::native_error,
};
use crate::{cancellation::CancellationToken, runtime::ProcessOutput};
use std::{
    io,
    time::{Duration, Instant},
};

const PROCESS_POLL: Duration = Duration::from_millis(10);

pub(super) async fn run(
    context: &CommandContext,
    identity: Identity,
    pipes: Pipes,
    cancel: &CancellationToken,
) -> Result<(ProcessOutput, TokenObservation), CommandGateError> {
    let started = Instant::now();
    let mut child = NativeProcess::spawn(context, identity, &pipes, cancel)?;
    let readers = pipes.read(context.max_output_bytes());
    let (mut timed_out, mut cancelled) = (false, false);
    let exit_code = loop {
        if let Some(code) = child
            .poll()
            .map_err(|source| native_error("poll LPAC process", source))?
        {
            break code;
        }
        if cancel.is_cancelled() || started.elapsed() >= context.timeout() {
            cancelled = cancel.is_cancelled();
            timed_out = !cancelled;
            child
                .close()
                .map_err(|source| native_error("terminate LPAC process tree", source))?;
            break child
                .poll()
                .map_err(|source| native_error("read LPAC exit status", source))?
                .ok_or_else(|| {
                    native_error(
                        "join LPAC process",
                        io::Error::other("terminated process still active"),
                    )
                })?;
        }
        tokio::select! {
            () = cancel.cancelled() => {}
            () = tokio::time::sleep(PROCESS_POLL.min(context.timeout().saturating_sub(started.elapsed()))) => {}
        }
    };
    child
        .close()
        .map_err(|source| native_error("close LPAC process tree/profile", source))?;
    let (stdout, stderr) = readers.finish().await?;
    Ok((
        ProcessOutput {
            exit_code: Some(exit_code),
            signal: None,
            timed_out,
            cancelled,
            truncated: stdout.omitted_bytes > 0 || stderr.omitted_bytes > 0,
            omitted_bytes: stdout.omitted_bytes.saturating_add(stderr.omitted_bytes),
            stdout: stdout.text,
            stderr: stderr.text,
            duration: started.elapsed(),
        },
        child.token.clone(),
    ))
}
