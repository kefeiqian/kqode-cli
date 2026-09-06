use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use serde_json::json;

use super::{
    MalformedToolArguments, RegistryError, ToolCall, ToolDefinition, ToolEffects, ToolErrorKind,
    ToolExecutionMode, ToolExposure, ToolHandler, ToolHandlerFuture, ToolInvocation, ToolLimits,
    ToolRegistry, ToolResult, ToolSource, builtins::definitions,
};
use crate::cancellation::CancellationToken;

#[test]
fn snapshots_remain_stable_after_registry_changes() {
    let mut registry = ToolRegistry::builtins();
    let snapshot = registry.snapshot();
    let (mut definition, handler) = definitions().remove(0);
    definition.canonical_name = "another_tool".to_owned();
    registry.register(definition, handler).unwrap();

    assert_eq!(snapshot.generation(), 3);
    assert_eq!(snapshot.definitions().len(), 3);
    assert_eq!(registry.snapshot().generation(), 4);
}

#[test]
fn rejects_duplicate_canonical_names() {
    let mut registry = ToolRegistry::builtins();
    let (definition, handler) = definitions().remove(0);
    assert_eq!(
        registry.register(definition, handler),
        Err(RegistryError::DuplicateCanonicalName(
            "run_command".to_owned()
        ))
    );
}

#[test]
fn rejects_noncanonical_names_before_registration() {
    let mut registry = ToolRegistry::new();
    let (mut definition, handler) = definitions().remove(0);
    definition.canonical_name = " run_command ".to_owned();

    assert_eq!(
        registry.register(definition, handler),
        Err(RegistryError::InvalidCanonicalName(
            " run_command ".to_owned()
        ))
    );
    assert!(registry.definitions().is_empty());
}

#[test]
fn exposes_only_canonical_direct_tools() {
    let definitions = ToolRegistry::builtins().definitions();
    assert_eq!(
        definitions
            .iter()
            .map(|tool| tool.canonical_name.as_str())
            .collect::<Vec<_>>(),
        ["run_command", "fetch_web_url", "ask_user"]
    );
}

#[test]
fn returns_typed_argument_errors() {
    let snapshot = ToolRegistry::builtins().snapshot();
    let invalid = ToolCall {
        id: "call-1".to_owned(),
        canonical_name: "fetch_web_url".to_owned(),
        arguments: json!({}),
        argument_error: None,
    };
    let malformed = ToolCall {
        arguments: serde_json::Value::Null,
        argument_error: Some(MalformedToolArguments {
            raw: "{bad-json}".to_owned(),
            message: "expected property name".to_owned(),
        }),
        ..invalid.clone()
    };

    assert_eq!(
        snapshot.validate_call(&invalid).unwrap_err().kind,
        ToolErrorKind::InvalidArguments
    );
    assert_eq!(
        snapshot.validate_call(&malformed).unwrap_err().kind,
        ToolErrorKind::InvalidArguments
    );
}

#[test]
fn returns_typed_unknown_tool_errors() {
    let snapshot = ToolRegistry::builtins().snapshot();
    let call = ToolCall {
        id: "call-1".to_owned(),
        canonical_name: "missing".to_owned(),
        arguments: json!({}),
        argument_error: None,
    };

    assert_eq!(
        snapshot.validate_call(&call).unwrap_err().kind,
        ToolErrorKind::UnknownTool
    );
}

#[tokio::test]
async fn canonical_placeholder_handler_fails_closed() {
    let invocation = ToolInvocation {
        arguments: json!({"url": "https://example.com"}),
        ..invocation("fetch_web_url")
    };
    let result = ToolRegistry::builtins()
        .snapshot()
        .invoke(&invocation, &CancellationToken::default())
        .await;

    assert!(!result.success);
    assert_eq!(result.call_id, "call-1");
    assert_eq!(result.canonical_name, "fetch_web_url");
    assert_eq!(result.error_kind, Some(ToolErrorKind::Unavailable));
}

#[tokio::test]
async fn hidden_tools_do_not_reach_handlers() {
    let calls = Arc::new(AtomicUsize::new(0));
    let handler = Arc::new(CountingHandler(Arc::clone(&calls)));
    let mut registry = ToolRegistry::new();
    registry.register(hidden_definition(), handler).unwrap();

    let result = registry
        .snapshot()
        .invoke(&invocation("hidden_tool"), &CancellationToken::default())
        .await;

    assert_eq!(result.error_kind, Some(ToolErrorKind::HiddenTool));
    assert_eq!(calls.load(Ordering::Relaxed), 0);
}

fn hidden_definition() -> ToolDefinition {
    ToolDefinition {
        canonical_name: "hidden_tool".to_owned(),
        display_name: "Hidden tool".to_owned(),
        description: "Hidden test tool".to_owned(),
        input_schema: json!({"type": "object"}),
        effects: ToolEffects::default(),
        exposure: ToolExposure::Hidden,
        execution_mode: ToolExecutionMode::Sequential,
        limits: ToolLimits::default(),
        source: ToolSource::Builtin,
    }
}

fn invocation(canonical_name: &str) -> ToolInvocation {
    ToolInvocation {
        call_id: "call-1".to_owned(),
        canonical_name: canonical_name.to_owned(),
        arguments: json!({}),
        session_id: "session-1".to_owned(),
        turn_id: "turn-1".to_owned(),
        step_id: "step-1".to_owned(),
    }
}

struct CountingHandler(Arc<AtomicUsize>);

impl ToolHandler for CountingHandler {
    fn invoke<'a>(
        &'a self,
        invocation: &'a ToolInvocation,
        _cancellation: &'a CancellationToken,
    ) -> ToolHandlerFuture<'a> {
        self.0.fetch_add(1, Ordering::Relaxed);
        Box::pin(async move {
            ToolResult::success(
                &ToolCall {
                    id: invocation.call_id.clone(),
                    canonical_name: invocation.canonical_name.clone(),
                    arguments: invocation.arguments.clone(),
                    argument_error: None,
                },
                "called",
                json!({}),
            )
        })
    }
}
