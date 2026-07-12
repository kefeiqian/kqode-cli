//! Metrics computed over the tasks a run actually drove.
//!
//! The grader returns outcomes for every task id in the samples file (including
//! placeholder fills for un-driven or errored tasks); metrics are computed over
//! the *driven* subset so `pass_rate` reflects what KQode attempted, not the
//! filler. `pass_rate` uses the augmented (`plus`) suite — the rigorous signal.

use std::collections::HashSet;

use serde::Serialize;

use super::GradeReport;

/// Aggregate run metrics. `pass_rate` = succeeded / attempted (0 when nothing
/// was attempted); `base_pass_rate` is the same over the base suite.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Metrics {
    /// Augmented-suite pass rate over attempted tasks.
    pub pass_rate: f64,
    /// Base-suite pass rate over attempted tasks.
    pub base_pass_rate: f64,
    /// Tasks the run chose to drive (full set, or the `--limit` subset).
    pub tasks_total: usize,
    /// Driven tasks that produced a completion and were graded.
    pub tasks_attempted: usize,
    /// Attempted tasks passing the augmented suite.
    pub tasks_succeeded: usize,
    /// Driven tasks whose model drive failed (no completion).
    pub tasks_errored: usize,
    /// Wall-clock seconds for the whole run.
    pub runtime_seconds: f64,
    /// Prompt tokens summed across attempted tasks.
    pub input_tokens: u64,
    /// Completion tokens summed across attempted tasks.
    pub output_tokens: u64,
}

/// Computes [`Metrics`] over the driven task ids.
///
/// `errored` is the subset of `driven` whose drive failed. Grading outcomes come
/// from `report`; tokens and `runtime_seconds` are accumulated by the runner.
#[must_use]
pub fn compute(
    driven: &[String],
    errored: &HashSet<String>,
    report: &GradeReport,
    runtime_seconds: f64,
    input_tokens: u64,
    output_tokens: u64,
) -> Metrics {
    let total = driven.len();
    let errored_count = driven.iter().filter(|id| errored.contains(*id)).count();
    let attempted = total - errored_count;

    let mut succeeded = 0usize;
    let mut base_succeeded = 0usize;
    for id in driven {
        if errored.contains(id) {
            continue;
        }
        if let Some(result) = report.get(id) {
            if result.plus_passed {
                succeeded += 1;
            }
            if result.base_passed {
                base_succeeded += 1;
            }
        }
    }

    Metrics {
        pass_rate: rate(succeeded, attempted),
        base_pass_rate: rate(base_succeeded, attempted),
        tasks_total: total,
        tasks_attempted: attempted,
        tasks_succeeded: succeeded,
        tasks_errored: errored_count,
        runtime_seconds,
        input_tokens,
        output_tokens,
    }
}

/// `numerator / denominator`, or `0.0` when the denominator is zero.
fn rate(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eval::TaskResult;

    fn report() -> GradeReport {
        GradeReport {
            results: vec![
                TaskResult {
                    task_id: "A".to_owned(),
                    base_passed: true,
                    plus_passed: true,
                },
                TaskResult {
                    task_id: "B".to_owned(),
                    base_passed: true,
                    plus_passed: false,
                },
                TaskResult {
                    task_id: "C".to_owned(),
                    base_passed: false,
                    plus_passed: false,
                },
            ],
        }
    }

    #[test]
    fn pass_rate_is_over_attempted_not_errored() {
        let driven = vec!["A".to_owned(), "B".to_owned(), "C".to_owned()];
        let errored: HashSet<String> = ["C".to_owned()].into_iter().collect();
        let metrics = compute(&driven, &errored, &report(), 12.0, 100, 50);
        // C errored → attempted = 2 (A, B); A plus-passes → 1/2.
        assert_eq!(metrics.tasks_total, 3);
        assert_eq!(metrics.tasks_errored, 1);
        assert_eq!(metrics.tasks_attempted, 2);
        assert_eq!(metrics.tasks_succeeded, 1);
        assert!((metrics.pass_rate - 0.5).abs() < 1e-9);
        assert!((metrics.base_pass_rate - 1.0).abs() < 1e-9);
        assert_eq!(metrics.input_tokens, 100);
    }

    #[test]
    fn all_errored_yields_zero_pass_rate_no_div_by_zero() {
        let driven = vec!["A".to_owned()];
        let errored: HashSet<String> = ["A".to_owned()].into_iter().collect();
        let metrics = compute(&driven, &errored, &report(), 1.0, 0, 0);
        assert_eq!(metrics.tasks_attempted, 0);
        assert_eq!(metrics.pass_rate, 0.0);
    }
}
