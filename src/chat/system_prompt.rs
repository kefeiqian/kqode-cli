//! The KQode base system prompt, assembled from ordered, metadata-carrying
//! [`fragment`]s.
//!
//! [`system_message`] collects the active chat-only sections ([`sections`]),
//! orders them most-stable-first (identity → tone → safety → memory → the
//! volatile environment block), renders them into one system message, and emits
//! a trace record of the fragment plan. Tool-use guidance and additional
//! sections (tools, sandbox, MCP, subagents, output styles) are added by later
//! milestones.

use std::env;

use time::OffsetDateTime;

use crate::provider::ChatMessage;

mod fragment;
mod sections;

/// Builds the system message for a turn: the ordered active sections plus a
/// bounded environment/metadata block (OS, working directory, current UTC time,
/// active model, and — when supplied — the workspace git status label).
///
/// `git` and `memory` are injected by the caller (fetched off the coordinator
/// loop, e.g. via [`crate::git::read_status_label`]) so this stays pure and free
/// of blocking/async I/O. Pass `None` for `git` when the workspace is not a git
/// repository or the label could not be read; the git line is then omitted. Pass
/// `None` for `memory` when no safe memory context fits. No session id is
/// included in the prompt.
#[must_use]
pub fn system_message(model: &str, git: Option<&str>, memory: Option<&str>) -> ChatMessage {
    let cwd = env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "unknown".to_owned());

    let mut fragments = vec![sections::identity(), sections::tone(), sections::safety()];
    fragments.extend(sections::memory(memory));
    fragments.push(sections::environment(
        model,
        &cwd,
        env::consts::OS,
        &utc_now_label(),
        git,
    ));

    let ordered = fragment::order_fragments(fragments);
    trace_fragment_plan(&ordered);
    ChatMessage::system(fragment::render(&ordered))
}

/// Emits one `trace`-level record per assembled fragment (source, volatility,
/// persistence, priority, advisory token estimate) so a prompt's composition is
/// visible in traces without logging any fragment bodies.
fn trace_fragment_plan(ordered: &[fragment::Fragment]) {
    for fragment in ordered {
        tracing::trace!(
            source = fragment.source.as_str(),
            volatility = ?fragment.volatility,
            persistence = ?fragment.persistence,
            priority = fragment.priority,
            est_tokens = fragment.est_tokens.0,
            "system prompt fragment"
        );
    }
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
