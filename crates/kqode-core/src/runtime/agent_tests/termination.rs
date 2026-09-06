use serde_json::json;
use std::time::Duration;

use crate::{
    cancellation::CancellationToken,
    runtime::{AgentRuntime, StopReason, TurnBudgetOverrides, TurnStatus},
    tool::{ToolCallState, ToolExposure},
};

use super::support::{
    FakeProvider, HandlerBehavior, PendingProvider, call, empty_step, enabled_config, snapshot,
    tool_step, turn_request,
};

#[tokio::test]
async fn a_second_empty_response_after_tools_is_a_protocol_failure() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "a"}))]),
        empty_step(),
        empty_step(),
    ]);
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
}

#[tokio::test]
async fn model_request_budget_stops_before_an_unbudgeted_continuation() {
    let provider = FakeProvider::new(vec![tool_step(vec![call(
        "call-1",
        "echo",
        json!({"value": "a"}),
    )])]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(TurnBudgetOverrides {
            max_model_requests: Some(1),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert_eq!(provider.requests().len(), 1);
    assert_eq!(report.ledger[0].state, ToolCallState::Succeeded);
}

#[tokio::test]
async fn should_continue_false_stops_without_another_model_request() {
    let provider = FakeProvider::new(vec![tool_step(vec![call(
        "call-1",
        "stop",
        json!({"value": "a"}),
    )])]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("stop", ToolExposure::Direct, HandlerBehavior::Stop)]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Blocked);
    assert!(matches!(
        report.outcome.stop_reason,
        StopReason::ToolRequestedStop(_)
    ));
    assert_eq!(report.ledger[0].state, ToolCallState::Succeeded);
    assert_eq!(provider.requests().len(), 1);
}

#[tokio::test]
async fn elapsed_budget_skips_later_calls_in_the_same_batch() {
    let provider = FakeProvider::new(vec![tool_step(vec![
        call("call-1", "delay", json!({"value": "a"})),
        call("call-2", "must-not-run", json!({"value": "b"})),
    ])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[
            (
                "delay",
                ToolExposure::Direct,
                HandlerBehavior::DelayPastBudget,
            ),
            ("must-not-run", ToolExposure::Direct, HandlerBehavior::Panic),
        ]),
        enabled_config(TurnBudgetOverrides {
            max_elapsed: Some(Duration::from_secs(1)),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert_eq!(report.ledger[0].state, ToolCallState::Succeeded);
    assert_eq!(report.ledger[1].state, ToolCallState::Skipped);
}

#[tokio::test]
async fn elapsed_budget_takes_priority_over_a_tool_stop_request() {
    let provider = FakeProvider::new(vec![tool_step(vec![
        call("call-1", "delay-stop", json!({"value": "a"})),
        call("call-2", "must-not-run", json!({"value": "b"})),
    ])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[
            (
                "delay-stop",
                ToolExposure::Direct,
                HandlerBehavior::DelayPastBudgetAndStop,
            ),
            ("must-not-run", ToolExposure::Direct, HandlerBehavior::Panic),
        ]),
        enabled_config(TurnBudgetOverrides {
            max_elapsed: Some(Duration::from_secs(1)),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert_eq!(report.ledger[0].state, ToolCallState::Succeeded);
    assert_eq!(report.ledger[1].state, ToolCallState::Skipped);
}

#[tokio::test]
async fn elapsed_budget_interrupts_a_pending_provider_request() {
    let runtime = AgentRuntime::new(
        std::sync::Arc::new(PendingProvider),
        snapshot(&[]),
        enabled_config(TurnBudgetOverrides {
            max_elapsed: Some(Duration::from_millis(10)),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert!(report.ledger.is_empty());
}

#[tokio::test]
async fn elapsed_budget_interrupts_a_pending_tool_and_terminalizes_the_batch() {
    let provider = FakeProvider::new(vec![tool_step(vec![
        call("call-1", "never", json!({"value": "a"})),
        call("call-2", "must-not-run", json!({"value": "b"})),
    ])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[
            ("never", ToolExposure::Direct, HandlerBehavior::Never),
            ("must-not-run", ToolExposure::Direct, HandlerBehavior::Panic),
        ]),
        enabled_config(TurnBudgetOverrides {
            max_elapsed: Some(Duration::from_millis(10)),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert_eq!(report.ledger[0].state, ToolCallState::Failed);
    assert_eq!(report.ledger[1].state, ToolCallState::Skipped);
}
