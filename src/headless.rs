//! Non-interactive one-shot: `kqode --prompt <text> [--json]`.
//!
//! Resolves the active provider from the store (fail-closed when none is
//! configured), drives a single completion via [`run_oneshot`] with KQode's
//! as-shipped system prompt, and returns the text — or a one-line JSON object —
//! for the CLI to print.

use crate::chat::system_prompt::system_message;
use crate::chat::{Completion, run_oneshot};
use crate::connect::resolve_submit_config;
use crate::provider::ChatMessage;
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
    let context = build_headless_context(store, &model);
    let completion = run_oneshot(
        config,
        context.system,
        context.instructions,
        prompt,
        Sampling::default(),
    )
    .map_err(HeadlessError::Provider)?;
    Ok(if json {
        format_json(&completion, &model)
    } else {
        completion.text
    })
}

struct HeadlessContext {
    system: ChatMessage,
    instructions: Option<ChatMessage>,
}

fn build_headless_context(store: &Store, model: &str) -> HeadlessContext {
    let git = crate::git::status_label();
    let memory = load_memory_block(store);
    let instructions = std::env::current_dir()
        .ok()
        .and_then(|cwd| crate::chat::agents_md::discover(&cwd))
        .map(|body| {
            ChatMessage::user(crate::chat::agents_md::wrap_instructions(
                &body,
                &crate::debug_log::new_session_id(),
            ))
        });
    HeadlessContext {
        system: system_message(model, git.as_deref(), memory.as_deref()),
        instructions,
    }
}

fn load_memory_block(store: &Store) -> Option<String> {
    let cwd = std::env::current_dir().ok()?;
    let service = crate::memory::MemoryService::new(store.clone(), &cwd, None).ok()?;
    service.load_prompt_block()
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
    use crate::memory::{MemoryScope, MemoryType};
    use crate::provider::Usage;

    struct CwdGuard {
        previous: std::path::PathBuf,
    }

    impl Drop for CwdGuard {
        fn drop(&mut self) {
            std::env::set_current_dir(&self.previous).expect("restore cwd");
        }
    }

    fn switch_to(path: &std::path::Path) -> CwdGuard {
        let previous = std::env::current_dir().expect("current dir");
        std::env::set_current_dir(path).expect("switch cwd");
        CwdGuard { previous }
    }

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

    #[test]
    fn headless_context_loads_memory_and_agents_instructions() {
        let dir = tempfile::tempdir().expect("temp dir");
        let workspace = dir.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(workspace.join("AGENTS.md"), "Use the repo convention.").unwrap();
        let _cwd = switch_to(&workspace);
        let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();
        let service = crate::memory::MemoryService::new(store.clone(), &workspace, None).unwrap();
        service
            .add(
                MemoryScope::User,
                None,
                MemoryType::User,
                "Preferred style".to_owned(),
                "Prefer concise answers.".to_owned(),
            )
            .unwrap();

        let context = build_headless_context(&store, "model-id");

        assert!(context.system.content.contains("Prefer concise answers."));
        let instructions = context.instructions.expect("AGENTS instructions");
        assert!(instructions.content.contains("Use the repo convention."));
    }
}
