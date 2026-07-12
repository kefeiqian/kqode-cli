//! Non-interactive one-shot: `kqode --prompt <text> [--json]`.
//!
//! Resolves the active provider from the store (fail-closed when none is
//! configured), drives a single completion via [`run_oneshot`] with KQode's
//! as-shipped system prompt, and returns the text — or a one-line JSON object —
//! for the CLI to print. Shares the provider/one-shot machinery with the eval
//! runner; only the system prompt and output formatting differ.

use crate::chat::system_prompt::system_message;
use crate::chat::{Completion, run_oneshot};
use crate::connect::resolve_submit_config;
use crate::provider::{ProviderError, Sampling};
use crate::store::Store;

/// Why a headless one-shot could not produce a completion.
pub enum HeadlessError {
    /// No provider/model/key is configured; the caller must fail closed.
    NoProvider,
    /// The provider request failed.
    Provider(ProviderError),
}

/// Runs one headless completion and returns the string to print: the plain
/// assistant text, or a one-line JSON object when `json` is set.
///
/// # Errors
///
/// Returns [`HeadlessError::NoProvider`] when no provider is configured, or
/// [`HeadlessError::Provider`] when the request fails.
pub fn run_prompt(store: &Store, prompt: &str, json: bool) -> Result<String, HeadlessError> {
    let config = resolve_submit_config(store).ok_or(HeadlessError::NoProvider)?;
    let model = config.model.clone();
    // As-shipped persona + environment block; git/memory are omitted in the
    // headless scripting path (no interactive session or async status fetch).
    let system = system_message(&model, None, None);
    let completion = run_oneshot(config, system, prompt, Sampling::default())
        .map_err(HeadlessError::Provider)?;
    Ok(if json {
        format_json(&completion, &model)
    } else {
        completion.text
    })
}

/// Serializes a completion as a one-line JSON object. Structurally cannot leak
/// the provider key — it is never passed one.
fn format_json(completion: &Completion, model: &str) -> String {
    let usage = completion.usage.map(
        |usage| serde_json::json!({ "inputTokens": usage.input, "outputTokens": usage.output }),
    );
    serde_json::json!({
        "text": completion.text,
        "finishReason": completion.finish_reason,
        "model": model,
        "truncated": completion.truncated,
        "usage": usage,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::Usage;

    fn completion() -> Completion {
        Completion {
            text: "4".to_owned(),
            finish_reason: Some("stop".to_owned()),
            usage: Some(Usage {
                input: 8,
                output: 1,
            }),
            truncated: false,
        }
    }

    #[test]
    fn json_carries_text_finish_model_and_usage() {
        let json = format_json(&completion(), "kimi-k2.7-code");
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["text"], "4");
        assert_eq!(value["finishReason"], "stop");
        assert_eq!(value["model"], "kimi-k2.7-code");
        assert_eq!(value["usage"]["inputTokens"], 8);
        assert_eq!(value["usage"]["outputTokens"], 1);
    }

    #[test]
    fn json_exposes_only_expected_fields() {
        // The output object must never gain an api_key (or any other) field.
        let json = format_json(&completion(), "model");
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let mut keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            ["finishReason", "model", "text", "truncated", "usage"]
        );
    }
}
