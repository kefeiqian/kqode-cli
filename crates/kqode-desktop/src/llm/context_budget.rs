//! Per-model context budget for auto-compaction decisions.
//!
//! The [`budget`] is the model's context window minus a reserved slice for the
//! model's own response, so callers compare their estimated request size against
//! the returned value directly (the reserved-output subtraction lives here only,
//! so no downstream unit re-derives it). [`threshold`] is the token count at
//! which compaction should trigger.
//!
//! Reading the window from the provider `/models` catalog is deferred: `/models`
//! is fetched only at connect and is not threaded to turn time, so a configured
//! constant is used for now (see the plan's Deferred to Follow-Up Work).

/// Configured context window (tokens) for the Kimi models, matching the value
/// pinned by the streaming-chat plan. Used as the fallback for any model id.
const KIMI_CONTEXT_WINDOW_TOKENS: usize = 256_000;

/// Tokens reserved out of the window for the model's own response, so a request
/// sized at [`budget`] still leaves room to answer.
const RESERVED_OUTPUT_TOKENS: usize = 32_000;

/// Fraction of the budget at which auto-compaction triggers. Conservative,
/// because the request size is only estimated (no exact tokenizer wired up).
const COMPACTION_TRIGGER_RATIO: f64 = 0.72;

/// Usable context budget (tokens) for `model`: the configured context window
/// minus [`RESERVED_OUTPUT_TOKENS`]. Unknown models fall back to the Kimi window.
#[must_use]
pub fn budget(model: &str) -> usize {
    context_window(model).saturating_sub(RESERVED_OUTPUT_TOKENS)
}

/// Token count at which compaction should trigger for `model` — a fixed fraction
/// of [`budget`].
#[must_use]
pub fn threshold(model: &str) -> usize {
    ((budget(model) as f64) * COMPACTION_TRIGGER_RATIO) as usize
}

/// Configured context window (tokens) for a model id. All currently supported
/// models are Kimi, so this returns the Kimi window; the parameter is kept so a
/// future per-model table (or a `/models`-sourced window) drops in here.
fn context_window(_model: &str) -> usize {
    KIMI_CONTEXT_WINDOW_TOKENS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_is_window_minus_reserved_output() {
        assert_eq!(
            budget("kimi-k2"),
            KIMI_CONTEXT_WINDOW_TOKENS - RESERVED_OUTPUT_TOKENS
        );
        assert!(budget("kimi-k2") < KIMI_CONTEXT_WINDOW_TOKENS);
    }

    #[test]
    fn unknown_model_falls_back_to_configured_budget() {
        assert_eq!(budget("some-unknown-model"), budget("kimi-k2"));
        assert!(budget("some-unknown-model") > 0);
    }

    #[test]
    fn threshold_is_positive_and_below_budget() {
        let budget = budget("kimi-k2");
        let threshold = threshold("kimi-k2");
        assert!(threshold > 0);
        assert!(threshold < budget);
    }
}
