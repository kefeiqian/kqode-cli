//! The KQode base system prompt plus a bounded environment/metadata fragment.
//!
//! Kept intentionally small and chat-only for this slice; tool-use guidance is
//! added by later milestones.

use std::env;

use time::OffsetDateTime;

use crate::provider::ChatMessage;

/// Builds the system message for a turn: the base KQode prompt plus a bounded
/// environment/metadata block (OS, working directory, current UTC time, active
/// model, and — when supplied — the workspace git status label).
///
/// `git` is injected by the caller (fetched off the coordinator loop, e.g. via
/// [`crate::git::read_status_label`]) so this stays pure and free of
/// blocking/async I/O. Pass `None` when the workspace is not a git repository or
/// the label could not be read; the git line is then omitted. No session id is
/// included in the prompt.
#[must_use]
pub fn system_message(model: &str, git: Option<&str>, memory: Option<&str>) -> ChatMessage {
    let cwd = env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "unknown".to_owned());

    ChatMessage::system(build_content(
        model,
        &cwd,
        env::consts::OS,
        &utc_now_label(),
        git,
        memory,
    ))
}

/// Pure assembly of the environment block, so metadata contents are unit-tested
/// without touching the environment or spawning `git`.
fn build_content(
    model: &str,
    cwd: &str,
    os: &str,
    now: &str,
    git: Option<&str>,
    memory: Option<&str>,
) -> String {
    let mut content = format!(
        "You are KQode, a terminal coding assistant. Answer concisely and \
         helpfully in plain text suitable for a terminal.\n\n\
         Environment:\n\
         - OS: {os}\n\
         - Working directory: {cwd}\n\
         - Current time: {now}\n\
         - Active model: {model}"
    );
    if let Some(git) = git {
        content.push_str("\n- Git: ");
        content.push_str(git);
    }
    if let Some(memory) = memory {
        content.push_str("\n\n");
        content.push_str(memory);
    }
    content
}

/// Formats the current UTC instant as `YYYY-MM-DD HH:MM:SS UTC` from component
/// accessors, avoiding the `time` crate's `formatting` feature (not enabled).
fn utc_now_label() -> String {
    let now = OffsetDateTime::now_utc();
    format!(
        "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02} UTC",
        year = now.year(),
        month = u8::from(now.month()),
        day = now.day(),
        hour = now.hour(),
        minute = now.minute(),
        second = now.second(),
    )
}

#[cfg(test)]
mod tests;
