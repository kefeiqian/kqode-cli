use std::{
    collections::BTreeMap,
    ffi::OsString,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::{process::Command, sync::Semaphore};

use crate::cancellation::CancellationToken;

use super::{
    EnvironmentPolicy, ProcessError, WorkspacePolicy,
    output::{CapturedOutput, read_bounded},
    platform::{self, ProcessTree},
};

/// One noninteractive foreground process request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProcessRequest {
    /// Executable path or name resolved through the constructed child environment.
    pub program: OsString,
    /// Arguments passed directly to the executable without shell interpretation.
    pub arguments: Vec<OsString>,
    /// Absolute or workspace-relative working directory.
    pub cwd: Option<PathBuf>,
    /// Non-secret environment overrides applied after inherited safe variables.
    pub environment: BTreeMap<String, String>,
    /// Maximum wall-clock duration after the process starts.
    pub timeout: Duration,
    /// Maximum bytes retained independently for stdout and stderr.
    pub max_output_bytes: usize,
}

/// Bounded process result. Nonzero exit codes are ordinary results.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProcessOutput {
    /// Platform exit code, when one is available.
    pub exit_code: Option<i32>,
    /// Unix termination signal, when applicable.
    pub signal: Option<i32>,
    /// Whether the supervisor terminated the process after its deadline.
    pub timed_out: bool,
    /// Whether the supervisor terminated the process after explicit cancellation.
    pub cancelled: bool,
    /// Bounded, lossy UTF-8 stdout retaining the beginning and end.
    pub stdout: String,
    /// Bounded, lossy UTF-8 stderr retaining the beginning and end.
    pub stderr: String,
    /// Whether bytes were omitted from either output stream.
    pub truncated: bool,
    /// Total bytes omitted across stdout and stderr.
    pub omitted_bytes: usize,
    /// Wall-clock duration from spawn through output collection.
    pub duration: Duration,
}

/// Runs bounded child processes within one canonical workspace.
#[derive(Clone, Debug)]
pub struct ProcessSupervisor {
    workspace: WorkspacePolicy,
    environment: EnvironmentPolicy,
    permits: Arc<Semaphore>,
}

impl ProcessSupervisor {
    /// Creates a per-session process supervisor.
    ///
    /// # Errors
    ///
    /// Returns an error when the workspace is invalid or the concurrency limit is zero.
    pub fn new(
        workspace: impl Into<PathBuf>,
        max_concurrent_processes: usize,
    ) -> Result<Self, ProcessError> {
        if max_concurrent_processes == 0 {
            return Err(ProcessError::InvalidLimit("max_concurrent_processes"));
        }
        Ok(Self {
            workspace: WorkspacePolicy::new(workspace.into())?,
            environment: EnvironmentPolicy::default(),
            permits: Arc::new(Semaphore::new(max_concurrent_processes)),
        })
    }

    /// Executes a request with bounded output, timeout, and cancellation.
    ///
    /// # Errors
    ///
    /// Returns an infrastructure error when validation, spawning, process ownership,
    /// stream collection, or waiting fails.
    pub async fn run(
        &self,
        request: ProcessRequest,
        cancellation: CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        if request.timeout.is_zero() {
            return Err(ProcessError::InvalidLimit("timeout"));
        }
        if request.max_output_bytes == 0 {
            return Err(ProcessError::InvalidLimit("max_output_bytes"));
        }
        let permit = tokio::select! {
            permit = Arc::clone(&self.permits).acquire_owned() => {
                permit.map_err(|_| ProcessError::Supervision(std::io::Error::other(
                    "process supervisor is closed",
                )))?
            }
            () = cancellation.cancelled() => {
                return Ok(cancelled_output(Duration::ZERO));
            }
        };
        if cancellation.is_cancelled() {
            return Ok(cancelled_output(Duration::ZERO));
        }

        let cwd = self.workspace.resolve_cwd(request.cwd.as_deref())?;
        let mut command = Command::new(&request.program);
        command
            .args(&request.arguments)
            .current_dir(cwd)
            .env_clear()
            .envs(self.environment.build(&request.environment));
        platform::configure(&mut command);

        let started_at = Instant::now();
        let mut child = command.spawn().map_err(ProcessError::Spawn)?;
        let process_tree = match ProcessTree::attach(&child) {
            Ok(process_tree) => process_tree,
            Err(error) => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                return Err(ProcessError::Supervision(error));
            }
        };
        let stdout = child
            .stdout
            .take()
            .ok_or(ProcessError::MissingPipe("stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or(ProcessError::MissingPipe("stderr"))?;
        let stdout_task = tokio::spawn(read_bounded(stdout, request.max_output_bytes));
        let stderr_task = tokio::spawn(read_bounded(stderr, request.max_output_bytes));

        let mut timed_out = false;
        let mut cancelled = false;
        let status = tokio::select! {
            status = child.wait() => status.map_err(ProcessError::Supervision)?,
            () = tokio::time::sleep(request.timeout) => {
                timed_out = true;
                terminate_and_wait(&process_tree, &mut child).await?
            }
            () = cancellation.cancelled() => {
                cancelled = true;
                terminate_and_wait(&process_tree, &mut child).await?
            }
        };
        process_tree
            .terminate()
            .map_err(ProcessError::Supervision)?;
        let stdout = join_output(stdout_task.await, "stdout")?;
        let stderr = join_output(stderr_task.await, "stderr")?;
        drop(permit);

        Ok(ProcessOutput {
            exit_code: status.code(),
            signal: exit_signal(&status),
            timed_out,
            cancelled,
            truncated: stdout.omitted_bytes > 0 || stderr.omitted_bytes > 0,
            omitted_bytes: stdout.omitted_bytes.saturating_add(stderr.omitted_bytes),
            stdout: stdout.text,
            stderr: stderr.text,
            duration: started_at.elapsed(),
        })
    }
}

fn join_output(
    result: Result<Result<CapturedOutput, ProcessError>, tokio::task::JoinError>,
    stream: &'static str,
) -> Result<CapturedOutput, ProcessError> {
    result.map_err(|error| {
        ProcessError::Supervision(std::io::Error::other(format!(
            "{stream} reader task failed: {error}"
        )))
    })?
}

async fn terminate_and_wait(
    process_tree: &ProcessTree,
    child: &mut tokio::process::Child,
) -> Result<std::process::ExitStatus, ProcessError> {
    process_tree
        .terminate()
        .map_err(ProcessError::Supervision)?;
    child.wait().await.map_err(ProcessError::Supervision)
}

fn cancelled_output(duration: Duration) -> ProcessOutput {
    ProcessOutput {
        exit_code: None,
        signal: None,
        timed_out: false,
        cancelled: true,
        stdout: String::new(),
        stderr: String::new(),
        truncated: false,
        omitted_bytes: 0,
        duration,
    }
}

#[cfg(unix)]
fn exit_signal(status: &std::process::ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;

    status.signal()
}

#[cfg(not(unix))]
fn exit_signal(_status: &std::process::ExitStatus) -> Option<i32> {
    None
}
