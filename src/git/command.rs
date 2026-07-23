use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

/// Poll interval while waiting for a bounded status child.
const COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(10);

pub(super) fn run_stdout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    run_stdout_in(program, args, timeout, None)
}

fn run_stdout_in(
    program: &str,
    args: &[&str],
    timeout: Duration,
    cwd: Option<&Path>,
) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args.iter().copied())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let mut child = command.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut output = String::new();
        stdout.read_to_string(&mut output).ok()?;
        Some(output)
    });

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let _ = reader.join();
                    return None;
                }
                return reader.join().ok()?;
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return None;
            }
            Ok(None) => thread::sleep(COMMAND_POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return None;
            }
        }
    }
}

#[cfg(test)]
mod tests;
