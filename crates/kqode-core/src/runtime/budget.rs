use std::{fmt, time::Duration};

use serde::{Deserialize, Serialize};

/// Hard limits applied to one runtime turn.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TurnBudget {
    max_tool_rounds: u32,
    max_calls_per_round: u32,
    max_total_tool_calls: u32,
    max_model_requests: u32,
    repeat_warning_at: u32,
    repeat_finalize_at: u32,
    max_elapsed: Option<Duration>,
}

/// Optional caller limits that may only tighten the runtime defaults.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct TurnBudgetOverrides {
    pub max_tool_rounds: Option<u32>,
    pub max_calls_per_round: Option<u32>,
    pub max_total_tool_calls: Option<u32>,
    pub max_model_requests: Option<u32>,
    pub repeat_warning_at: Option<u32>,
    pub repeat_finalize_at: Option<u32>,
    pub max_elapsed: Option<Duration>,
}

impl Default for TurnBudget {
    fn default() -> Self {
        Self {
            max_tool_rounds: 8,
            max_calls_per_round: 8,
            max_total_tool_calls: 32,
            max_model_requests: 10,
            repeat_warning_at: 3,
            repeat_finalize_at: 5,
            max_elapsed: None,
        }
    }
}

impl TurnBudget {
    /// Applies caller limits without allowing them to expand runtime maxima.
    pub fn with_overrides(overrides: TurnBudgetOverrides) -> Self {
        let defaults = Self::default();
        let repeat_finalize_at = overrides
            .repeat_finalize_at
            .unwrap_or(defaults.repeat_finalize_at)
            .min(defaults.repeat_finalize_at);
        Self {
            max_tool_rounds: Self::tightened(overrides.max_tool_rounds, defaults.max_tool_rounds),
            max_calls_per_round: Self::tightened(
                overrides.max_calls_per_round,
                defaults.max_calls_per_round,
            ),
            max_total_tool_calls: Self::tightened(
                overrides.max_total_tool_calls,
                defaults.max_total_tool_calls,
            ),
            max_model_requests: Self::tightened(
                overrides.max_model_requests,
                defaults.max_model_requests,
            ),
            repeat_warning_at: Self::tightened(
                overrides.repeat_warning_at,
                defaults.repeat_warning_at,
            )
            .min(repeat_finalize_at),
            repeat_finalize_at,
            max_elapsed: overrides.max_elapsed,
        }
    }

    /// Returns the effective tool-round limit.
    pub fn max_tool_rounds(self) -> u32 {
        self.max_tool_rounds
    }

    /// Returns the effective per-round call limit.
    pub fn max_calls_per_round(self) -> u32 {
        self.max_calls_per_round
    }

    /// Returns the effective total call limit.
    pub fn max_total_tool_calls(self) -> u32 {
        self.max_total_tool_calls
    }

    /// Returns the effective model-request limit.
    pub fn max_model_requests(self) -> u32 {
        self.max_model_requests
    }

    /// Returns the repeat count that emits a warning.
    pub fn repeat_warning_at(self) -> u32 {
        self.repeat_warning_at
    }

    /// Returns the repeat count that forces finalization.
    pub fn repeat_finalize_at(self) -> u32 {
        self.repeat_finalize_at
    }

    /// Returns the optional effective elapsed-time limit.
    pub fn max_elapsed(self) -> Option<Duration> {
        self.max_elapsed
    }

    /// Returns the intervention required for a consecutive repeated call.
    pub fn repeat_action(self, consecutive_count: u32) -> RepeatAction {
        if consecutive_count >= self.repeat_finalize_at {
            RepeatAction::Finalize
        } else if consecutive_count >= self.repeat_warning_at {
            RepeatAction::Warn
        } else {
            RepeatAction::Continue
        }
    }

    fn tightened(requested: Option<u32>, maximum: u32) -> u32 {
        requested.unwrap_or(maximum).min(maximum)
    }

    /// Checks an elapsed duration against the optional wall-clock limit.
    ///
    /// # Errors
    ///
    /// Returns an elapsed-time budget error when `elapsed` exceeds the limit.
    pub fn check_elapsed(self, elapsed: Duration) -> Result<(), BudgetError> {
        if self.max_elapsed.is_some_and(|maximum| elapsed > maximum) {
            Err(BudgetError::new(
                BudgetErrorKind::ElapsedTime,
                "elapsed time budget exceeded",
            ))
        } else {
            Ok(())
        }
    }

    pub(crate) fn remaining_elapsed(
        self,
        elapsed: Duration,
    ) -> Result<Option<Duration>, BudgetError> {
        match self.max_elapsed {
            Some(maximum) if elapsed > maximum => Err(BudgetError::new(
                BudgetErrorKind::ElapsedTime,
                "elapsed time budget exceeded",
            )),
            Some(maximum) => Ok(Some(maximum.saturating_sub(elapsed))),
            None => Ok(None),
        }
    }
}

