//! Headless single-shot completion.
//!
//! [`run_oneshot`] drives one non-interactive turn — resolve nothing, no
//! coordinator, no compaction, no history — and returns the accumulated
//! [`Completion`]. It is the shared foundation for the `--prompt` headless CLI
//! and the eval runner, which supply their own system message (the as-shipped
//! prompt or [`crate::chat::system_prompt::eval_system_message`]) and sampling.
//!
//! The per-event fold lives in [`Accumulator`] (a pure state update tested on
//! canned events); the async driver applies it incrementally so a runaway
//! generation is bounded by [`MAX_OUTPUT_BYTES`] as it streams rather than after
//! buffering the whole response.

use std::pin::pin;

use futures_util::StreamExt;

use crate::chat::request::{CompactionState, assemble};
use crate::config::KimiConfig;
use crate::provider::{
    ChatMessage, KimiProvider, ProviderError, ProviderRequest, Sampling, StreamEvent, Usage,
};

/// Upper bound on accumulated completion text. Model output is untrusted and an
/// eval run drives hundreds of tasks sequentially, so a runaway or adversarial
/// generation must not exhaust host memory; accumulation stops at this cap and
/// records the truncation.
const MAX_OUTPUT_BYTES: usize = 1 << 20; // 1 MiB

/// The result of one non-interactive completion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Completion {
    /// The full assistant text (possibly truncated at [`MAX_OUTPUT_BYTES`]).
    pub text: String,
    /// Provider-reported finish reason, when present.
    pub finish_reason: Option<String>,
    /// Token usage, when the provider reported it.
    pub usage: Option<Usage>,
    /// `true` when accumulation hit [`MAX_OUTPUT_BYTES`] and stopped early.
    pub truncated: bool,
}

/// Runs one completion on a current-thread `tokio` runtime and returns the
/// accumulated [`Completion`].
///
/// `system` is the caller-supplied system message (as-shipped or eval-mode);
/// `sampling` pins temperature/seed for reproducible eval runs. Token usage is
/// always requested so `--json` and eval metrics can report it.
///
/// # Errors
///
/// Returns a [`ProviderError`] when the runtime cannot start, the provider
/// client cannot be built, or the request fails to send or stream.
pub fn run_oneshot(
    config: KimiConfig,
    system: ChatMessage,
    prompt: &str,
    sampling: Sampling,
) -> Result<Completion, ProviderError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| ProviderError::Network(format!("runtime error: {error}")))?;
    runtime.block_on(stream_oneshot(config, system, prompt, sampling))
}

/// Assembles the single-shot message list, opens the stream, and folds every
/// event into a [`Completion`].
async fn stream_oneshot(
    config: KimiConfig,
    system: ChatMessage,
    prompt: &str,
    sampling: Sampling,
) -> Result<Completion, ProviderError> {
    let model = config.model.clone();
    let messages = assemble(system, None, &[], &CompactionState::default(), prompt);
    let provider = KimiProvider::new(config)?;
    let request = ProviderRequest {
        model,
        messages,
        sampling,
        include_usage: true,
    };

    let stream = provider.stream(request).await?;
    let mut stream = pin!(stream);
    let mut accumulator = Accumulator::default();
    while let Some(event) = stream.next().await {
        accumulator.push(event?);
    }
    Ok(accumulator.finish())
}

/// Pure per-event fold shared by the async driver and the tests. Accumulates
/// delta text up to [`MAX_OUTPUT_BYTES`] and captures the finish reason and
/// usage from the (possibly separate) terminal chunks.
#[derive(Default)]
struct Accumulator {
    text: String,
    finish_reason: Option<String>,
    usage: Option<Usage>,
    truncated: bool,
}

impl Accumulator {
    fn push(&mut self, event: StreamEvent) {
        match event {
            StreamEvent::Delta(chunk) => {
                if self.truncated {
                    return;
                }
                let remaining = MAX_OUTPUT_BYTES - self.text.len();
                if chunk.len() > remaining {
                    self.text.push_str(truncate_on_boundary(&chunk, remaining));
                    self.truncated = true;
                } else {
                    self.text.push_str(&chunk);
                }
            }
            StreamEvent::Done {
                finish_reason,
                usage,
            } => {
                if finish_reason.is_some() {
                    self.finish_reason = finish_reason;
                }
                if usage.is_some() {
                    self.usage = usage;
                }
            }
        }
    }

    fn finish(self) -> Completion {
        Completion {
            text: self.text,
            finish_reason: self.finish_reason,
            usage: self.usage,
            truncated: self.truncated,
        }
    }
}

/// Returns the longest prefix of `s` that is at most `max` bytes and ends on a
/// UTF-8 char boundary, so truncation never splits a code point.
fn truncate_on_boundary(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

#[cfg(test)]
fn accumulate(events: impl IntoIterator<Item = StreamEvent>) -> Completion {
    let mut accumulator = Accumulator::default();
    for event in events {
        accumulator.push(event);
    }
    accumulator.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_deltas_finish_reason_and_usage() {
        let completion = accumulate([
            StreamEvent::Delta("Hello, ".to_owned()),
            StreamEvent::Delta("world".to_owned()),
            StreamEvent::Done {
                finish_reason: Some("stop".to_owned()),
                usage: None,
            },
            StreamEvent::Done {
                finish_reason: None,
                usage: Some(Usage {
                    input: 5,
                    output: 2,
                }),
            },
        ]);
        assert_eq!(completion.text, "Hello, world");
        assert_eq!(completion.finish_reason.as_deref(), Some("stop"));
        assert_eq!(
            completion.usage,
            Some(Usage {
                input: 5,
                output: 2
            })
        );
        assert!(!completion.truncated);
    }

    #[test]
    fn no_deltas_yields_empty_text_with_finish_reason() {
        let completion = accumulate([StreamEvent::Done {
            finish_reason: Some("stop".to_owned()),
            usage: None,
        }]);
        assert_eq!(completion.text, "");
        assert_eq!(completion.finish_reason.as_deref(), Some("stop"));
        assert!(!completion.truncated);
    }

    #[test]
    fn output_beyond_cap_is_truncated_on_a_char_boundary() {
        let big = "a".repeat(MAX_OUTPUT_BYTES + 10);
        let completion = accumulate([
            StreamEvent::Delta(big),
            // A multi-byte glyph after the cap must be dropped whole, never split.
            StreamEvent::Delta("é".to_owned()),
            StreamEvent::Done {
                finish_reason: Some("stop".to_owned()),
                usage: None,
            },
        ]);
        assert!(completion.truncated);
        assert_eq!(completion.text.len(), MAX_OUTPUT_BYTES);
        assert!(completion.text.is_char_boundary(completion.text.len()));
    }

    #[test]
    fn truncate_on_boundary_never_splits_a_code_point() {
        // "é" is two bytes; a byte cap of 1 must yield an empty prefix.
        assert_eq!(truncate_on_boundary("é", 1), "");
        assert_eq!(truncate_on_boundary("ab", 5), "ab");
    }
}
