use std::{
    env,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use wait_timeout::ChildExt;

use crate::inference::{ChatCancellationToken, ChatError};

const COPILOT_COMMAND: &str = "copilot";
const WAIT_POLL_INTERVAL: Duration = Duration::from_millis(50);

pub(super) fn run(
    arguments: &[String],
    timeout: Duration,
    cancellation: Option<&ChatCancellationToken>,
) -> Result<String, ChatError> {
    if cancellation.is_some_and(ChatCancellationToken::is_cancelled) {
        return Err(ChatError::Cancelled);
    }
    let command = resolve();
    let mut child = Command::new(&command)
        .args(arguments)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| start_error(&command, error))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ChatError::Request("capture Copilot CLI stdout".to_owned()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ChatError::Request("capture Copilot CLI stderr".to_owned()))?;
    let stdout_reader = thread::spawn(move || read_pipe(stdout));
    let stderr_reader = thread::spawn(move || read_pipe(stderr));

    let started_at = Instant::now();
    let status = loop {
        if cancellation.is_some_and(ChatCancellationToken::is_cancelled) {
            stop(&mut child, "cancelled")?;
            join_reader(stdout_reader, "stdout")?;
            join_reader(stderr_reader, "stderr")?;
            return Err(ChatError::Cancelled);
        }

        let elapsed = started_at.elapsed();
        if elapsed >= timeout {
            stop(&mut child, "timed out")?;
            join_reader(stdout_reader, "stdout")?;
            join_reader(stderr_reader, "stderr")?;
            return Err(ChatError::Request(format!(
                "GitHub Copilot CLI timed out after {} seconds",
                timeout.as_secs()
            )));
        }

        let wait = WAIT_POLL_INTERVAL.min(timeout - elapsed);
        if let Some(status) = child
            .wait_timeout(wait)
            .map_err(|error| ChatError::Request(format!("wait for Copilot CLI: {error}")))?
        {
            if cancellation.is_some_and(ChatCancellationToken::is_cancelled) {
                join_reader(stdout_reader, "stdout")?;
                join_reader(stderr_reader, "stderr")?;
                return Err(ChatError::Cancelled);
            }
            break status;
        }
    };
    let stdout = join_reader(stdout_reader, "stdout")?;
    let stderr = join_reader(stderr_reader, "stderr")?;
    if cancellation.is_some_and(ChatCancellationToken::is_cancelled) {
        return Err(ChatError::Cancelled);
    }
    if !status.success() {
        let detail = String::from_utf8_lossy(&stderr);
        return Err(ChatError::Request(format!(
            "GitHub Copilot CLI exited with {status}: {}",
            detail.trim()
        )));
    }

    String::from_utf8(stdout)
        .map_err(|error| ChatError::Response(format!("decode Copilot CLI output: {error}")))
}

fn stop(child: &mut std::process::Child, reason: &str) -> Result<(), ChatError> {
    if let Err(kill_error) = child.kill() {
        return match child.try_wait() {
            Ok(Some(_)) => child
                .wait()
                .map(|_| ())
                .map_err(|error| ChatError::Request(format!("reap Copilot CLI: {error}"))),
            Ok(None) => Err(ChatError::Request(format!(
                "stop {reason} Copilot CLI: {kill_error}"
            ))),
            Err(wait_error) => Err(ChatError::Request(format!(
                "stop {reason} Copilot CLI: {kill_error}; inspect process: {wait_error}"
            ))),
        };
    }
    child
        .wait()
        .map_err(|error| ChatError::Request(format!("reap Copilot CLI: {error}")))?;
    Ok(())
}

fn read_pipe(mut pipe: impl Read) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    pipe.read_to_end(&mut output)?;
    Ok(output)
}

fn join_reader(
    reader: thread::JoinHandle<std::io::Result<Vec<u8>>>,
    name: &str,
) -> Result<Vec<u8>, ChatError> {
    reader
        .join()
        .map_err(|_| ChatError::Request(format!("join Copilot CLI {name} reader")))?
        .map_err(|error| ChatError::Request(format!("read Copilot CLI {name}: {error}")))
}

fn start_error(command: &Path, error: std::io::Error) -> ChatError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ChatError::Configuration(
            "GitHub Copilot CLI is not installed or is not available on PATH".to_owned(),
        )
    } else {
        ChatError::Request(format!(
            "start GitHub Copilot CLI {}: {error}",
            command.display()
        ))
    }
}

fn resolve() -> PathBuf {
    #[cfg(windows)]
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let winget_alias = PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("WinGet")
            .join("Links")
            .join("copilot.exe");
        if winget_alias.is_file() {
            return winget_alias;
        }
    }

    PathBuf::from(COPILOT_COMMAND)
}
