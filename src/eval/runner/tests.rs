use std::cell::RefCell;
use std::fs;

use super::*;
use crate::eval::{GradeReport, TaskResult};

/// Fake driver: records prompts, returns a canned solution, and can fail on a
/// chosen 0-based call index to exercise the errored path.
struct FakeDriver {
    solution: String,
    fail_on: Option<usize>,
    calls: RefCell<usize>,
    seen: RefCell<Vec<String>>,
}

impl FakeDriver {
    fn new(solution: &str, fail_on: Option<usize>) -> Self {
        Self {
            solution: solution.to_owned(),
            fail_on,
            calls: RefCell::new(0),
            seen: RefCell::new(Vec::new()),
        }
    }
}

impl ModelDriver for FakeDriver {
    fn drive(&self, prompt: &str) -> Result<DriveOutput, EvalError> {
        let index = *self.calls.borrow();
        *self.calls.borrow_mut() += 1;
        self.seen.borrow_mut().push(prompt.to_owned());
        if self.fail_on == Some(index) {
            return Err(EvalError::Process("boom".to_owned()));
        }
        Ok(DriveOutput {
            solution: self.solution.clone(),
            input_tokens: 10,
            output_tokens: 5,
        })
    }
}

/// Fake grader mimicking EvalPlus: reads the written samples and passes any task
/// whose solution is non-empty (empty = un-driven/errored filler → fail).
struct FakeGrader;

impl Grader for FakeGrader {
    fn grade(
        &self,
        _benchmark: EvalBenchmark,
        run_dir: &Path,
        samples_file: &str,
    ) -> Result<GradeReport, EvalError> {
        let content = fs::read_to_string(run_dir.join(samples_file))
            .map_err(|error| EvalError::Io(error.to_string()))?;
        let mut results = Vec::new();
        for line in content.lines() {
            let value: serde_json::Value =
                serde_json::from_str(line).map_err(|error| EvalError::Parse(error.to_string()))?;
            let id = value["task_id"].as_str().unwrap_or_default().to_owned();
            let passed = !value["solution"].as_str().unwrap_or_default().is_empty();
            results.push(TaskResult {
                task_id: id,
                base_passed: passed,
                plus_passed: passed,
            });
        }
        Ok(GradeReport { results })
    }
}

fn tasks(count: usize) -> Vec<Task> {
    (0..count)
        .map(|index| Task {
            id: format!("HumanEval/{index}"),
            prompt: format!("def task_{index}():"),
        })
        .collect()
}

fn config() -> RunConfigBase {
    RunConfigBase {
        kqode_commit: Some("abc".to_owned()),
        provider: "kimi".to_owned(),
        model: "kimi-k2.7-code".to_owned(),
        temperature: Some(0.0),
        seed: Some(7),
        grader_image_digest: None,
        prompt_mode: "eval".to_owned(),
    }
}

#[test]
fn drives_all_tasks_and_writes_artifacts() {
    let dir = tempfile::tempdir().unwrap();
    let driver = FakeDriver::new("solution", None);
    let summary = run_benchmark(
        EvalBenchmark::HumanEvalPlus,
        &tasks(2),
        None,
        &driver,
        &FakeGrader,
        dir.path(),
        &config(),
    )
    .unwrap();

    assert_eq!(summary.metrics.tasks_total, 2);
    assert_eq!(summary.metrics.tasks_attempted, 2);
    assert_eq!(summary.metrics.tasks_succeeded, 2);
    assert!((summary.metrics.pass_rate - 1.0).abs() < 1e-9);
    assert_eq!(summary.metrics.input_tokens, 20);

    let run_dir = dir.path().join(&summary.run_id);
    for name in [
        "samples.jsonl",
        "summary.json",
        "summary.md",
        "results.jsonl",
    ] {
        assert!(run_dir.join(name).exists(), "missing {name}");
    }
    // The driver is handed the completion instruction, not the bare stub.
    assert!(driver.seen.borrow()[0].contains("```python code block"));
    assert!(driver.seen.borrow()[0].contains("def task_0():"));
}

#[test]
fn limit_drives_subset_but_writes_all_task_ids() {
    let dir = tempfile::tempdir().unwrap();
    let driver = FakeDriver::new("solution", None);
    let summary = run_benchmark(
        EvalBenchmark::HumanEvalPlus,
        &tasks(3),
        Some(1),
        &driver,
        &FakeGrader,
        dir.path(),
        &config(),
    )
    .unwrap();

    // Only one task driven, but the samples file must carry all three ids so the
    // real grader's full-coverage assertion holds.
    assert_eq!(summary.metrics.tasks_total, 1);
    assert_eq!(*driver.calls.borrow(), 1);
    let samples =
        fs::read_to_string(dir.path().join(&summary.run_id).join("samples.jsonl")).unwrap();
    assert_eq!(samples.lines().count(), 3);
}

#[test]
fn drive_failure_is_recorded_errored_and_run_continues() {
    let dir = tempfile::tempdir().unwrap();
    // Fail the first of two drives.
    let driver = FakeDriver::new("solution", Some(0));
    let summary = run_benchmark(
        EvalBenchmark::HumanEvalPlus,
        &tasks(2),
        None,
        &driver,
        &FakeGrader,
        dir.path(),
        &config(),
    )
    .unwrap();

    assert_eq!(summary.metrics.tasks_total, 2);
    assert_eq!(summary.metrics.tasks_errored, 1);
    assert_eq!(summary.metrics.tasks_attempted, 1);
    assert_eq!(summary.metrics.tasks_succeeded, 1);
    assert!((summary.metrics.pass_rate - 1.0).abs() < 1e-9);
}
