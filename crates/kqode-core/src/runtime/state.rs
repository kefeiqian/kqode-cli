use std::time::Instant;

use crate::tool::ToolCallLedger;

use super::repetition::RepetitionTracker;
use super::{BudgetTracker, ModelMessage, TurnRequest};

pub(super) struct RunState {
    pub messages: Vec<ModelMessage>,
    pub ledger: ToolCallLedger,
    pub budget: BudgetTracker,
    pub repetition: RepetitionTracker,
    pub started_at: Instant,
    pub after_tool: bool,
    pub empty_nudge_used: bool,
    pub text_only: bool,
}

impl RunState {
    pub(super) fn new(request: &TurnRequest) -> Self {
        Self {
            messages: vec![ModelMessage::User {
                content: request.content.clone(),
            }],
            ledger: ToolCallLedger::default(),
            budget: BudgetTracker::default(),
            repetition: RepetitionTracker::default(),
            started_at: Instant::now(),
            after_tool: false,
            empty_nudge_used: false,
            text_only: false,
        }
    }
}
