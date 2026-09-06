use serde_json::json;

use crate::{
    cancellation::CancellationToken,
    runtime::{AgentRuntime, ModelMessage, RuntimeConfig, StopReason, ToolChoice, TurnStatus},
    tool::{MalformedToolArguments, ToolCallState, ToolErrorKind, ToolExposure},
};

use super::support::{
    FakeProvider, HandlerBehavior, call, enabled_config, snapshot, text_step, tool_step,
    turn_request,
};

#[tokio::test]
async fn completes_tool_result_round_trip() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "hello"}))]),
        text_step("done"),
    ]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Completed);
    assert_eq!(report.outcome.final_message.as_deref(), Some("done"));
    assert_eq!(report.ledger[0].state, ToolCallState::Succeeded);
    let requests = provider.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].tool_choice, ToolChoice::Auto);
    assert!(matches!(
        requests[1].messages.last(),
        Some(ModelMessage::ToolResults { results }) if results[0].success
    ));
}

#[tokio::test]
async fn returns_correlated_recoverable_tool_errors() {
    let mut malformed = call("malformed", "echo", json!(null));
    malformed.argument_error = Some(MalformedToolArguments {
        raw: "{bad-json}".to_owned(),
        message: "expected property name".to_owned(),
    });
    let cases = [
        (
            snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
            call("unknown", "missing", json!({"value": "x"})),
            ToolErrorKind::UnknownTool,
        ),
        (
            snapshot(&[("echo", ToolExposure::Hidden, HandlerBehavior::Echo)]),
            call("hidden", "echo", json!({"value": "x"})),
            ToolErrorKind::HiddenTool,
        ),
        (
            snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
            malformed,
            ToolErrorKind::InvalidArguments,
        ),
        (
            snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
            call("invalid", "echo", json!({})),
            ToolErrorKind::InvalidArguments,
        ),
    ];

    for (tools, call, expected_kind) in cases {
        let provider = FakeProvider::new(vec![tool_step(vec![call]), text_step("corrected")]);
        let runtime =
            AgentRuntime::new(provider.clone(), tools, enabled_config(Default::default()));
        let report = runtime
            .run(turn_request(), CancellationToken::default())
            .await;

        assert_eq!(report.outcome.status, TurnStatus::Completed);
        assert_eq!(report.ledger[0].state, ToolCallState::Failed);
        let requests = provider.requests();
        assert!(matches!(
            requests[1].messages.last(),
            Some(ModelMessage::ToolResults { results })
                if results[0].error_kind == Some(expected_kind)
        ));
    }
}

#[tokio::test]
async fn rejects_duplicate_call_ids_before_dispatch() {
    let duplicate = call("same", "echo", json!({"value": "x"}));
    let provider = FakeProvider::new(vec![tool_step(vec![duplicate.clone(), duplicate])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Failed);
    assert!(matches!(
        report.outcome.stop_reason,
        StopReason::Protocol(_)
    ));
    assert!(report.ledger.is_empty());
}

#[tokio::test]
async fn cancellation_settles_accepted_calls() {
    let provider = FakeProvider::new(vec![tool_step(vec![
        call("cancel-1", "cancel", json!({"value": "x"})),
        call("echo-1", "echo", json!({"value": "y"})),
    ])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[
            ("cancel", ToolExposure::Direct, HandlerBehavior::Cancel),
            ("echo", ToolExposure::Direct, HandlerBehavior::Echo),
        ]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Cancelled);
    assert_eq!(report.ledger[0].state, ToolCallState::Cancelled);
    assert_eq!(report.ledger[1].state, ToolCallState::Skipped);
}

#[tokio::test]
async fn rejects_tool_calls_when_execution_is_disabled() {
    let provider = FakeProvider::new(vec![tool_step(vec![call(
        "call-1",
        "echo",
        json!({"value": "x"}),
    )])]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        RuntimeConfig::default(),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Failed);
    let requests = provider.requests();
    assert!(requests[0].tools.is_empty());
    assert_eq!(requests[0].tool_choice, ToolChoice::None);
    assert!(matches!(
        report.outcome.stop_reason,
        StopReason::Protocol(_)
    ));
}

#[tokio::test]
async fn normalizes_invalid_handler_result_correlation() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "mismatch", json!({"value": "x"}))]),
        text_step("recovered"),
    ]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("mismatch", ToolExposure::Direct, HandlerBehavior::Mismatch)]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Completed);
    assert_eq!(report.ledger[0].state, ToolCallState::Failed);
    assert!(matches!(
        provider.requests()[1].messages.last(),
        Some(ModelMessage::ToolResults { results })
            if results[0].call_id == "call-1"
                && results[0].error_kind == Some(ToolErrorKind::ExecutionFailed)
    ));
}
