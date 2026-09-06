use serde_json::Value;

use crate::tool::ToolCall;

use super::{RepeatAction, TurnBudget};

#[derive(Clone, Debug, Default)]
pub(super) struct RepetitionTracker {
    previous_signature: Option<String>,
    consecutive_count: u32,
}

impl RepetitionTracker {
    pub(super) fn preview_batch(
        &self,
        calls: &[ToolCall],
        budget: TurnBudget,
    ) -> (Self, RepeatAction) {
        let mut next = self.clone();
        let mut strongest = RepeatAction::Continue;
        for call in calls {
            let signature = signature(call);
            if next.previous_signature.as_deref() == Some(&signature) {
                next.consecutive_count += 1;
            } else {
                next.previous_signature = Some(signature);
                next.consecutive_count = 1;
            }
            strongest = strongest.max(budget.repeat_action(next.consecutive_count));
        }
        (next, strongest)
    }
}

fn signature(call: &ToolCall) -> String {
    let arguments = call
        .argument_error
        .as_ref()
        .map(|error| error.raw.clone())
        .unwrap_or_else(|| canonical_json(&call.arguments));
    format!("{}\n{arguments}", call.canonical_name)
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(values) => {
            let items = values.iter().map(canonical_json).collect::<Vec<_>>();
            format!("[{}]", items.join(","))
        }
        Value::Object(values) => {
            let mut entries = values.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            let items = entries
                .into_iter()
                .map(|(key, value)| {
                    format!(
                        "{}:{}",
                        canonical_json(&Value::String(key.clone())),
                        canonical_json(value)
                    )
                })
                .collect::<Vec<_>>();
            format!("{{{}}}", items.join(","))
        }
        primitive => primitive.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::runtime::TurnBudgetOverrides;

    #[test]
    fn treats_object_key_order_as_the_same_signature() {
        let tracker = RepetitionTracker::default();
        let (tracker, _) =
            tracker.preview_batch(&[call(json!({"a": 1, "b": 2}))], TurnBudget::default());
        let (_, action) = tracker.preview_batch(
            &[call(json!({"b": 2, "a": 1}))],
            TurnBudget::with_overrides(TurnBudgetOverrides {
                repeat_warning_at: Some(2),
                ..Default::default()
            }),
        );
        assert_eq!(action, RepeatAction::Warn);
    }

    fn call(arguments: Value) -> ToolCall {
        ToolCall {
            id: "call".to_owned(),
            canonical_name: "fetch_web_url".to_owned(),
            arguments,
            argument_error: None,
        }
    }
}
