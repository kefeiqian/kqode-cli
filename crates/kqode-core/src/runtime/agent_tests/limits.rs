use serde_json::json;

use crate::{
    cancellation::CancellationToken,
    runtime::{
        AgentRuntime, ModelMessage, RuntimeNoticeKind, StopReason, ToolChoice, TurnBudgetOverrides,
        TurnStatus,
    },
    tool::{ToolCallState, ToolExposure},
};

use super::support::{
    FakeProvider, HandlerBehavior, call, empty_step, enabled_config, snapshot, text_step,
    tool_step, turn_request,
};

#[tokio::test]
async fn repeated_calls_warn_then_finalize_without_dispatching_the_fifth() {
    let mut steps = (1..=5)
        .map(|index| {
            tool_step(vec![call(
                &format!("call-{index}"),
                "echo",
                json!({"value": "same"}),
            )])
        })
        .collect::<Vec<_>>();
    steps.push(text_step("final"));
    let provider = FakeProvider::new(steps);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(Default::default()),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Completed);
    assert_eq!(report.ledger[4].state, ToolCallState::Skipped);
    let requests = provider.requests();
    assert!(requests.iter().any(|request| {
        request.messages.iter().any(|message| {
            matches!(
                message,
                ModelMessage::RuntimeNotice {
                    kind: RuntimeNoticeKind::RepetitionWarning,
                    ..
                }
            )
        })
    }));
    assert_eq!(requests[5].tool_choice, ToolChoice::None);
}

#[tokio::test]
async fn oversized_round_is_rejected_before_dispatch() {
    let provider = FakeProvider::new(vec![tool_step(vec![
        call("call-1", "echo", json!({"value": "a"})),
        call("call-2", "echo", json!({"value": "b"})),
    ])]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(TurnBudgetOverrides {
            max_calls_per_round: Some(1),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::BudgetExceeded);
    assert_eq!(report.budget.tool_rounds, 0);
    assert!(
        report
            .ledger
            .iter()
            .all(|entry| entry.state == ToolCallState::Skipped)
    );
}

#[tokio::test]
async fn round_budget_enters_text_only_finalization() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "a"}))]),
        text_step("finished"),
    ]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(TurnBudgetOverrides {
            max_tool_rounds: Some(1),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Completed);
    assert_eq!(provider.requests()[1].tool_choice, ToolChoice::None);
}

#[tokio::test]
async fn total_call_budget_enters_text_only_after_the_limit() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "a"}))]),
        tool_step(vec![call("call-2", "echo", json!({"value": "b"}))]),
        text_step("finished"),
    ]);
    let runtime = AgentRuntime::new(
        provider.clone(),
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(TurnBudgetOverrides {
            max_total_tool_calls: Some(2),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Completed);
    assert_eq!(report.budget.total_tool_calls, 2);
    assert_eq!(provider.requests()[2].tool_choice, ToolChoice::None);
}

#[tokio::test]
async fn empty_post_tool_response_gets_one_text_only_nudge() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "a"}))]),
        empty_step(),
        text_step("after nudge"),
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
    assert_eq!(provider.requests()[2].tool_choice, ToolChoice::None);
}

#[tokio::test]
async fn tool_call_during_text_only_finalization_is_a_protocol_failure() {
    let provider = FakeProvider::new(vec![
        tool_step(vec![call("call-1", "echo", json!({"value": "a"}))]),
        tool_step(vec![call("call-2", "echo", json!({"value": "b"}))]),
    ]);
    let runtime = AgentRuntime::new(
        provider,
        snapshot(&[("echo", ToolExposure::Direct, HandlerBehavior::Echo)]),
        enabled_config(TurnBudgetOverrides {
            max_tool_rounds: Some(1),
            ..Default::default()
        }),
    );

    let report = runtime
        .run(turn_request(), CancellationToken::default())
        .await;

    assert_eq!(report.outcome.status, TurnStatus::Failed);
    assert!(matches!(
        report.outcome.stop_reason,
        StopReason::Protocol(_)
    ));
    assert_eq!(report.ledger.len(), 1);
}
