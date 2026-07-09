use super::*;

#[test]
fn rpc_method_maps_clear_and_cancel_methods() {
    assert_eq!(
        RpcMethod::from_method("kqode.conversation.clear"),
        Some(RpcMethod::ConversationClear)
    );
    assert_eq!(
        RpcMethod::from_method("kqode.turn.cancel"),
        Some(RpcMethod::TurnCancel)
    );
    assert_eq!(RpcMethod::from_method("kqode.unknown"), None);
}

#[test]
fn rpc_method_maps_theme_methods() {
    assert_eq!(
        RpcMethod::from_method("kqode.theme.get"),
        Some(RpcMethod::ThemeGet)
    );
    assert_eq!(
        RpcMethod::from_method("kqode.theme.set"),
        Some(RpcMethod::ThemeSet)
    );
}

#[test]
fn queue_lifecycle_params_use_camel_case() {
    let enqueued = EnqueuedParams {
        turn_id: "turn-1".to_string(),
        seq: 7,
        state: TURN_STATE_PENDING,
    };
    assert_eq!(
        serde_json::to_value(&enqueued).unwrap(),
        serde_json::json!({ "turnId": "turn-1", "seq": 7, "state": "pending" })
    );
    let enqueued_round_trip: EnqueuedParams =
        serde_json::from_value(serde_json::to_value(enqueued).unwrap()).unwrap();
    assert_eq!(enqueued_round_trip.turn_id, "turn-1");
    assert_eq!(enqueued_round_trip.seq, 7);
    assert_eq!(enqueued_round_trip.state, TURN_STATE_PENDING);

    let activated = ActivatedParams {
        turn_id: "turn-1".to_string(),
    };
    assert_eq!(
        serde_json::to_value(&activated).unwrap(),
        serde_json::json!({ "turnId": "turn-1" })
    );
    let activated_round_trip: ActivatedParams =
        serde_json::from_value(serde_json::to_value(activated).unwrap()).unwrap();
    assert_eq!(activated_round_trip.turn_id, "turn-1");
}

#[test]
fn settled_params_use_camel_case_for_nested_result() {
    let settled = SettledParams {
        turn_id: "turn-1".to_string(),
        result: TurnResult {
            kind: SETTLED_KIND_ERROR,
            text: None,
            finish_reason: Some("stop".to_string()),
            error_kind: Some("provider".to_string()),
            message: Some("failed".to_string()),
        },
    };
    assert_eq!(
        serde_json::to_value(&settled).unwrap(),
        serde_json::json!({
            "turnId": "turn-1",
            "result": {
                "kind": "error",
                "text": null,
                "finishReason": "stop",
                "errorKind": "provider",
                "message": "failed"
            }
        })
    );
    let round_trip: SettledParams =
        serde_json::from_value(serde_json::to_value(settled).unwrap()).unwrap();
    assert_eq!(round_trip.turn_id, "turn-1");
    assert_eq!(round_trip.result.kind, SETTLED_KIND_ERROR);
    assert_eq!(round_trip.result.finish_reason.as_deref(), Some("stop"));
    assert_eq!(round_trip.result.error_kind.as_deref(), Some("provider"));
}

#[test]
fn clear_and_cancel_contracts_use_camel_case() {
    let clear_params: ConversationClearParams = serde_json::from_str("{}").unwrap();
    assert_eq!(
        serde_json::to_value(clear_params).unwrap(),
        serde_json::json!({})
    );

    let clear_result = ConversationClearResult { ok: true };
    assert_eq!(
        serde_json::to_value(&clear_result).unwrap(),
        serde_json::json!({ "ok": true })
    );
    let clear_round_trip: ConversationClearResult =
        serde_json::from_value(serde_json::to_value(clear_result).unwrap()).unwrap();
    assert!(clear_round_trip.ok);

    let cancel_params = TurnCancelParams {
        turn_id: "turn-1".to_string(),
    };
    assert_eq!(
        serde_json::to_value(&cancel_params).unwrap(),
        serde_json::json!({ "turnId": "turn-1" })
    );
    let cancel_round_trip: TurnCancelParams =
        serde_json::from_value(serde_json::to_value(cancel_params).unwrap()).unwrap();
    assert_eq!(cancel_round_trip.turn_id, "turn-1");

    let cancel_result = TurnCancelResult { ok: true };
    assert_eq!(
        serde_json::to_value(&cancel_result).unwrap(),
        serde_json::json!({ "ok": true })
    );
    let cancel_round_trip: TurnCancelResult =
        serde_json::from_value(serde_json::to_value(cancel_result).unwrap()).unwrap();
    assert!(cancel_round_trip.ok);
}