/// Intervention selected by the repeated-call budget.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum RepeatAction {
    Continue,
    Warn,
    Finalize,
}

/// Mutable counters checked before model requests and tool dispatch.
#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct BudgetTracker {
    pub model_requests: u32,
    pub tool_rounds: u32,
    pub total_tool_calls: u32,
}

impl BudgetTracker {
    /// Reserves one model request before it starts.
    pub fn reserve_model_request(&mut self, budget: TurnBudget) -> Result<(), BudgetError> {
        if self.model_requests >= budget.max_model_requests {
            return Err(BudgetError::new(
                BudgetErrorKind::ModelRequests,
                "model request budget exceeded",
            ));
        }
        self.model_requests += 1;
        Ok(())
    }

    /// Atomically reserves one complete tool-call batch before dispatch.
    pub fn reserve_tool_batch(
        &mut self,
        budget: TurnBudget,
        call_count: usize,
    ) -> Result<(), BudgetError> {
        let call_count = u32::try_from(call_count).map_err(|_| {
            BudgetError::new(BudgetErrorKind::CallsPerRound, "tool batch is too large")
        })?;
        if call_count > budget.max_calls_per_round {
            return Err(BudgetError::new(
                BudgetErrorKind::CallsPerRound,
                "tool calls per round budget exceeded",
            ));
        }
        if self.tool_rounds >= budget.max_tool_rounds {
            return Err(BudgetError::new(
                BudgetErrorKind::ToolRounds,
                "tool round budget exceeded",
            ));
        }
        if self.total_tool_calls.saturating_add(call_count) > budget.max_total_tool_calls {
            return Err(BudgetError::new(
                BudgetErrorKind::TotalToolCalls,
                "total tool call budget exceeded",
            ));
        }
        self.tool_rounds += 1;
        self.total_tool_calls += call_count;
        Ok(())
    }
}

/// Budget that prevented further work.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BudgetErrorKind {
    ModelRequests,
    ToolRounds,
    CallsPerRound,
    TotalToolCalls,
    ElapsedTime,
    RepeatedCall,
}

/// Machine-readable budget failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BudgetError {
    pub kind: BudgetErrorKind,
    pub message: String,
}

impl BudgetError {
    fn new(kind: BudgetErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for BudgetError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for BudgetError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_v1_2_default_limits() {
        let budget = TurnBudget::default();
        assert_eq!(budget.max_tool_rounds(), 8);
        assert_eq!(budget.max_calls_per_round(), 8);
        assert_eq!(budget.max_total_tool_calls(), 32);
        assert_eq!(budget.max_model_requests(), 10);
        assert_eq!(budget.repeat_warning_at(), 3);
        assert_eq!(budget.repeat_finalize_at(), 5);
    }

    #[test]
    fn rejected_batches_do_not_consume_budget() {
        let mut tracker = BudgetTracker::default();
        let error = tracker
            .reserve_tool_batch(TurnBudget::default(), 9)
            .unwrap_err();
        assert_eq!(error.kind, BudgetErrorKind::CallsPerRound);
        assert_eq!(tracker, BudgetTracker::default());
    }

    #[test]
    fn stages_repeated_call_intervention() {
        let budget = TurnBudget::default();
        assert_eq!(budget.repeat_action(2), RepeatAction::Continue);
        assert_eq!(budget.repeat_action(3), RepeatAction::Warn);
        assert_eq!(budget.repeat_action(5), RepeatAction::Finalize);
    }

    #[test]
    fn enforces_optional_elapsed_time() {
        let budget = TurnBudget::with_overrides(TurnBudgetOverrides {
            max_elapsed: Some(Duration::from_secs(10)),
            ..TurnBudgetOverrides::default()
        });
        assert!(budget.check_elapsed(Duration::from_secs(10)).is_ok());
        assert_eq!(
            budget
                .check_elapsed(Duration::from_secs(11))
                .unwrap_err()
                .kind,
            BudgetErrorKind::ElapsedTime
        );
    }

    #[test]
    fn caller_overrides_can_only_tighten_runtime_limits() {
        let budget = TurnBudget::with_overrides(TurnBudgetOverrides {
            max_tool_rounds: Some(1_000),
            max_calls_per_round: Some(2),
            max_total_tool_calls: Some(1_000),
            max_model_requests: Some(1_000),
            repeat_warning_at: Some(100),
            repeat_finalize_at: Some(2),
            max_elapsed: None,
        });

        assert_eq!(budget.max_tool_rounds(), 8);
        assert_eq!(budget.max_calls_per_round(), 2);
        assert_eq!(budget.max_total_tool_calls(), 32);
        assert_eq!(budget.max_model_requests(), 10);
        assert_eq!(budget.repeat_warning_at(), 2);
        assert_eq!(budget.repeat_finalize_at(), 2);
    }
}
