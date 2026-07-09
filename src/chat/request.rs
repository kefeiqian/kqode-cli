//! Pure assembly of the ordered provider message list for one turn.
//!
//! This is the single assembly path shared by the token estimate, the live
//! send, and resume, so those three cannot diverge (see the auto-compaction
//! plan). It reads a snapshot of the prior completed rounds plus the current
//! [`CompactionState`] and produces the `system → (summary?) → verbatim tail →
//! new prompt` message list. It never touches the durable transcript.

use crate::provider::ChatMessage;

/// One prior completed round contributing verbatim history.
///
/// Cancelled, errored, and needs-configuration rounds are excluded upstream, so
/// only rounds with both a user prompt and a settled assistant reply appear here.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HistoryRound {
    /// Monotonic transcript sequence, compared against the compaction boundary.
    pub seq: u64,
    /// The user's prompt for this round.
    pub user: String,
    /// The assistant's completed reply for this round.
    pub assistant: String,
}

impl HistoryRound {
    /// Builds a history round from its sequence and the two message texts.
    #[must_use]
    pub fn new(seq: u64, user: impl Into<String>, assistant: impl Into<String>) -> Self {
        Self {
            seq,
            user: user.into(),
            assistant: assistant.into(),
        }
    }
}

/// Backend-owned compaction state for one session.
///
/// When `summary` is set, rounds with `seq <= covered_through_seq` are
/// represented by the summary and dropped from the verbatim tail; rounds with a
/// greater `seq` stay verbatim. The default (empty) state means no compaction has
/// happened and the full history is sent. Compaction lands in later units; this
/// type is threaded now so the single assembly path never grows a new call site.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CompactionState {
    /// The latest anchored summary, when the session has been compacted.
    pub summary: Option<String>,
    /// Highest round `seq` the summary covers, inclusive. Meaningful only when
    /// `summary` is set.
    pub covered_through_seq: u64,
}

impl CompactionState {
    /// Returns whether a round is represented by the summary rather than kept
    /// verbatim. Always false while no summary is set.
    #[must_use]
    fn covers(&self, seq: u64) -> bool {
        self.summary.is_some() && seq <= self.covered_through_seq
    }
}

/// Assembles the ordered message list: system prompt, optional conversation
/// summary, the verbatim tail of prior completed rounds, then the new prompt.
///
/// `history` must be ordered by ascending `seq`. Rounds covered by an active
/// summary are skipped so they are never sent twice.
#[must_use]
pub fn assemble(
    system: ChatMessage,
    history: &[HistoryRound],
    compaction: &CompactionState,
    new_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages = Vec::with_capacity(history.len() * 2 + 2);
    messages.push(system);
    if let Some(summary) = compaction.summary.as_deref() {
        messages.push(summary_message(summary));
    }
    for round in history {
        if compaction.covers(round.seq) {
            continue;
        }
        messages.push(ChatMessage::user(round.user.clone()));
        messages.push(ChatMessage::assistant(round.assistant.clone()));
    }
    messages.push(ChatMessage::user(new_prompt.to_owned()));
    messages
}

/// Wraps the running conversation summary as a system-role context message. The
/// exact role/wording is intentionally centralized here so every assembly site
/// shares it.
fn summary_message(summary: &str) -> ChatMessage {
    ChatMessage::system(format!(
        "Summary of the earlier conversation (older turns were compacted to fit the context window):\n\n{summary}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::Role;

    fn rounds() -> Vec<HistoryRound> {
        vec![
            HistoryRound::new(0, "first ask", "first answer"),
            HistoryRound::new(1, "second ask", "second answer"),
        ]
    }

    #[test]
    fn full_history_without_summary() {
        let messages = assemble(
            ChatMessage::system("SYSTEM"),
            &rounds(),
            &CompactionState::default(),
            "third ask",
        );

        let shape: Vec<(Role, &str)> = messages
            .iter()
            .map(|message| (message.role, message.content.as_str()))
            .collect();
        assert_eq!(shape[0].0, Role::System);
        assert_eq!(
            shape[1..],
            [
                (Role::User, "first ask"),
                (Role::Assistant, "first answer"),
                (Role::User, "second ask"),
                (Role::Assistant, "second answer"),
                (Role::User, "third ask"),
            ]
        );
    }

    #[test]
    fn no_prior_rounds_is_system_plus_new_prompt() {
        let messages = assemble(
            ChatMessage::system("SYSTEM"),
            &[],
            &CompactionState::default(),
            "only ask",
        );
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, Role::System);
        assert_eq!(messages[1].role, Role::User);
        assert_eq!(messages[1].content, "only ask");
    }

    #[test]
    fn summary_replaces_covered_rounds_and_keeps_the_tail() {
        let compaction = CompactionState {
            summary: Some("earlier: user set up X".to_owned()),
            covered_through_seq: 0,
        };

        let messages = assemble(
            ChatMessage::system("SYSTEM"),
            &rounds(),
            &compaction,
            "third ask",
        );

        // system, summary, then only seq > 0 verbatim, then the new prompt.
        assert_eq!(messages[0].role, Role::System);
        assert_eq!(messages[1].role, Role::System);
        assert!(messages[1].content.contains("earlier: user set up X"));
        assert_eq!(messages[2].role, Role::User);
        assert_eq!(messages[2].content, "second ask");
        assert_eq!(messages[3].role, Role::Assistant);
        assert_eq!(messages[3].content, "second answer");
        assert_eq!(messages.last().unwrap().content, "third ask");
        assert!(
            !messages.iter().any(|m| m.content == "first ask"),
            "round 0 is covered by the summary and must not be sent verbatim"
        );
    }
}
