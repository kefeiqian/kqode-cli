use serde_json::json;

use super::{LedgerErrorKind, ToolCall, ToolCallLedger, ToolCallState};

fn call(id: &str) -> ToolCall {
    ToolCall {
        id: id.to_owned(),
        canonical_name: "fetch_web_url".to_owned(),
        arguments: json!({}),
        argument_error: None,
    }
}

#[test]
fn rejects_a_duplicate_batch_without_partial_registration() {
    let mut ledger = ToolCallLedger::default();
    let error = ledger
        .receive_batch(&[call("call-1"), call("call-1")])
        .unwrap_err();
    assert_eq!(error.kind, LedgerErrorKind::DuplicateCallId);
    assert!(ledger.get("call-1").is_none());
}

#[test]
fn rejects_cross_round_duplicates() {
    let mut ledger = ToolCallLedger::default();
    ledger.receive_batch(&[call("call-1")]).unwrap();
    assert_eq!(
        ledger.receive_batch(&[call("call-1")]).unwrap_err().kind,
        LedgerErrorKind::DuplicateCallId
    );
}

#[test]
fn rejects_name_changes_and_duplicate_settlement() {
    let mut ledger = ToolCallLedger::default();
    ledger.receive_batch(&[call("call-1")]).unwrap();
    assert_eq!(
        ledger
            .transition("call-1", "ask_user", ToolCallState::Validated)
            .unwrap_err()
            .kind,
        LedgerErrorKind::NameMismatch
    );
    ledger
        .transition("call-1", "fetch_web_url", ToolCallState::Validated)
        .unwrap();
    ledger
        .transition("call-1", "fetch_web_url", ToolCallState::Running)
        .unwrap();
    ledger
        .transition("call-1", "fetch_web_url", ToolCallState::Succeeded)
        .unwrap();
    assert_eq!(
        ledger
            .transition("call-1", "fetch_web_url", ToolCallState::Failed)
            .unwrap_err()
            .kind,
        LedgerErrorKind::InvalidTransition
    );
    assert!(ledger.all_terminal());
}
