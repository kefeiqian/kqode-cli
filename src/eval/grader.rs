//! Grading abstraction over a completed samples file.
//!
//! The runner writes one `samples.jsonl` (all task ids) and hands it to a
//! [`Grader`]; the injected seam keeps unit tests hermetic while the real
//! [`EvalPlusGrader`] shells out to the isolated container.

use std::path::Path;

use super::{EvalBenchmark, EvalError};

mod evalplus;

pub use evalplus::EvalPlusGrader;

/// Per-task grading outcome parsed from an EvalPlus results file.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TaskResult {
    /// EvalPlus task id (e.g. `HumanEval/0`).
    pub task_id: String,
    /// Passed the base test suite.
    pub base_passed: bool,
    /// Passed the augmented (`+`) test suite — the rigorous pass@1 signal.
    pub plus_passed: bool,
}

/// All per-task outcomes from one grading pass.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct GradeReport {
    /// One entry per task present in the results file, sorted by task id.
    pub results: Vec<TaskResult>,
}

impl GradeReport {
    /// Looks up one task's outcome by id.
    #[must_use]
    pub fn get(&self, task_id: &str) -> Option<&TaskResult> {
        self.results.iter().find(|result| result.task_id == task_id)
    }

    /// Count of tasks passing the augmented (`plus`) suite.
    #[must_use]
    pub fn plus_passed_count(&self) -> usize {
        self.results
            .iter()
            .filter(|result| result.plus_passed)
            .count()
    }

    /// Count of tasks passing the base suite.
    #[must_use]
    pub fn base_passed_count(&self) -> usize {
        self.results
            .iter()
            .filter(|result| result.base_passed)
            .count()
    }

    /// Number of graded tasks.
    #[must_use]
    pub fn len(&self) -> usize {
        self.results.len()
    }

    /// Whether no tasks were graded.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.results.is_empty()
    }
}

/// Grades a completed samples file for one benchmark.
///
/// `run_dir` holds `samples_file` (relative) and receives grader outputs;
/// implementations must execute untrusted model code only in isolation.
pub trait Grader {
    /// Sanitizes and grades `samples_file`, returning per-task outcomes.
    ///
    /// # Errors
    ///
    /// Returns an [`EvalError`] when grading cannot run or its output cannot be
    /// parsed.
    fn grade(
        &self,
        benchmark: EvalBenchmark,
        run_dir: &Path,
        samples_file: &str,
    ) -> Result<GradeReport, EvalError>;
}

/// Parses an EvalPlus `*_eval_results.json` document into a [`GradeReport`].
///
/// The file's `eval` object maps each task id to a one-element array whose entry
/// carries `base_status` / `plus_status` (`"pass"`/`"fail"`). Results are sorted
/// by task id for deterministic reporting.
///
/// # Errors
///
/// Returns [`EvalError::Parse`] when the document is not valid JSON or lacks the
/// expected `eval` object shape.
pub fn parse_eval_results(json: &str) -> Result<GradeReport, EvalError> {
    let document: serde_json::Value = serde_json::from_str(json)
        .map_err(|error| EvalError::Parse(format!("eval results: {error}")))?;
    let eval = document
        .get("eval")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| EvalError::Parse("eval results missing `eval` object".to_owned()))?;

    let mut results = Vec::with_capacity(eval.len());
    for (task_id, entries) in eval {
        let first = entries
            .as_array()
            .and_then(|array| array.first())
            .ok_or_else(|| EvalError::Parse(format!("task {task_id}: empty results array")))?;
        results.push(TaskResult {
            task_id: task_id.clone(),
            base_passed: status_is_pass(first, "base_status"),
            plus_passed: status_is_pass(first, "plus_status"),
        });
    }
    results.sort_by(|left, right| left.task_id.cmp(&right.task_id));
    Ok(GradeReport { results })
}

fn status_is_pass(entry: &serde_json::Value, key: &str) -> bool {
    entry.get(key).and_then(serde_json::Value::as_str) == Some("pass")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors the real EvalPlus results shape captured during the Phase 2 spike.
    const RESULTS: &str = r#"{
        "date": "2026-07-12 12:45",
        "hash": "abc",
        "eval": {
            "HumanEval/1": [{"task_id":"HumanEval/1","base_status":"pass","plus_status":"pass"}],
            "HumanEval/0": [{"task_id":"HumanEval/0","base_status":"pass","plus_status":"fail"}]
        }
    }"#;

    #[test]
    fn parses_results_and_sorts_by_task_id() {
        let report = parse_eval_results(RESULTS).unwrap();
        assert_eq!(report.len(), 2);
        assert_eq!(report.results[0].task_id, "HumanEval/0");
        assert!(report.get("HumanEval/0").unwrap().base_passed);
        assert!(!report.get("HumanEval/0").unwrap().plus_passed);
        assert_eq!(report.plus_passed_count(), 1);
        assert_eq!(report.base_passed_count(), 2);
    }

    #[test]
    fn missing_eval_object_is_a_parse_error() {
        assert!(matches!(
            parse_eval_results("{\"date\":\"x\"}"),
            Err(EvalError::Parse(_))
        ));
        assert!(matches!(
            parse_eval_results("{not json"),
            Err(EvalError::Parse(_))
        ));
    }

    #[test]
    fn empty_task_array_is_a_parse_error() {
        let json = r#"{"eval":{"HumanEval/0":[]}}"#;
        assert!(matches!(parse_eval_results(json), Err(EvalError::Parse(_))));
    }
}
