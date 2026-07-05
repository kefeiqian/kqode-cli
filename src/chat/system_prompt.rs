//! The KQode base system prompt plus a bounded environment-context fragment.
//!
//! Kept intentionally small and chat-only for this slice; tool-use guidance is
//! added by later milestones.

use std::env;

use crate::provider::ChatMessage;

/// Builds the system message for a turn, embedding the active model and a small
/// environment fragment (working directory, OS).
#[must_use]
pub fn system_message(model: &str) -> ChatMessage {
    let cwd = env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "unknown".to_owned());

    let content = format!(
        "You are KQode, a terminal coding assistant. Answer concisely and \
         helpfully in plain text suitable for a terminal.\n\n\
         Environment:\n\
         - OS: {os}\n\
         - Working directory: {cwd}\n\
         - Active model: {model}",
        os = env::consts::OS,
    );

    ChatMessage::system(content)
}

#[cfg(test)]
mod tests;
