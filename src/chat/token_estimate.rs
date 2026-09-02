//! Heuristic token estimation for assembled requests and history rounds.
//!
//! No exact tokenizer is wired up, so this uses a chars-per-token divisor plus a
//! small fixed per-message overhead. It leans conservative so the compaction
//! trigger fires with headroom against the real limit. Provider-usage-based
//! counts are a later refinement.

use crate::chat::request::HistoryRound;
use crate::provider::ChatMessage;

/// Rough characters per token for the heuristic.
const CHARS_PER_TOKEN: usize = 4;
/// Fixed per-message overhead (role tags, delimiters) added to each message.
const PER_MESSAGE_OVERHEAD_TOKENS: usize = 4;

/// Estimates the token size of an assembled message list.
#[must_use]
pub fn estimate_tokens(messages: &[ChatMessage]) -> usize {
    messages.iter().map(estimate_message).sum()
}

/// Estimates the token size of one message.
#[must_use]
pub fn estimate_message(message: &ChatMessage) -> usize {
    message.content.chars().count() / CHARS_PER_TOKEN + PER_MESSAGE_OVERHEAD_TOKENS
}

/// Estimates the tokens a completed round contributes verbatim (its user and
/// assistant messages).
#[must_use]
pub fn estimate_round(round: &HistoryRound) -> usize {
    (round.user.chars().count() + round.assistant.chars().count()) / CHARS_PER_TOKEN
        + 2 * PER_MESSAGE_OVERHEAD_TOKENS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_scales_with_content_length() {
        let short = [ChatMessage::user("hi")];
        let long = [ChatMessage::user("x".repeat(400))];
        assert!(estimate_tokens(&long) > estimate_tokens(&short));
    }

    #[test]
    fn empty_message_list_is_zero() {
        assert_eq!(estimate_tokens(&[]), 0);
    }

    #[test]
    fn round_estimate_counts_both_messages() {
        let round = HistoryRound::new(0, "x".repeat(40), "y".repeat(40));
        // ~ (40 + 40) / 4 + overhead.
        assert!(estimate_round(&round) >= 20);
    }
}
